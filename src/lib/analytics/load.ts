import "server-only";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { membershipCounts } from "@/lib/membership/load";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import {
  change,
  completeMonths,
  describe,
  inWindow,
  periodTotals,
  rank,
  ratio,
  seriesByMonth,
  trend,
  windows,
  type Change,
  type Highlight,
  type RangeMonths,
} from "./rules";

/**
 * Analytics loaders: one per area, each returning the same simple shape —
 * headline numbers, one or two series, ranked lists and highlights.
 */

export type Kpi = { label: string; value: string; change?: Change; goodWhen?: "up" | "down"; hint?: string };
export type Series = { label: string; values: number[] };

const DAY = 86_400_000;
const n = (v: number) => v.toLocaleString("en-IN");

// ─── Members ─────────────────────────────────────────────────────────────────

export async function memberAnalytics(months: RangeMonths) {
  const w = windows(months);
  const [counts, terms, expiringSoon, attended, volunteered] = await Promise.all([
    membershipCounts(),
    db.membership.findMany({
      where: { status: "ACTIVE", endDate: { gte: w.prevStart } },
      select: { userId: true, startDate: true, endDate: true, isRenewal: true },
    }),
    db.membership.count({ where: { status: "ACTIVE", endDate: { gte: w.now, lt: new Date(w.now.getTime() + 30 * DAY) } } }),
    db.ticket.findMany({
      where: { checkedInAt: { gte: w.start, lt: w.end }, order: { buyerId: { not: null } } },
      select: { order: { select: { buyerId: true } } },
    }),
    db.task.findMany({ where: { status: "DONE", completedAt: { gte: w.start, lt: w.end } }, select: { assigneeId: true } }),
  ]);

  const joins = terms.filter((t) => !t.isRenewal);
  const renewals = terms.filter((t) => t.isRenewal);
  const newMembers = periodTotals(joins, (t) => t.startDate, w);
  const renewed = periodTotals(renewals, (t) => t.startDate, w);

  // Renewal rate: of the terms that ended in a window, how many were followed by another term.
  const byUser = new Map<string, typeof terms>();
  for (const t of terms) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
  const renewalRate = (from: Date, to: Date) => {
    const ended = terms.filter((t) => inWindow(t.endDate, from, to) && t.endDate! < w.now);
    const kept = ended.filter((t) =>
      byUser.get(t.userId)!.some((o) => o !== t && o.startDate && o.startDate >= new Date(t.endDate!.getTime() - 30 * DAY)),
    );
    return { rate: ratio(kept.length, ended.length), ended: ended.length };
  };
  const rr = renewalRate(w.start, w.end);
  const rrPrev = renewalRate(w.prevStart, w.start);

  // Engagement: active members who came to an event or finished a volunteer task.
  const activeIds = new Set(terms.filter((t) => t.startDate && t.startDate <= w.now && t.endDate! > w.now).map((t) => t.userId));
  const engagedIds = new Set(
    [...attended.map((a) => a.order.buyerId), ...volunteered.map((v) => v.assigneeId)].filter(
      (id): id is string => !!id && activeIds.has(id),
    ),
  );
  const engagement = ratio(engagedIds.size, activeIds.size);

  const newSeries = seriesByMonth(joins, (t) => t.startDate, w);
  const renewSeries = seriesByMonth(renewals, (t) => t.startDate, w);

  const kpis: Kpi[] = [
    { label: "Active members", value: n(counts.active) },
    { label: "New members", value: n(newMembers.current), change: change(newMembers.current, newMembers.previous) },
    {
      label: "Renewal rate",
      value: rr.ended ? `${rr.rate}%` : "—",
      change: rr.ended && rrPrev.ended ? change(rr.rate, rrPrev.rate) : undefined,
      hint: `${n(rr.ended)} memberships ended`,
    },
    { label: "Expiring in 30 days", value: n(expiringSoon), goodWhen: "down" },
  ];

  const highlights: Highlight[] = [describe("New members", change(newMembers.current, newMembers.previous), { months })];
  if (rr.ended) {
    highlights.push({
      text: `${rr.rate}% of members whose membership ended in this period renewed.`,
      tone: rr.rate >= 60 ? "good" : rr.rate >= 40 ? "neutral" : "bad",
    });
  }
  highlights.push({
    text: `${engagement}% of active members came to an event or volunteered in this period (${n(engagedIds.size)} of ${n(activeIds.size)}).`,
    tone: engagement >= 50 ? "good" : engagement >= 25 ? "neutral" : "bad",
  });
  if (expiringSoon) highlights.push({ text: `${n(expiringSoon)} memberships expire in the next 30 days.`, tone: "bad" });

  return {
    kpis,
    chart: {
      labels: newSeries.map((s) => s.label),
      series: [
        { label: "New members", values: newSeries.map((s) => s.value) },
        { label: "Renewals", values: renewSeries.map((s) => s.value) },
      ] satisfies Series[],
    },
    renewed,
    engagement: { engaged: engagedIds.size, active: activeIds.size, pct: engagement },
    highlights,
  };
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function eventAnalytics(months: RangeMonths) {
  const w = windows(months);
  const tickets = await db.ticket.findMany({
    where: { status: "VALID", OR: [{ createdAt: { gte: w.prevStart } }, { event: { endsAt: { gte: w.prevStart } } }] },
    select: { createdAt: true, checkedInAt: true, pricePaise: true, eventId: true, event: { select: { title: true, endsAt: true } } },
  });

  const sold = periodTotals(tickets, (t) => t.createdAt, w);
  const revenue = periodTotals(
    tickets,
    (t) => t.createdAt,
    w,
    (t) => t.pricePaise,
  );

  // Attendance only counts events that have already finished.
  const finished = (from: Date, to: Date) => tickets.filter((t) => inWindow(t.event.endsAt, from, to) && t.event.endsAt < w.now);
  const att = (rows: typeof tickets) => ({ valid: rows.length, came: rows.filter((t) => t.checkedInAt).length });
  const cur = att(finished(w.start, w.end));
  const prev = att(finished(w.prevStart, w.start));
  const rate = ratio(cur.came, cur.valid);

  const perEvent = new Map<string, { title: string; sold: number; came: number; revenue: number }>();
  for (const t of finished(w.start, w.end)) {
    const e = perEvent.get(t.eventId) ?? { title: t.event.title, sold: 0, came: 0, revenue: 0 };
    e.sold++;
    if (t.checkedInAt) e.came++;
    e.revenue += t.pricePaise;
    perEvent.set(t.eventId, e);
  }
  const top = [...perEvent.entries()]
    .map(([id, e]) => ({ id, ...e, noShowPct: 100 - ratio(e.came, e.sold) }))
    .sort((a, b) => b.came - a.came)
    .slice(0, 6);

  const series = seriesByMonth(tickets, (t) => t.createdAt, w);
  const salesTrend = trend(completeMonths(series));

  const kpis: Kpi[] = [
    { label: "Tickets sold", value: n(sold.current), change: change(sold.current, sold.previous) },
    { label: "Ticket revenue", value: formatINR(revenue.current), change: change(revenue.current, revenue.previous) },
    {
      label: "Attendance",
      value: cur.valid ? `${rate}%` : "—",
      change: cur.valid && prev.valid ? change(rate, ratio(prev.came, prev.valid)) : undefined,
      hint: "of tickets at finished events",
    },
    { label: "No-shows", value: n(cur.valid - cur.came), goodWhen: "down", hint: "tickets not scanned" },
  ];

  const highlights: Highlight[] = [describe("Tickets sold", change(sold.current, sold.previous), { months })];
  if (salesTrend !== "steady")
    highlights.push({ text: `Ticket sales have been ${salesTrend} month on month.`, tone: salesTrend === "rising" ? "good" : "bad" });
  if (cur.valid) {
    highlights.push({
      text: `${100 - rate}% of ticket holders didn't show up (${n(cur.valid - cur.came)} tickets).`,
      tone: rate >= 85 ? "good" : rate >= 70 ? "neutral" : "bad",
    });
  }
  const worst = [...top].filter((e) => e.sold >= 20).sort((a, b) => b.noShowPct - a.noShowPct)[0];
  if (worst && worst.noShowPct >= 25) highlights.push({ text: `Most no-shows: ${worst.title} (${worst.noShowPct}%).`, tone: "bad" });

  return {
    kpis,
    chart: {
      labels: series.map((s) => s.label),
      series: [{ label: "Tickets sold", values: series.map((s) => s.value) }] satisfies Series[],
    },
    top,
    highlights,
  };
}

// ─── Merchandise ─────────────────────────────────────────────────────────────

export async function merchAnalytics(months: RangeMonths) {
  const w = windows(months);
  const [items, lowStock] = await Promise.all([
    db.merchOrderItem.findMany({
      where: { order: { status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: w.prevStart } } },
      select: {
        quantity: true,
        unitPricePaise: true,
        order: { select: { createdAt: true } },
        variant: { select: { size: true, product: { select: { name: true } } } },
      },
    }),
    db.productVariant.findMany({
      where: { isActive: true, product: { status: "ACTIVE" }, stock: { lte: db.productVariant.fields.reorderLevel } },
      select: { id: true, size: true, color: true, stock: true, reorderLevel: true, product: { select: { name: true } } },
      orderBy: { stock: "asc" },
    }),
  ]);

  const at = (i: (typeof items)[number]) => i.order.createdAt;
  const units = periodTotals(items, at, w, (i) => i.quantity);
  const revenue = periodTotals(items, at, w, (i) => i.quantity * i.unitPricePaise);
  const current = items.filter((i) => inWindow(at(i), w.start, w.end));
  const products = rank(
    current.map((i) => ({ key: i.variant.product.name, value: i.quantity })),
    6,
  );
  const sizes = rank(
    current.map((i) => ({ key: i.variant.size, value: i.quantity })),
    8,
  );
  const series = seriesByMonth(items, at, w, (i) => i.quantity);

  const kpis: Kpi[] = [
    { label: "Items sold", value: n(units.current), change: change(units.current, units.previous) },
    { label: "Merch revenue", value: formatINR(revenue.current), change: change(revenue.current, revenue.previous) },
    { label: "Best seller", value: products[0]?.key ?? "—", hint: products[0] ? `${n(products[0].value)} sold` : undefined },
    { label: "Sizes running low", value: n(lowStock.length), goodWhen: "down" },
  ];

  const highlights: Highlight[] = [describe("Merch sales", change(units.current, units.previous), { months })];
  if (sizes[0]) highlights.push({ text: `Size ${sizes[0].key} is the most popular — ${sizes[0].pct}% of items sold.`, tone: "neutral" });
  for (const v of lowStock.slice(0, 2)) {
    highlights.push({
      text: `${v.product.name} (${v.color}, ${v.size}) has ${v.stock} left — at or below its reorder level of ${v.reorderLevel}.`,
      tone: "bad",
    });
  }

  return {
    kpis,
    chart: { labels: series.map((s) => s.label), series: [{ label: "Items sold", values: series.map((s) => s.value) }] satisfies Series[] },
    products,
    sizes,
    lowStock: lowStock.slice(0, 6),
    highlights,
  };
}

