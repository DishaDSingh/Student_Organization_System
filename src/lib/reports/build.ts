import "server-only";
import { db } from "@/lib/db";
import { fmtDate, plural } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { raisedByFundraiser } from "@/lib/fundraisers";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import { rank } from "@/lib/analytics/rules";
import { PERIODS, bullets, periodRange, vsPrevious, type PeriodKey, type ReportType, type Section } from "./types";

/**
 * Builds a report from live data. The text is plain and factual; when AI is
 * available it may rewrite the prose (see ai.ts) but never the numbers.
 */

export type Built = { title: string; sections: Section[]; subjectId?: string; from?: Date; to?: Date };

const DAY = 86_400_000;
const TODO = (what: string) => `(Add ${what} — this part needs people's judgement.)`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// ─── Event ───────────────────────────────────────────────────────────────────

async function eventReport(eventId: string): Promise<Built> {
  const e = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      capacity: true,
      allocated: true,
      status: true,
      ticketTypes: { select: { name: true, allocated: true, quantity: true } },
      incidents: { select: { title: true, severity: true, resolvedAt: true } },
    },
  });
  const [tickets, payments, expenses, tasks] = await Promise.all([
    db.ticket.findMany({ where: { eventId, status: "VALID" }, select: { checkedInAt: true, isMemberPrice: true, pricePaise: true } }),
    db.payment.aggregate({ where: { status: "PAID", purpose: "TICKET", ticketOrder: { eventId } }, _sum: { amountPaise: true } }),
    db.expense.findMany({ where: { eventId, status: { in: [...SPENT_STATUSES] } }, select: { category: true, amountPaise: true } }),
    db.task.findMany({ where: { eventId }, select: { status: true, loggedHours: true, assigneeId: true } }),
  ]);
  const sold = tickets.length;
  const came = tickets.filter((t) => t.checkedInAt).length;
  const members = tickets.filter((t) => t.isMemberPrice).length;
  const revenue = payments._sum.amountPaise ?? 0;
  const cost = expenses.reduce((s, x) => s + x.amountPaise, 0);
  const net = revenue - cost;
  const noShow = sold ? 100 - pct(came, sold) : 0;
  const finished = e.endsAt < new Date();
  const helpers = new Set(tasks.filter((t) => t.assigneeId).map((t) => t.assigneeId)).size;
  const hours = tasks.reduce((s, t) => s + t.loggedHours, 0);
  const costLines = rank(expenses.map((x) => ({ key: x.category, value: x.amountPaise })));

  const recs = [
    finished && noShow >= 25 && `${noShow}% of ticket holders didn't come — send a reminder 24 hours before next time.`,
    sold >= e.capacity * 0.95 && "It sold out — consider a bigger venue or a waitlist next time.",
    sold < e.capacity * 0.5 && "Less than half the seats sold — start promotion earlier or review pricing.",
    net < 0 && "The event lost money — agree a budget before booking next time.",
    e.incidents.some((i) => !i.resolvedAt) && "Some incidents are still open — close them out.",
  ].filter(Boolean) as string[];

  return {
    title: `${e.title} — report`,
    subjectId: e.id,
    sections: [
      {
        heading: "Executive summary",
        body: `${e.title} took place at ${e.venue} on ${fmtDate(e.startsAt)}. ${sold} tickets were sold (${pct(sold, e.capacity)}% of ${e.capacity} seats)${finished ? ` and ${came} people attended` : ""}. It brought in ${formatINR(revenue)} against ${formatINR(cost)} of approved costs, a net ${net >= 0 ? "surplus" : "loss"} of ${formatINR(Math.abs(net))}.`,
      },
      {
        heading: "Attendance",
        body: bullets([
          `Tickets issued: ${sold} of ${e.capacity} seats`,
          finished && `Checked in: ${came} (${pct(came, sold)}%)`,
          finished && `No-shows: ${sold - came} (${noShow}%)`,
          ...e.ticketTypes.map((t) => `${t.name}: ${t.allocated} of ${t.quantity}`),
        ]),
      },
      {
        heading: "Revenue",
        body: bullets([
          `Ticket sales: ${formatINR(revenue)}`,
          sold && `Average per ticket: ${formatINR(Math.round(revenue / sold / 100) * 100)}`,
        ]),
      },
      {
        heading: "Expenses",
        body: costLines.length
          ? bullets(costLines.map((c) => `${c.key}: ${formatINR(c.value)}`))
          : "No approved expenses are linked to this event.",
      },
      {
        heading: "Net result",
        body: `${formatINR(revenue)} in − ${formatINR(cost)} out = ${net >= 0 ? "" : "−"}${formatINR(Math.abs(net))}.`,
      },
      {
        heading: "Volunteer contribution",
        body: tasks.length
          ? `${plural(helpers, "volunteer")} worked on ${plural(tasks.length, "task")} (${tasks.filter((t) => t.status === "DONE").length} done), logging ${hours} hours.`
          : "No volunteer tasks were linked to this event.",
      },
      { heading: "Membership impact", body: `${members} of ${sold} tickets (${pct(members, sold)}%) were bought at member prices.` },
      {
        heading: "Problems encountered",
        body: e.incidents.length
          ? bullets(e.incidents.map((i) => `${i.title} (${i.severity.toLowerCase()}${i.resolvedAt ? ", resolved" : ", still open"})`))
          : "No incidents were logged.",
      },
      { heading: "Lessons learned", body: TODO("what went well and what to change") },
      { heading: "Recommendations / next steps", body: recs.length ? bullets(recs) : TODO("next steps") },
    ],
  };
}

