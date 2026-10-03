import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { fmtDate, people, plural } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { membershipCounts } from "@/lib/membership/load";
import { raisedByFundraiser } from "@/lib/fundraisers";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import { loadInsights } from "@/lib/insights/engine";
import { INTENT_HELP, INTENTS, PERIOD_LABEL, matchScore, periodStart, type Intent, type Route } from "./router";

/**
 * Every copilot answer is computed here from live data. Each answer lists its
 * sources (the records and pages behind the number) so people can check it.
 */

export type Answer = {
  text: string;
  table?: { columns: string[]; rows: string[][] };
  sources: { label: string; href: string }[];
};

const DAY = 86_400_000;

/** Who may ask what — the copilot never shows data you can't see elsewhere. */
const NEEDS: Record<Intent, PermissionKey[] | null> = {
  attention: null,
  active_members: ["members.view"],
  expiring_memberships: ["members.view"],
  pending_reimbursements: ["finance.view", "finance.approve_expense"],
  top_attendance: ["events.view"],
  event_money: ["events.view", "finance.view"],
  stock_left: ["merchandise.view"],
  fundraiser_progress: ["fundraisers.view"],
  finance_summary: ["finance.view"],
  upcoming_events: null,
  my_tasks: null,
  help: null,
};

export function allowed(user: CurrentUser, intent: Intent) {
  const need = NEEDS[intent];
  return !need || need.some((p) => user.permissions.has(p));
}

