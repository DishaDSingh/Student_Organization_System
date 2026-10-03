import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { fmtDate, plural } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { raisedByFundraiser } from "@/lib/fundraisers";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import { AREA_LABEL, fundraiserPace, pulseStatus, salesSlowdown, sortInsights, type Area, type Insight, type PulseStatus } from "./rules";

/**
 * AI Insight Engine (Phase 10) and Organization Pulse (Phase 18).
 * Each check looks at live data and returns insights that explain themselves:
 * why (with the threshold), the evidence rows, and an optional next step.
 * Nothing here changes data — a person decides what to do.
 */

const DAY = 86_400_000;
const EVIDENCE_ROWS = 8;

const AREA_PERMISSION: Record<Area, PermissionKey> = {
  members: "members.view",
  events: "events.view",
  finance: "finance.view",
  volunteers: "volunteers.view",
  merch: "merchandise.view",
  fundraisers: "fundraisers.view",
};

/** What each area's checks look for — shown on the pulse so green is explainable too. */
export const AREA_CHECKS: Record<Area, string[]> = {
  members: [
    "Memberships ending in the next 7 days",
    "Sign-ups waiting for payment confirmation",
    "Engaged members who haven't volunteered",
  ],
  events: ["Upcoming events whose ticket sales dropped ≥ 30% (last 2 weeks vs the 2 before)", "Upcoming events at least 90% sold"],
  finance: ["Expense claims waiting more than 7 days", "Category budgets at 90% or more", "Spending above income in the last 30 days"],
  volunteers: ["Overdue tasks", "Volunteers holding more work than their weekly hours"],
  merch: ["Sizes at or below their reorder level"],
  fundraisers: ["Active fundraisers 20+ points behind their timeline"],
};

const cut = <T>(rows: T[]) => ({
  rows: rows.slice(0, EVIDENCE_ROWS),
  more: rows.length > EVIDENCE_ROWS ? rows.length - EVIDENCE_ROWS : undefined,
});

// ─── Checks ──────────────────────────────────────────────────────────────────

async function membersChecks(now: Date): Promise<Insight[]> {
  const week = new Date(now.getTime() + 7 * DAY);
  const half = new Date(now.getTime() - 182 * DAY);
  const [expiring, pending, engaged] = await Promise.all([
    db.membership.findMany({
      where: {
        status: "ACTIVE",
        startDate: { lte: now },
        endDate: { gte: now, lte: week },
        user: { memberships: { none: { status: "ACTIVE", startDate: { gt: now } } } },
      },
      orderBy: { endDate: "asc" },
      select: { endDate: true, plan: { select: { name: true } }, user: { select: { name: true, memberNumber: true } } },
    }),
    db.membership.findMany({
      where: { status: "PENDING_PAYMENT" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, claimedReference: true, user: { select: { name: true } }, plan: { select: { name: true } } },
    }),
    // Members who came to 2+ events in six months but have never done a volunteer task.
    db.user.findMany({
      where: {
        status: "ACTIVE",
        ticketOrders: { some: { tickets: { some: { checkedInAt: { gte: half } } } } },
        tasksAssigned: { none: {} },
      },
      select: {
        name: true,
        ticketOrders: { select: { tickets: { where: { checkedInAt: { gte: half } }, select: { id: true } } } },
      },
    }),
  ]);

  const out: Insight[] = [];
  if (expiring.length) {
    out.push({
      id: "members.expiring",
      area: "members",
      severity: "critical",
      title: `${plural(expiring.length, "membership")} expire within 7 days`,
      why: `Shown because ${plural(expiring.length, "active membership")} end on or before ${fmtDate(week)} and haven't been renewed yet.`,
      evidence: {
        columns: ["Member", "Plan", "Ends"],
        ...cut(
          expiring.map((m) => [`${m.user.name}${m.user.memberNumber ? ` (${m.user.memberNumber})` : ""}`, m.plan.name, fmtDate(m.endDate)]),
        ),
      },
      action: { label: "See expiring members", href: "/members?state=expiring" },
    });
  }
  if (pending.length) {
    const withRef = pending.filter((p) => p.claimedReference).length;
    out.push({
      id: "members.pending",
      area: "members",
      severity: "warning",
      title: `${plural(pending.length, "sign-up")} waiting for payment confirmation`,
      why: `${withRef} of them already entered a UPI reference to check. Until confirmed, they don't get a member pass.`,
      evidence: {
        columns: ["Member", "Plan", "Signed up", "Reference"],
        ...cut(pending.map((p) => [p.user.name, p.plan.name, fmtDate(p.createdAt), p.claimedReference ?? "—"])),
      },
      action: { label: "Confirm payments", href: "/members?state=pending" },
    });
  }
  const keen = engaged
    .map((u) => ({ name: u.name, visits: u.ticketOrders.reduce((s, o) => s + o.tickets.length, 0) }))
    .filter((u) => u.visits >= 2)
    .sort((a, b) => b.visits - a.visits);
  if (keen.length >= 5) {
    out.push({
      id: "members.engaged-not-volunteering",
      area: "members",
      severity: "opportunity",
      title: `${plural(keen.length, "highly engaged member")} haven't volunteered yet`,
      why: "They checked in to 2 or more events in the last 6 months but have never been given a volunteer task — a friendly invite could grow the volunteer pool.",
      evidence: { columns: ["Member", "Events attended"], ...cut(keen.map((u) => [u.name, String(u.visits)])) },
      action: { label: "Open volunteers", href: "/volunteers" },
    });
  }
  return out;
}