// ─── Finance ─────────────────────────────────────────────────────────────────

async function financeReport(period: PeriodKey): Promise<Built> {
  const r = periodRange(period);
  const LABEL = {
    MEMBERSHIP: "Membership dues",
    TICKET: "Ticket sales",
    MERCH: "Merch sales",
    DONATION: "Donations",
    OTHER: "Other",
  } as const;
  const [inNow, inPrev, outNow, outPrev, budgets, owed] = await Promise.all([
    db.payment.groupBy({ by: ["purpose"], where: { status: "PAID", paidAt: { gte: r.from, lt: r.to } }, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: r.prevFrom, lt: r.prevTo } }, _sum: { amountPaise: true } }),
    db.expense.groupBy({
      by: ["category"],
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: r.from, lt: r.to } },
      _sum: { amountPaise: true },
    }),
    db.expense.groupBy({
      by: ["category"],
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: r.prevFrom, lt: r.prevTo } },
      _sum: { amountPaise: true },
    }),
    db.budget.findMany(),
    db.expense.aggregate({ where: { status: "APPROVED", needsReimbursement: true }, _count: true, _sum: { amountPaise: true } }),
  ]);
  const sum = (rows: { _sum: { amountPaise: number | null } }[]) => rows.reduce((s, x) => s + (x._sum.amountPaise ?? 0), 0);
  const income = sum(inNow);
  const spent = sum(outNow);
  const prevSpent = sum(outPrev);
  const prev = new Map(outPrev.map((o) => [o.category, o._sum.amountPaise ?? 0]));
  const changes = outNow
    .map((o) => ({ cat: o.category, now: o._sum.amountPaise ?? 0, before: prev.get(o.category) ?? 0 }))
    .map((c) => ({ ...c, diff: c.now - c.before }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);
  const months = Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / (30 * DAY)));

  return {
    title: `Finance report — ${PERIODS[period].toLowerCase()}`,
    from: r.from,
    to: r.to,
    sections: [
      {
        heading: "Summary",
        body: `From ${fmtDate(r.from)} to ${fmtDate(r.to)}, ${formatINR(income)} came in${vsPrevious(income, inPrev._sum.amountPaise ?? 0)} and ${formatINR(spent)} went out${vsPrevious(spent, prevSpent)}, leaving ${formatINR(income - spent)}.`,
      },
      {
        heading: "Income",
        body: inNow.length
          ? bullets(
              inNow
                .sort((a, b) => (b._sum.amountPaise ?? 0) - (a._sum.amountPaise ?? 0))
                .map((i) => `${LABEL[i.purpose]}: ${formatINR(i._sum.amountPaise ?? 0)}`),
            )
          : "No income in this period.",
      },
      {
        heading: "Expenses",
        body: outNow.length
          ? bullets(
              outNow
                .sort((a, b) => (b._sum.amountPaise ?? 0) - (a._sum.amountPaise ?? 0))
                .map((o) => `${o.category}: ${formatINR(o._sum.amountPaise ?? 0)}`),
            )
          : "No approved expenses in this period.",
      },
      {
        heading: "Variance",
        body: budgets.length
          ? bullets(
              budgets.map((b) => {
                const used = outNow.find((o) => o.category === b.category)?._sum.amountPaise ?? 0;
                const limit = b.monthlyPaise * months;
                return `${b.category}: ${formatINR(used)} of ${formatINR(limit)} budget (${pct(used, limit)}%)`;
              }),
            )
          : "No budgets are set, so there's nothing to compare against.",
      },
      {
        heading: "Key changes",
        body: changes.length
          ? bullets(
              changes.map(
                (c) =>
                  `${c.cat}: ${formatINR(c.now)} vs ${formatINR(c.before)} before (${c.diff >= 0 ? "+" : "−"}${formatINR(Math.abs(c.diff))})`,
              ),
            )
          : "No spending to compare.",
      },
      {
        heading: "Reimbursements",
        body: `${plural(owed._count, "approved claim")} still to pay back, ${formatINR(owed._sum.amountPaise ?? 0)} in total.`,
      },
    ],
  };
}