export async function answer(route: Route, user: CurrentUser): Promise<Answer> {
  if (!allowed(user, route.intent)) {
    return {
      text: "You don't have access to that information. Ask someone with the right role, or check your access on your profile page.",
      sources: [{ label: "My access", href: "/profile" }],
    };
  }
  const now = new Date();
  switch (route.intent) {
    case "active_members": {
      const [c, byPlan] = await Promise.all([
        membershipCounts(now),
        db.membership.groupBy({
          by: ["planId"],
          where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } },
          _count: true,
        }),
      ]);
      const plans = await db.membershipPlan.findMany({
        where: { id: { in: byPlan.map((b) => b.planId) } },
        select: { id: true, name: true },
      });
      const name = new Map(plans.map((p) => [p.id, p.name]));
      return {
        text: `We have ${c.active.toLocaleString("en-IN")} active members. ${c.expiringThisWeek} expire this week and ${c.pending} sign-ups are waiting for payment confirmation.`,
        table: {
          columns: ["Plan", "Active terms"],
          rows: byPlan.sort((a, b) => b._count - a._count).map((b) => [name.get(b.planId) ?? "—", String(b._count)]),
        },
        sources: [{ label: "Active members list", href: "/members?state=active" }],
      };
    }

    case "expiring_memberships": {
      const until =
        route.period === "week" || route.period === "today"
          ? new Date(now.getTime() + 7 * DAY)
          : new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const rows = await db.membership.findMany({
        where: {
          status: "ACTIVE",
          startDate: { lte: now },
          endDate: { gte: now, lt: until },
          user: { memberships: { none: { status: "ACTIVE", startDate: { gt: now } } } },
        },
        orderBy: { endDate: "asc" },
        select: { endDate: true, user: { select: { name: true, memberNumber: true } }, plan: { select: { name: true } } },
      });
      const label = route.period === "week" || route.period === "today" ? "in the next 7 days" : "before the end of this month";
      return {
        text: rows.length
          ? `${plural(rows.length, "membership")} expire ${label} and haven't been renewed.`
          : `No memberships expire ${label}.`,
        table: rows.length
          ? {
              columns: ["Member", "Plan", "Ends"],
              rows: rows.slice(0, 15).map((r) => [`${r.user.name} (${r.user.memberNumber ?? "—"})`, r.plan.name, fmtDate(r.endDate)]),
            }
          : undefined,
        sources: [{ label: "Expiring members", href: "/members?state=expiring" }],
      };
    }

    case "pending_reimbursements": {
      const [owed, waiting] = await Promise.all([
        db.expense.findMany({
          where: { status: "APPROVED", needsReimbursement: true },
          orderBy: { reviewedAt: "asc" },
          select: { description: true, amountPaise: true, reviewedAt: true, submittedBy: { select: { name: true } } },
        }),
        db.expense.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amountPaise: true } }),
      ]);
      const total = owed.reduce((s, e) => s + e.amountPaise, 0);
      return {
        text: `${people(owed.length)} ${owed.length === 1 ? "is" : "are"} waiting to be paid back, ${formatINR(total)} in total. Another ${plural(waiting._count, "claim")} (${formatINR(waiting._sum.amountPaise ?? 0)}) ${waiting._count === 1 ? "is" : "are"} waiting for approval.`,
        table: owed.length
          ? {
              columns: ["Person", "For", "Amount", "Approved"],
              rows: owed.map((e) => [e.submittedBy?.name ?? "—", e.description, formatINR(e.amountPaise), fmtDate(e.reviewedAt)]),
            }
          : undefined,
        sources: [
          { label: "To pay back", href: "/finance?tab=expenses&status=OWED" },
          { label: "Claims to review", href: "/finance?tab=expenses" },
        ],
      };
    }

    case "top_attendance": {
      const since = new Date(now.getTime() - 365 * DAY);
      const events = await db.event.findMany({
        where: { status: "PUBLISHED", endsAt: { lt: now, gte: since } },
        select: { id: true, title: true, startsAt: true, _count: { select: { tickets: { where: { checkedInAt: { not: null } } } } } },
      });
      const top = events.sort((a, b) => b._count.tickets - a._count.tickets).slice(0, 5);
      if (!top.length) return { text: "No events finished in the last 12 months.", sources: [{ label: "Events", href: "/events" }] };
      return {
        text: `${top[0].title} had the highest attendance in the last 12 months: ${top[0]._count.tickets.toLocaleString("en-IN")} people checked in.`,
        table: {
          columns: ["Event", "Date", "Checked in"],
          rows: top.map((e) => [e.title, fmtDate(e.startsAt), e._count.tickets.toLocaleString("en-IN")]),
        },
        sources: top.slice(0, 3).map((e) => ({ label: e.title, href: `/events/${e.id}` })),
      };
    }

    case "event_money": {
      const events = await db.event.findMany({ where: { status: { not: "DRAFT" } }, select: { id: true, title: true, startsAt: true } });
      const subject = route.subject ?? "";
      // Best title match; among equals prefer the most recent event that has already happened.
      const scored = events
        .map((e) => ({ ...e, score: matchScore(subject, e.title) }))
        .filter((e) => e.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || Number(b.startsAt <= now) - Number(a.startsAt <= now) || b.startsAt.getTime() - a.startsAt.getTime(),
        );
      const e = scored[0];
      if (!e)
        return {
          text: `I couldn't find an event matching "${subject}". Try part of its name, e.g. "Diwali Gala".`,
          sources: [{ label: "Events", href: "/events" }],
        };
      const [tickets, donations, costs] = await Promise.all([
        db.payment.aggregate({
          where: { status: "PAID", purpose: "TICKET", ticketOrder: { eventId: e.id } },
          _sum: { amountPaise: true },
          _count: true,
        }),
        db.payment.aggregate({
          where: { status: "PAID", purpose: "DONATION", fundraiser: { eventId: e.id } },
          _sum: { amountPaise: true },
        }),
        user.permissions.has("finance.view")
          ? db.expense.aggregate({ where: { eventId: e.id, status: { in: [...SPENT_STATUSES] } }, _sum: { amountPaise: true } })
          : null,
      ]);
      const income = (tickets._sum.amountPaise ?? 0) + (donations._sum.amountPaise ?? 0);
      const spent = costs?._sum.amountPaise ?? null;
      const rows = [
        ["Ticket sales", formatINR(tickets._sum.amountPaise ?? 0)],
        ...(donations._sum.amountPaise ? [["Donations", formatINR(donations._sum.amountPaise)]] : []),
        ...(spent !== null
          ? [
              ["Approved costs", `− ${formatINR(spent)}`],
              ["Net", formatINR(income - spent)],
            ]
          : []),
      ];
      return {
        text:
          `${e.title} (${fmtDate(e.startsAt)}) brought in ${formatINR(income)} from ${plural(tickets._count, "ticket payment")}` +
          (spent !== null ? `. After ${formatINR(spent)} of approved costs, the net result is ${formatINR(income - spent)}.` : "."),
        table: { columns: ["", "Amount"], rows },
        sources: [
          { label: e.title, href: `/events/${e.id}` },
          ...(spent !== null ? [{ label: "Event expenses", href: "/finance?tab=expenses&status=ALL" }] : []),
        ],
      };
    }

    case "stock_left": {
      const variants = await db.productVariant.findMany({
        where: { isActive: true, product: { status: "ACTIVE" } },
        select: { size: true, color: true, stock: true, product: { select: { id: true, name: true, category: true } } },
      });
      const subject = route.subject ?? "";
      const hits = variants.filter((v) => matchScore(subject, `${v.product.name} ${v.product.category}`) >= 0.5);
      if (!hits.length)
        return {
          text: `I couldn't find merch matching "${subject}". Try "hoodies", "tees" or a product name.`,
          sources: [{ label: "Merch", href: "/merch" }],
        };
      const total = hits.reduce((s, v) => s + v.stock, 0);
      const bySize = new Map<string, number>();
      for (const v of hits) bySize.set(v.size, (bySize.get(v.size) ?? 0) + v.stock);
      const products = [...new Map(hits.map((v) => [v.product.id, v.product])).values()];
      return {
        text: `${total.toLocaleString("en-IN")} left across ${plural(products.length, "product")} (${products.map((p) => p.name).join(", ")}).`,
        table: { columns: ["Size", "In stock"], rows: [...bySize].map(([s, n]) => [s, String(n)]) },
        sources: [
          { label: "Inventory", href: "/merch/inventory" },
          ...products.slice(0, 3).map((p) => ({ label: p.name, href: `/merch/${p.id}` })),
        ],
      };
    }

    case "fundraiser_progress": {
      const list = await db.fundraiser.findMany({
        where: { status: { not: "CANCELLED" } },
        select: { id: true, title: true, goalPaise: true, endsAt: true, status: true },
      });
      const subject = route.subject ?? "";
      const pick = subject
        ? list
            .map((f) => ({ ...f, s: matchScore(subject, f.title) }))
            .filter((f) => f.s > 0)
            .sort((a, b) => b.s - a.s)
        : [];
      const chosen = pick.length ? [pick[0]] : list.filter((f) => f.status === "ACTIVE");
      const raised = await raisedByFundraiser(chosen.map((f) => f.id));
      if (!chosen.length) return { text: "There are no active fundraisers.", sources: [{ label: "Fundraisers", href: "/fundraisers" }] };
      const rows = chosen.map((f) => {
        const r = raised.get(f.id) ?? 0;
        return [f.title, formatINR(r), formatINR(f.goalPaise), `${Math.round((r / f.goalPaise) * 100)}%`, fmtDate(f.endsAt)];
      });
      const one = chosen.length === 1 ? chosen[0] : null;
      return {
        text: one
          ? `${one.title} has raised ${rows[0][1]} of its ${rows[0][2]} goal (${rows[0][3]}), ending ${rows[0][4]}.`
          : `${plural(chosen.length, "fundraiser")} ${chosen.length === 1 ? "is" : "are"} active:`,
        table: { columns: ["Fundraiser", "Raised", "Goal", "Progress", "Ends"], rows },
        sources: chosen.slice(0, 3).map((f) => ({ label: f.title, href: `/fundraisers/${f.id}` })),
      };
    }

    case "finance_summary": {
      const period = route.period ?? "month";
      const from = periodStart(period, now);
      const [inc, out, byPurpose] = await Promise.all([
        db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: from } }, _sum: { amountPaise: true } }),
        db.expense.aggregate({ where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: from } }, _sum: { amountPaise: true } }),
        db.payment.groupBy({ by: ["purpose"], where: { status: "PAID", paidAt: { gte: from } }, _sum: { amountPaise: true } }),
      ]);
      const i = inc._sum.amountPaise ?? 0;
      const o = out._sum.amountPaise ?? 0;
      const LABEL = {
        MEMBERSHIP: "Membership dues",
        TICKET: "Ticket sales",
        MERCH: "Merch sales",
        DONATION: "Donations",
        OTHER: "Other",
      } as const;
      return {
        text: `${PERIOD_LABEL[period][0].toUpperCase()}${PERIOD_LABEL[period].slice(1)}: ${formatINR(i)} came in and ${formatINR(o)} went out, leaving ${formatINR(i - o)}.`,
        table: {
          columns: ["Income source", "Amount"],
          rows: byPurpose
            .sort((a, b) => (b._sum.amountPaise ?? 0) - (a._sum.amountPaise ?? 0))
            .map((p) => [LABEL[p.purpose], formatINR(p._sum.amountPaise ?? 0)]),
        },
        sources: [
          { label: "Income", href: "/finance?tab=income" },
          { label: "Expenses", href: "/finance?tab=expenses&status=APPROVED" },
        ],
      };
    }

    case "upcoming_events": {
      const events = await db.event.findMany({
        where: { status: "PUBLISHED", endsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 6,
        select: { id: true, title: true, startsAt: true, venue: true, capacity: true, allocated: true },
      });
      return {
        text: events.length ? `The next ${plural(events.length, "event")}:` : "No upcoming events are published yet.",
        table: events.length
          ? {
              columns: ["Event", "When", "Where", "Seats left"],
              rows: events.map((e) => [e.title, fmtDate(e.startsAt), e.venue, String(Math.max(0, e.capacity - e.allocated))]),
            }
          : undefined,
        sources: [{ label: "Events", href: "/events" }],
      };
    }

    case "my_tasks": {
      const tasks = await db.task.findMany({
        where: { assigneeId: user.id, status: { not: "DONE" } },
        orderBy: [{ dueAt: "asc" }],
        select: { title: true, dueAt: true, status: true, fundraiser: { select: { title: true } }, event: { select: { title: true } } },
      });
      return {
        text: tasks.length ? `You have ${plural(tasks.length, "open task")}.` : "You have no open tasks.",
        table: tasks.length
          ? {
              columns: ["Task", "For", "Due"],
              rows: tasks.map((t) => [t.title, t.fundraiser?.title ?? t.event?.title ?? "—", t.dueAt ? fmtDate(t.dueAt) : "—"]),
            }
          : undefined,
        sources: [{ label: "My volunteering", href: "/me/volunteering" }],
      };
    }

    case "attention": {
      if (!user.permissions.has("analytics.view")) return answer({ ...route, intent: "my_tasks" }, user);
      const { insights } = await loadInsights(user, now);
      const urgent = insights.filter((i) => i.severity === "critical" || i.severity === "warning");
      return {
        text: urgent.length
          ? `${plural(urgent.length, "thing")} need${urgent.length === 1 ? "s" : ""} attention, most urgent first:`
          : "Nothing urgent — the checks found no problems.",
        table: urgent.length
          ? {
              columns: ["", "What", "Why"],
              rows: urgent.slice(0, 8).map((i) => [i.severity === "critical" ? "Urgent" : "Watch", i.title, i.why]),
            }
          : undefined,
        sources: [{ label: "All insights", href: "/insights" }],
      };
    }

    case "help":
    default:
      return {
        text: "I answer questions from the organization's own data, and show where each number comes from. Try one of these:",
        table: { columns: ["You can ask"], rows: INTENTS.filter((i) => i !== "help" && allowed(user, i)).map((i) => [INTENT_HELP[i]]) },
        sources: [],
      };
  }
}