async function eventsChecks(now: Date): Promise<Insight[]> {
  const events = await db.event.findMany({
    where: { status: "PUBLISHED", startsAt: { gt: now } },
    select: {
      id: true,
      title: true,
      startsAt: true,
      capacity: true,
      allocated: true,
      tickets: { where: { status: "VALID", createdAt: { gte: new Date(now.getTime() - 28 * DAY) } }, select: { createdAt: true } },
    },
  });
  const out: Insight[] = [];
  for (const e of events) {
    const soldPct = e.capacity ? Math.round((e.allocated / e.capacity) * 100) : 0;
    const weeks = [0, 1, 2, 3].map(
      (w) =>
        e.tickets.filter(
          (t) => t.createdAt.getTime() > now.getTime() - (w + 1) * 7 * DAY && t.createdAt.getTime() <= now.getTime() - w * 7 * DAY,
        ).length,
    );
    // Two-week windows smooth out one quiet or busy week.
    const recent = weeks[0] + weeks[1];
    const before = weeks[2] + weeks[3];
    const drop = salesSlowdown(recent, before, soldPct);
    if (drop !== null) {
      out.push({
        id: `events.slowing.${e.id}`,
        area: "events",
        severity: "warning",
        title: `${e.title}: ticket sales slowed ${drop}%`,
        why: `${recent} tickets sold in the last 2 weeks vs ${before} in the 2 weeks before, with ${100 - soldPct}% of seats still unsold and the event on ${fmtDate(e.startsAt)}.`,
        evidence: {
          columns: ["Week", "Tickets sold"],
          rows: ["This week", "Last week", "2 weeks ago", "3 weeks ago"].map((l, i) => [l, String(weeks[i])]),
        },
        action: { label: "Open event", href: `/events/${e.id}` },
      });
    }
    if (soldPct >= 90) {
      out.push({
        id: `events.selling-out.${e.id}`,
        area: "events",
        severity: "opportunity",
        title: `${e.title} is ${soldPct}% sold`,
        why: `${e.allocated} of ${e.capacity} seats are taken. If the venue allows, more capacity could be added — or plan a waitlist.`,
        evidence: { columns: ["Seats", "Taken", "Event date"], rows: [[String(e.capacity), String(e.allocated), fmtDate(e.startsAt)]] },
        action: { label: "Open event", href: `/events/${e.id}` },
      });
    }
  }
  return out;
}