// ─── Membership ──────────────────────────────────────────────────────────────

async function membershipReport(period: PeriodKey): Promise<Built> {
  const r = periodRange(period);
  const now = new Date();
  const [joined, joinedPrev, renewed, ended, expiring, plans, active] = await Promise.all([
    db.membership.count({ where: { status: "ACTIVE", isRenewal: false, startDate: { gte: r.from, lt: r.to } } }),
    db.membership.count({ where: { status: "ACTIVE", isRenewal: false, startDate: { gte: r.prevFrom, lt: r.prevTo } } }),
    db.membership.count({ where: { status: "ACTIVE", isRenewal: true, startDate: { gte: r.from, lt: r.to } } }),
    db.membership.count({ where: { status: "ACTIVE", endDate: { gte: r.from, lt: r.to } } }),
    db.membership.count({ where: { status: "ACTIVE", endDate: { gte: now, lt: new Date(now.getTime() + 30 * DAY) } } }),
    db.membership.groupBy({ by: ["planId"], where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } }, _count: true }),
    db.user.count({ where: { memberships: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } } } } }),
  ]);
  const names = new Map((await db.membershipPlan.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  return {
    title: `Membership report — ${PERIODS[period].toLowerCase()}`,
    from: r.from,
    to: r.to,
    sections: [
      {
        heading: "Summary",
        body: `${active} active members today. ${joined} joined${vsPrevious(joined, joinedPrev)} and ${renewed} renewed between ${fmtDate(r.from)} and ${fmtDate(r.to)}.`,
      },
      { heading: "Growth", body: bullets([`New members: ${joined}`, `Renewals: ${renewed}`, `Memberships that ended: ${ended}`]) },
      { heading: "Expiring soon", body: `${plural(expiring, "membership")} end in the next 30 days. Send renewal reminders now.` },
      {
        heading: "Plans",
        body: bullets(plans.sort((a, b) => b._count - a._count).map((p) => `${names.get(p.planId) ?? "—"}: ${p._count} active`)),
      },
      { heading: "Next steps", body: TODO("ideas to grow membership") },
    ],
  };
}

// ─── Fundraiser ──────────────────────────────────────────────────────────────

async function fundraiserReport(id: string): Promise<Built> {
  const f = await db.fundraiser.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      title: true,
      cause: true,
      goalPaise: true,
      startsAt: true,
      endsAt: true,
      status: true,
      tasks: { select: { status: true, dueAt: true, assigneeId: true, loggedHours: true } },
    },
  });
  const [raised, donations] = await Promise.all([
    raisedByFundraiser([id]),
    db.payment.findMany({ where: { fundraiserId: id, status: "PAID" }, select: { amountPaise: true } }),
  ]);
  const r = raised.get(id) ?? 0;
  const now = new Date();
  const done = f.tasks.filter((t) => t.status === "DONE").length;
  const overdue = f.tasks.filter((t) => t.status !== "DONE" && t.dueAt && t.dueAt < now).length;
  const biggest = Math.max(0, ...donations.map((d) => d.amountPaise));
  return {
    title: `${f.title} — report`,
    subjectId: f.id,
    sections: [
      {
        heading: "Summary",
        body: `${f.title} (${f.cause}) ran from ${fmtDate(f.startsAt)} to ${fmtDate(f.endsAt)} and raised ${formatINR(r)} of its ${formatINR(f.goalPaise)} goal (${pct(r, f.goalPaise)}%).`,
      },
      {
        heading: "Donations",
        body: bullets([
          `${plural(donations.length, "donation")}`,
          donations.length && `Average gift: ${formatINR(Math.round(r / donations.length / 100) * 100)}`,
          donations.length && `Biggest gift: ${formatINR(biggest)}`,
        ]),
      },
      { heading: "Tasks", body: bullets([`${done} of ${f.tasks.length} done`, overdue && `${overdue} overdue`]) },
      {
        heading: "Volunteers",
        body: `${plural(new Set(f.tasks.map((t) => t.assigneeId).filter(Boolean)).size, "volunteer")} helped, logging ${f.tasks.reduce((s, t) => s + t.loggedHours, 0)} hours.`,
      },
      {
        heading: "Next steps",
        body: r >= f.goalPaise ? "Goal reached — thank donors and share the final numbers." : TODO("how to close the gap"),
      },
    ],
  };
}