// ─── Volunteers ──────────────────────────────────────────────────────────────

export async function volunteerAnalytics(months: RangeMonths) {
  const w = windows(months);
  const [tasks, profiles] = await Promise.all([
    db.task.findMany({
      where: { OR: [{ completedAt: { gte: w.prevStart } }, { status: { not: "DONE" } }] },
      select: { status: true, completedAt: true, loggedHours: true, estimatedHours: true, dueAt: true, assigneeId: true },
    }),
    db.volunteerProfile.findMany({
      where: { isActive: true },
      select: { userId: true, maxHoursPerWeek: true, user: { select: { name: true } } },
    }),
  ]);

  const done = tasks.filter((t) => t.status === "DONE");
  const doneCount = periodTotals(done, (t) => t.completedAt, w);
  const hours = periodTotals(
    done,
    (t) => t.completedAt,
    w,
    (t) => t.loggedHours || t.estimatedHours || 0,
  );
  const people = (from: Date, to: Date) =>
    new Set(done.filter((t) => inWindow(t.completedAt, from, to) && t.assigneeId).map((t) => t.assigneeId)).size;
  const active = { current: people(w.start, w.end), previous: people(w.prevStart, w.prevEnd) };
  const overdue = tasks.filter((t) => t.status !== "DONE" && t.dueAt && t.dueAt < w.now).length;
  const participation = ratio(active.current, profiles.length);

  // Workload: hours of open work each person holds against what they said they can give per week.
  const open = new Map<string, number>();
  for (const t of tasks)
    if (t.status !== "DONE" && t.assigneeId) open.set(t.assigneeId, (open.get(t.assigneeId) ?? 0) + (t.estimatedHours ?? 2));
  const workload = profiles
    .filter((p) => open.has(p.userId))
    .map((p) => ({ name: p.user.name, hours: open.get(p.userId)!, max: p.maxHoursPerWeek }))
    .sort((a, b) => b.hours / b.max - a.hours / a.max)
    .slice(0, 6);
  const overloaded = profiles.filter((p) => (open.get(p.userId) ?? 0) > p.maxHoursPerWeek).length;
  const idle = profiles.length - open.size;

  const series = seriesByMonth(done, (t) => t.completedAt, w);
  const kpis: Kpi[] = [
    {
      label: "Active volunteers",
      value: n(active.current),
      change: change(active.current, active.previous),
      hint: `${participation}% of ${n(profiles.length)} signed up`,
    },
    { label: "Tasks done", value: n(doneCount.current), change: change(doneCount.current, doneCount.previous) },
    { label: "Hours given", value: n(Math.round(hours.current)), change: change(hours.current, hours.previous) },
    { label: "Overdue tasks", value: n(overdue), goodWhen: "down" },
  ];

  const highlights: Highlight[] = [
    describe("Volunteer participation", change(active.current, active.previous), { months }),
    {
      text: `${participation}% of signed-up volunteers finished at least one task in this period.`,
      tone: participation >= 50 ? "good" : participation >= 25 ? "neutral" : "bad",
    },
  ];
  if (overloaded)
    highlights.push({
      text: `${plural(overloaded, "volunteer")} ${overloaded === 1 ? "holds" : "hold"} more open work than their weekly hours.`,
      tone: "bad",
    });
  if (idle > 0)
    highlights.push({
      text: `${plural(idle, "volunteer")} ${idle === 1 ? "has" : "have"} no open tasks — they could take new work.`,
      tone: "neutral",
    });

  return {
    kpis,
    chart: { labels: series.map((s) => s.label), series: [{ label: "Tasks done", values: series.map((s) => s.value) }] satisfies Series[] },
    workload,
    highlights,
  };
}