async function financeChecks(now: Date): Promise<Insight[]> {
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const [stale, budgets, spentByCat, in30, out30] = await Promise.all([
    db.expense.findMany({
      where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 7 * DAY) } },
      orderBy: { createdAt: "asc" },
      select: { description: true, amountPaise: true, createdAt: true, submittedBy: { select: { name: true } } },
    }),
    db.budget.findMany(),
    db.expense.groupBy({
      by: ["category"],
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: month } },
      _sum: { amountPaise: true },
    }),
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _sum: { amountPaise: true } }),
    db.expense.aggregate({
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      _sum: { amountPaise: true },
    }),
  ]);
  const out: Insight[] = [];
  if (stale.length) {
    out.push({
      id: "finance.stale-claims",
      area: "finance",
      severity: "warning",
      title: `${plural(stale.length, "expense claim")} waiting more than a week`,
      why: "Members paid these themselves; long waits for approval discourage people from helping.",
      evidence: {
        columns: ["Claim", "By", "Amount", "Submitted"],
        ...cut(stale.map((e) => [e.description, e.submittedBy?.name ?? "—", formatINR(e.amountPaise), fmtDate(e.createdAt)])),
      },
      action: { label: "Review expenses", href: "/finance?tab=expenses" },
    });
  }
  const spent = new Map(spentByCat.map((s) => [s.category, s._sum.amountPaise ?? 0]));
  const tight = budgets
    .map((b) => ({ ...b, spent: spent.get(b.category) ?? 0, pct: Math.round(((spent.get(b.category) ?? 0) / b.monthlyPaise) * 100) }))
    .filter((b) => b.pct >= 90)
    .sort((a, b) => b.pct - a.pct);
  if (tight.length) {
    out.push({
      id: "finance.budgets",
      area: "finance",
      severity: tight.some((b) => b.pct >= 100) ? "critical" : "warning",
      title:
        tight.length === 1 ? `${tight[0].category} budget is ${tight[0].pct}% used` : `${tight.length} budgets are 90%+ used this month`,
      why: "Budgets are monthly limits set by the treasurer; this month's approved spending is close to or over them.",
      evidence: {
        columns: ["Category", "Spent", "Budget", "Used"],
        rows: tight.map((b) => [b.category, formatINR(b.spent), formatINR(b.monthlyPaise), `${b.pct}%`]),
      },
      action: { label: "See budgets", href: "/analytics?tab=finance" },
    });
  }
  const inc = in30._sum.amountPaise ?? 0;
  const exp = out30._sum.amountPaise ?? 0;
  if (exp > inc) {
    out.push({
      id: "finance.negative-cashflow",
      area: "finance",
      severity: "critical",
      title: `Spent ${formatINR(exp - inc)} more than came in over 30 days`,
      why: "Approved spending in the last 30 days is higher than all payments received in the same period.",
      evidence: {
        columns: ["Last 30 days", "Amount"],
        rows: [
          ["Money in", formatINR(inc)],
          ["Money out", formatINR(exp)],
        ],
      },
      action: { label: "Open finance", href: "/finance" },
    });
  }
  return out;
}

async function volunteerChecks(now: Date): Promise<Insight[]> {
  const [overdue, open, profiles] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "DONE" }, dueAt: { lt: now } },
      orderBy: { dueAt: "asc" },
      select: {
        title: true,
        dueAt: true,
        assignee: { select: { name: true } },
        fundraiser: { select: { title: true } },
        event: { select: { title: true } },
      },
    }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { not: "DONE" }, assigneeId: { not: null } }, _sum: { estimatedHours: true } }),
    db.volunteerProfile.findMany({ select: { userId: true, maxHoursPerWeek: true, user: { select: { name: true } } } }),
  ]);
  const out: Insight[] = [];
  if (overdue.length) {
    out.push({
      id: "volunteers.overdue",
      area: "volunteers",
      severity: "warning",
      title: `${plural(overdue.length, "task")} overdue`,
      why: "These tasks passed their due date and aren't marked done.",
      evidence: {
        columns: ["Task", "For", "Assigned to", "Was due"],
        ...cut(overdue.map((t) => [t.title, t.fundraiser?.title ?? t.event?.title ?? "—", t.assignee?.name ?? "Nobody", fmtDate(t.dueAt)])),
      },
      action: { label: "Open fundraisers", href: "/fundraisers" },
    });
  }
  const hours = new Map(open.map((o) => [o.assigneeId!, o._sum.estimatedHours ?? 0]));
  const overloaded = profiles.filter((p) => (hours.get(p.userId) ?? 0) > p.maxHoursPerWeek);
  if (overloaded.length) {
    out.push({
      id: "volunteers.overloaded",
      area: "volunteers",
      severity: "warning",
      title: `${plural(overloaded.length, "volunteer")} ${overloaded.length === 1 ? "has" : "have"} more work than time`,
      why: "Their open tasks add up to more hours than they said they can give per week. Consider reassigning.",
      evidence: {
        columns: ["Volunteer", "Open work", "Can give / week"],
        ...cut(overloaded.map((p) => [p.user.name, `${hours.get(p.userId)}h`, `${p.maxHoursPerWeek}h`])),
      },
      action: { label: "Open volunteers", href: "/volunteers" },
    });
  }
  return out;
}

