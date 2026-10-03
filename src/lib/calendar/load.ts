import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { plural } from "@/lib/format";
import type { PermissionKey } from "@/lib/rbac/catalog";
import type { CalItem } from "./grid";

/**
 * One calendar for everything dated in the app. Each source is only included
 * if the user can see that area — the calendar never leaks data.
 */
/** Meetings and internal deadlines are committee business: calendar managers and committee members. */
export async function seesCommitteeItems(user: CurrentUser) {
  if (user.isMasterAdmin || user.permissions.has("calendar.manage") || user.permissions.has("committees.view")) return true;
  return (await db.committeeMember.count({ where: { userId: user.id } })) > 0;
}

export async function loadCalendar(user: CurrentUser, from: Date, to: Date): Promise<CalItem[]> {
  const can = (p: PermissionKey) => user.permissions.has(p);
  const committee = can("calendar.view") && (await seesCommitteeItems(user));
  const time = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const range = { gte: from, lt: to };

  const [events, sales, meetings, entries, expiring, fundraisers, myTasks, myOrders, myTerm] = await Promise.all([
    db.event.findMany({
      where: { startsAt: range, status: can("events.view") ? { not: "DRAFT" } : "PUBLISHED" },
      select: { id: true, title: true, startsAt: true, venue: true, status: true },
    }),
    can("events.view")
      ? db.event.findMany({ where: { salesCloseAt: range, status: "PUBLISHED" }, select: { id: true, title: true, salesCloseAt: true } })
      : [],
    committee ? db.meeting.findMany({ where: { heldAt: range }, select: { id: true, title: true, heldAt: true } }) : [],
    committee
      ? db.calendarEntry.findMany({
          where: { startsAt: range },
          select: { id: true, title: true, startsAt: true, kind: true, notes: true },
        })
      : [],
    can("members.view") ? db.membership.groupBy({ by: ["endDate"], where: { status: "ACTIVE", endDate: range }, _count: true }) : [],
    can("fundraisers.view")
      ? db.fundraiser.findMany({
          where: { status: { not: "CANCELLED" }, OR: [{ startsAt: range }, { endsAt: range }] },
          select: { id: true, title: true, startsAt: true, endsAt: true },
        })
      : [],
    db.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, dueAt: range },
      select: { id: true, title: true, dueAt: true },
    }),
    db.ticketOrder.findMany({
      where: { buyerId: user.id, status: "PENDING_PAYMENT", holdUntil: range },
      select: { orderNumber: true, holdUntil: true, event: { select: { title: true } } },
    }),
    db.membership.findFirst({
      where: { userId: user.id, status: "ACTIVE", endDate: range },
      select: { endDate: true, plan: { select: { name: true } } },
    }),
  ]);

  // Membership expiry counts are grouped by day (end dates carry times).
  const expiryByDay = new Map<string, { date: Date; n: number }>();
  for (const e of expiring) {
    if (!e.endDate) continue;
    const d = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate(), 9);
    const k = d.toDateString();
    expiryByDay.set(k, { date: d, n: (expiryByDay.get(k)?.n ?? 0) + e._count });
  }

  return [
    ...events.map((e) => ({
      id: `e-${e.id}`,
      date: e.startsAt,
      title: e.status === "CANCELLED" ? `${e.title} (cancelled)` : e.title,
      kind: "event" as const,
      href: `/events/${e.id}`,
      detail: `${time(e.startsAt)} · ${e.venue}`,
    })),
    ...sales.map((e) => ({
      id: `s-${e.id}`,
      date: e.salesCloseAt!,
      title: `Ticket sales close: ${e.title}`,
      kind: "sales" as const,
      href: `/events/${e.id}`,
    })),
    ...meetings.map((m) => ({
      id: `m-${m.id}`,
      date: m.heldAt,
      title: m.title,
      kind: "meeting" as const,
      href: `/meetings/${m.id}`,
      detail: time(m.heldAt),
    })),
    ...entries.map((c) => ({ id: `c-${c.id}`, date: c.startsAt, title: c.title, kind: "deadline" as const, detail: c.notes ?? undefined })),
    ...[...expiryByDay.values()].map((x) => ({
      id: `x-${x.date.toDateString()}`,
      date: x.date,
      title: `${plural(x.n, "membership")} ${x.n === 1 ? "expires" : "expire"}`,
      kind: "expiry" as const,
      href: "/members?state=expiring",
    })),
    ...fundraisers.flatMap((f) => [
      ...(f.startsAt >= from && f.startsAt < to
        ? [{ id: `fs-${f.id}`, date: f.startsAt, title: `Starts: ${f.title}`, kind: "fundraiser" as const, href: `/fundraisers/${f.id}` }]
        : []),
      ...(f.endsAt >= from && f.endsAt < to
        ? [{ id: `fe-${f.id}`, date: f.endsAt, title: `Ends: ${f.title}`, kind: "fundraiser" as const, href: `/fundraisers/${f.id}` }]
        : []),
    ]),
    ...myTasks.map((t) => ({ id: `t-${t.id}`, date: t.dueAt!, title: t.title, kind: "task" as const, href: "/me/volunteering" })),
    ...myOrders.map((o) => ({
      id: `p-${o.orderNumber}`,
      date: o.holdUntil!,
      title: `Pay for ${o.event.title} tickets`,
      kind: "payment" as const,
      href: "/me/tickets",
    })),
    ...(myTerm?.endDate
      ? [{ id: "my-term", date: myTerm.endDate, title: `Your ${myTerm.plan.name} membership ends`, kind: "expiry" as const, href: "/me" }]
      : []),
  ];
}