// ─── Merch ───────────────────────────────────────────────────────────────────

async function merchReport(period: PeriodKey): Promise<Built> {
  const r = periodRange(period);
  const [items, prevUnits, low] = await Promise.all([
    db.merchOrderItem.findMany({
      where: { order: { status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: r.from, lt: r.to } } },
      select: { quantity: true, unitPricePaise: true, variant: { select: { size: true, product: { select: { name: true } } } } },
    }),
    db.merchOrderItem.aggregate({
      where: { order: { status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: r.prevFrom, lt: r.prevTo } } },
      _sum: { quantity: true },
    }),
    db.productVariant.findMany({
      where: { isActive: true, product: { status: "ACTIVE" }, stock: { lte: db.productVariant.fields.reorderLevel } },
      select: { size: true, color: true, stock: true, product: { select: { name: true } } },
    }),
  ]);
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const revenue = items.reduce((s, i) => s + i.quantity * i.unitPricePaise, 0);
  const products = rank(
    items.map((i) => ({ key: i.variant.product.name, value: i.quantity })),
    5,
  );
  const sizes = rank(
    items.map((i) => ({ key: i.variant.size, value: i.quantity })),
    6,
  );
  return {
    title: `Merchandise report — ${PERIODS[period].toLowerCase()}`,
    from: r.from,
    to: r.to,
    sections: [
      { heading: "Summary", body: `${units} items sold${vsPrevious(units, prevUnits._sum.quantity ?? 0)} for ${formatINR(revenue)}.` },
      {
        heading: "Popular products",
        body: products.length ? bullets(products.map((p) => `${p.key}: ${p.value} (${p.pct}%)`)) : "No sales in this period.",
      },
      {
        heading: "Popular sizes",
        body: sizes.length ? bullets(sizes.map((s) => `${s.key}: ${s.value} (${s.pct}%)`)) : "No sales in this period.",
      },
      {
        heading: "Stock to reorder",
        body: low.length
          ? bullets(low.map((v) => `${v.product.name} ${v.color} ${v.size}: ${v.stock} left`))
          : "Every size is above its reorder level.",
      },
      { heading: "Next steps", body: TODO("restock and design plans") },
    ],
  };
}

// ─── Volunteers ──────────────────────────────────────────────────────────────

async function volunteerReport(period: PeriodKey): Promise<Built> {
  const r = periodRange(period);
  const [done, profiles, overdue] = await Promise.all([
    db.task.findMany({
      where: { status: "DONE", completedAt: { gte: r.from, lt: r.to } },
      select: { loggedHours: true, assignee: { select: { name: true } } },
    }),
    db.volunteerProfile.count({ where: { isActive: true } }),
    db.task.count({ where: { status: { not: "DONE" }, dueAt: { lt: new Date() } } }),
  ]);
  const hours = done.reduce((s, t) => s + t.loggedHours, 0);
  const people = rank(
    done.filter((t) => t.assignee).map((t) => ({ key: t.assignee!.name, value: t.loggedHours || 1 })),
    5,
  );
  const active = new Set(done.map((t) => t.assignee?.name).filter(Boolean)).size;
  return {
    title: `Volunteer report — ${PERIODS[period].toLowerCase()}`,
    from: r.from,
    to: r.to,
    sections: [
      {
        heading: "Summary",
        body: `${active} of ${profiles} volunteers (${pct(active, profiles)}%) finished ${plural(done.length, "task")} and gave ${hours} hours.`,
      },
      {
        heading: "Top contributors",
        body: people.length ? bullets(people.map((p) => `${p.key}: ${p.value} hours`)) : "No tasks were completed in this period.",
      },
      { heading: "Open problems", body: overdue ? `${plural(overdue, "task")} overdue right now.` : "No overdue tasks." },
      { heading: "Thank-yous and next steps", body: TODO("who to thank and how to recruit more help") },
    ],
  };
}