async function merchChecks(): Promise<Insight[]> {
  const low = await db.productVariant.findMany({
    where: { isActive: true, product: { status: "ACTIVE" }, stock: { lte: db.productVariant.fields.reorderLevel } },
    orderBy: { stock: "asc" },
    select: { size: true, color: true, stock: true, reorderLevel: true, product: { select: { name: true } } },
  });
  if (!low.length) return [];
  return [
    {
      id: "merch.low-stock",
      area: "merch",
      severity: low.some((v) => v.stock === 0) ? "critical" : "warning",
      title: low.length === 1 ? `${low[0].product.name} (${low[0].size}) is running low` : `${low.length} merch sizes are running low`,
      why: "Stock is at or below each size's reorder level, so it may sell out before new stock arrives.",
      evidence: {
        columns: ["Product", "Colour", "Size", "Left", "Reorder at"],
        ...cut(low.map((v) => [v.product.name, v.color, v.size, String(v.stock), String(v.reorderLevel)])),
      },
      action: { label: "Restock", href: "/merch/inventory?show=low" },
    },
  ];
}

async function fundraiserChecks(now: Date): Promise<Insight[]> {
  const active = await db.fundraiser.findMany({
    where: { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gte: now } },
    select: { id: true, title: true, goalPaise: true, startsAt: true, endsAt: true },
  });
  const raised = await raisedByFundraiser(active.map((f) => f.id));
  const out: Insight[] = [];
  for (const f of active) {
    const r = raised.get(f.id) ?? 0;
    const p = fundraiserPace(r, f.goalPaise, f.startsAt, f.endsAt, now);
    if (!p.behind) continue;
    out.push({
      id: `fundraisers.behind.${f.id}`,
      area: "fundraisers",
      severity: "warning",
      title: `${f.title} is behind its goal`,
      why: `${p.elapsedPct}% of the time has passed but only ${p.raisedPct}% of the goal is raised. It needs about ${formatINR(p.perDay)} a day for the last ${plural(p.daysLeft, "day")}.`,
      evidence: {
        columns: ["Raised", "Goal", "Time passed", "Days left"],
        rows: [[formatINR(r), formatINR(f.goalPaise), `${p.elapsedPct}%`, String(p.daysLeft)]],
      },
      action: { label: "Open fundraiser", href: `/fundraisers/${f.id}` },
    });
  }
  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const visibleAreas = (user: CurrentUser) =>
  (Object.keys(AREA_PERMISSION) as Area[]).filter((a) => user.permissions.has(AREA_PERMISSION[a]));

/** All insights the user is allowed to see, most urgent first. */
export async function loadInsights(user: CurrentUser, now = new Date()) {
  const areas = visibleAreas(user);
  const runs: Record<Area, () => Promise<Insight[]>> = {
    members: () => membersChecks(now),
    events: () => eventsChecks(now),
    finance: () => financeChecks(now),
    volunteers: () => volunteerChecks(now),
    merch: () => merchChecks(),
    fundraisers: () => fundraiserChecks(now),
  };
  const results = await Promise.all(areas.map((a) => runs[a]()));
  return { areas, insights: sortInsights(results.flat()) };
}

export type PulseRow = { area: Area; label: string; status: PulseStatus; reasons: string[]; checks: string[] };

/** Organization Pulse: one explainable status per area, derived only from insights. */
export function pulse(areas: Area[], insights: Insight[]): PulseRow[] {
  return areas.map((area) => {
    const mine = insights.filter((i) => i.area === area);
    const problems = mine.filter((i) => i.severity === "critical" || i.severity === "warning");
    return {
      area,
      label: AREA_LABEL[area],
      status: pulseStatus(mine),
      reasons: problems.length ? problems.map((i) => i.title) : ["No problems found by the checks below."],
      checks: AREA_CHECKS[area],
    };
  });
}