// ─── Finance ─────────────────────────────────────────────────────────────────

export async function financeAnalytics(months: RangeMonths) {
  const w = windows(months);
  const monthStart = new Date(w.now.getFullYear(), w.now.getMonth(), 1);
  const [payments, expenses, budgets] = await Promise.all([
    db.payment.findMany({ where: { status: "PAID", paidAt: { gte: w.prevStart } }, select: { paidAt: true, amountPaise: true } }),
    db.expense.findMany({
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: w.prevStart } },
      select: { spentAt: true, amountPaise: true, category: true },
    }),
    db.budget.findMany({ orderBy: { category: "asc" } }),
  ]);

  const income = periodTotals(
    payments,
    (p) => p.paidAt,
    w,
    (p) => p.amountPaise,
  );
  const spent = periodTotals(
    expenses,
    (e) => e.spentAt,
    w,
    (e) => e.amountPaise,
  );
  const net = { current: income.current - spent.current, previous: income.previous - spent.previous };
  const categories = rank(
    expenses.filter((e) => inWindow(e.spentAt, w.start, w.end)).map((e) => ({ key: e.category, value: e.amountPaise })),
    10,
  );

  const thisMonth = new Map<string, number>();
  for (const e of expenses) if (e.spentAt >= monthStart) thisMonth.set(e.category, (thisMonth.get(e.category) ?? 0) + e.amountPaise);
  const budgetRows = budgets.map((b) => ({
    category: b.category,
    limit: b.monthlyPaise,
    spent: thisMonth.get(b.category) ?? 0,
    pct: ratio(thisMonth.get(b.category) ?? 0, b.monthlyPaise),
  }));

  const inSeries = seriesByMonth(
    payments,
    (p) => p.paidAt,
    w,
    (p) => p.amountPaise,
  );
  const outSeries = seriesByMonth(
    expenses,
    (e) => e.spentAt,
    w,
    (e) => e.amountPaise,
  );
  const spendTrend = trend(completeMonths(outSeries));

  const kpis: Kpi[] = [
    { label: "Money in", value: formatINR(income.current), change: change(income.current, income.previous) },
    { label: "Money out", value: formatINR(spent.current), change: change(spent.current, spent.previous), goodWhen: "down" },
    { label: "Net cash flow", value: formatINR(net.current), change: change(net.current, net.previous) },
    { label: "Biggest cost", value: categories[0]?.key ?? "—", hint: categories[0] ? `${categories[0].pct}% of spending` : undefined },
  ];

  const highlights: Highlight[] = [
    describe("Income", change(income.current, income.previous), { months }),
    describe("Spending", change(spent.current, spent.previous), { months, goodWhen: "down" }),
    net.current >= 0
      ? { text: `We kept ${formatINR(net.current)} more than we spent in this period.`, tone: "good" }
      : { text: `We spent ${formatINR(-net.current)} more than came in during this period.`, tone: "bad" },
  ];
  if (spendTrend === "rising") highlights.push({ text: "Spending has been rising month on month.", tone: "bad" });
  for (const b of budgetRows.filter((b) => b.pct >= 90)) {
    highlights.push({
      text: `${b.category}: ${formatINR(b.spent)} of the ${formatINR(b.limit)} monthly budget used (${b.pct}%).`,
      tone: "bad",
    });
  }

  return {
    kpis,
    chart: {
      labels: inSeries.map((s) => s.label),
      series: [
        { label: "Money in", values: inSeries.map((s) => s.value) },
        { label: "Money out", values: outSeries.map((s) => s.value) },
      ] satisfies Series[],
    },
    categories,
    budgets: budgetRows,
    highlights,
  };
}