// ─── Organization summary (weekly / monthly / semester / annual) ─────────────

async function summaryReport(period: PeriodKey): Promise<Built> {
  const r = periodRange(period);
  const [joined, events, attended, income, spent, units, tasks, raised] = await Promise.all([
    db.membership.count({ where: { status: "ACTIVE", startDate: { gte: r.from, lt: r.to } } }),
    db.event.findMany({ where: { status: "PUBLISHED", startsAt: { gte: r.from, lt: r.to } }, select: { title: true } }),
    db.ticket.count({ where: { checkedInAt: { gte: r.from, lt: r.to } } }),
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: r.from, lt: r.to } }, _sum: { amountPaise: true } }),
    db.expense.aggregate({
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: r.from, lt: r.to } },
      _sum: { amountPaise: true },
    }),
    db.merchOrderItem.aggregate({
      where: { order: { status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: r.from, lt: r.to } } },
      _sum: { quantity: true },
    }),
    db.task.count({ where: { status: "DONE", completedAt: { gte: r.from, lt: r.to } } }),
    db.payment.aggregate({
      where: { status: "PAID", purpose: "DONATION", paidAt: { gte: r.from, lt: r.to } },
      _sum: { amountPaise: true },
    }),
  ]);
  const inc = income._sum.amountPaise ?? 0;
  const out = spent._sum.amountPaise ?? 0;
  return {
    title: `Organization summary — ${PERIODS[period].toLowerCase()}`,
    from: r.from,
    to: r.to,
    sections: [
      {
        heading: "In short",
        body: `Between ${fmtDate(r.from)} and ${fmtDate(r.to)}: ${plural(joined, "membership")} started, ${plural(events.length, "event")} ran with ${attended} check-ins, and the organization took in ${formatINR(inc)} while spending ${formatINR(out)}.`,
      },
      { heading: "Members", body: `${joined} new or renewed memberships.` },
      {
        heading: "Events",
        body: events.length ? bullets([...events.map((e) => e.title), `${attended} people checked in`]) : "No events in this period.",
      },
      { heading: "Money", body: bullets([`In: ${formatINR(inc)}`, `Out: ${formatINR(out)}`, `Net: ${formatINR(inc - out)}`]) },
      {
        heading: "Merch, volunteers & fundraising",
        body: bullets([
          `${units._sum.quantity ?? 0} merch items sold`,
          `${tasks} volunteer tasks completed`,
          `${formatINR(raised._sum.amountPaise ?? 0)} donated`,
        ]),
      },
      { heading: "Highlights & concerns", body: TODO("the moments worth remembering") },
    ],
  };
}

// ─── Committee handover (Phase 20) ───────────────────────────────────────────

async function handoverReport(): Promise<Built> {
  const now = new Date();
  const year = new Date(now.getTime() - 365 * DAY);
  const [active, money, upcoming, vendors, donors, tasks, reports, stock, volunteers, lessons] = await Promise.all([
    db.user.count({ where: { memberships: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } } } } }),
    Promise.all([
      db.payment.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true } }),
      db.expense.aggregate({ where: { status: { in: [...SPENT_STATUSES] } }, _sum: { amountPaise: true } }),
      db.expense.aggregate({ where: { status: "APPROVED", needsReimbursement: true }, _sum: { amountPaise: true }, _count: true }),
      db.expense.count({ where: { status: "PENDING" } }),
    ]),
    db.event.findMany({
      where: { status: "PUBLISHED", startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 8,
      select: { title: true, startsAt: true, allocated: true, capacity: true },
    }),
    db.expense.groupBy({
      by: ["vendor"],
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: year }, vendor: { not: null } },
      _sum: { amountPaise: true },
      _count: true,
    }),
    db.payment.groupBy({
      by: ["notes"],
      where: { status: "PAID", purpose: "DONATION", paidAt: { gte: year }, notes: { startsWith: "Donor:" } },
      _sum: { amountPaise: true },
    }),
    db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { dueAt: "asc" },
      take: 12,
      select: { title: true, dueAt: true, assignee: { select: { name: true } } },
    }),
    db.report.findMany({
      where: { type: { in: ["EVENT", "FUNDRAISER"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { title: true, createdAt: true },
    }),
    db.productVariant.aggregate({ where: { isActive: true }, _sum: { stock: true } }),
    db.volunteerProfile.count({ where: { isActive: true } }),
    db.report.findMany({ where: { status: "FINAL" }, select: { sections: true } }),
  ]);
  const [inc, out, owed, pending] = money;
  const learned = lessons
    .flatMap((r) => (r.sections as Section[]).filter((s) => /lesson/i.test(s.heading) && !s.body.startsWith("(Add")))
    // One lesson per line, whether it was written as a list or as prose.
    .flatMap((s) => s.body.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()))
    .filter(Boolean)
    .slice(0, 10);
  const topVendors = vendors.sort((a, b) => (b._sum.amountPaise ?? 0) - (a._sum.amountPaise ?? 0)).slice(0, 8);
  const topDonors = donors
    .map((d) => ({ name: (d.notes ?? "").replace(/^Donor: /, "").split(" · ")[0], paise: d._sum.amountPaise ?? 0 }))
    .sort((a, b) => b.paise - a.paise)
    .slice(0, 6);

  return {
    title: `Committee handover — ${fmtDate(now)}`,
    sections: [
      { heading: "Current membership", body: `${active} active members. See Members for who expires soon.` },
      {
        heading: "Financial summary",
        body: bullets([
          `All-time income: ${formatINR(inc._sum.amountPaise ?? 0)}`,
          `All-time spending: ${formatINR(out._sum.amountPaise ?? 0)}`,
          `Balance: ${formatINR((inc._sum.amountPaise ?? 0) - (out._sum.amountPaise ?? 0))}`,
          `Still to pay back: ${formatINR(owed._sum.amountPaise ?? 0)} (${plural(owed._count, "claim")})`,
          `Claims waiting for approval: ${pending}`,
        ]),
      },
      {
        heading: "Upcoming events",
        body: upcoming.length
          ? bullets(upcoming.map((e) => `${e.title} — ${fmtDate(e.startsAt)} (${e.allocated}/${e.capacity} sold)`))
          : "None scheduled.",
      },
      {
        heading: "Vendors (last 12 months)",
        body: topVendors.length
          ? bullets(topVendors.map((v) => `${v.vendor}: ${formatINR(v._sum.amountPaise ?? 0)} over ${plural(v._count, "purchase")}`))
          : "No vendors recorded.",
      },
      {
        heading: "Sponsors & major donors",
        body: topDonors.length ? bullets(topDonors.map((d) => `${d.name}: ${formatINR(d.paise)}`)) : TODO("sponsor contacts"),
      },
      {
        heading: "Pending tasks",
        body: tasks.length
          ? bullets(tasks.map((t) => `${t.title}${t.dueAt ? ` — due ${fmtDate(t.dueAt)}` : ""} (${t.assignee?.name ?? "unassigned"})`))
          : "No open tasks.",
      },
      {
        heading: "Important documents",
        body: TODO("links to the constitution, bank details holder, venue contracts, passwords handover process"),
      },
      {
        heading: "Merchandise",
        body: `${stock._sum.stock ?? 0} items in stock across all products. Check Merch → Inventory for sizes to reorder.`,
      },
      { heading: "Volunteers", body: `${volunteers} volunteers have profiles with their skills and availability.` },
      { heading: "Lessons learned", body: learned.length ? bullets(learned) : TODO("the most important lessons from this term") },
      {
        heading: "Previous event reports",
        body: reports.length
          ? bullets(reports.map((r) => `${r.title} (${fmtDate(r.createdAt)})`))
          : "No saved event reports yet — generate them from Reports.",
      },
    ],
  };
}

export async function buildReport(type: ReportType, opts: { subjectId?: string; period?: PeriodKey }): Promise<Built> {
  const period = opts.period ?? "month";
  switch (type) {
    case "EVENT":
      return eventReport(opts.subjectId!);
    case "FUNDRAISER":
      return fundraiserReport(opts.subjectId!);
    case "FINANCE":
      return financeReport(period);
    case "MEMBERSHIP":
      return membershipReport(period);
    case "MERCH":
      return merchReport(period);
    case "VOLUNTEER":
      return volunteerReport(period);
    case "SUMMARY":
      return summaryReport(period);
    case "HANDOVER":
      return handoverReport();
  }
}
