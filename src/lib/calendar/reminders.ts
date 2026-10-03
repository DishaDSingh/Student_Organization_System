import type { PrismaClient } from "@/generated/prisma/client";
import { format } from "date-fns";

/**
 * Smart reminders (Phase 14). Runs with the other background jobs; every
 * reminder has a dedupe key so it's sent at most once.
 *  - 2 days before an event → volunteers with tasks for it
 *  - a task becomes overdue → its assignee
 *  - ticket sales close within 24 h → the event organizer
 *  - a deadline/reminder on the calendar within 24 h → whoever added it
 *  - a meeting tomorrow → the committee's members
 */
const HOUR = 3_600_000;

type Db = Pick<PrismaClient, "event" | "task" | "calendarEntry" | "meeting" | "notification">;

export async function runSmartReminders(db: Db, now = new Date()) {
  const in48h = new Date(now.getTime() + 48 * HOUR);
  const in24h = new Date(now.getTime() + 24 * HOUR);

  const [eventTasks, overdue, salesEnding, entries, meetings] = await Promise.all([
    db.task.findMany({
      where: { status: { not: "DONE" }, assigneeId: { not: null }, event: { status: "PUBLISHED", startsAt: { gt: now, lte: in48h } } },
      select: { id: true, title: true, assigneeId: true, event: { select: { id: true, title: true, startsAt: true } } },
    }),
    db.task.findMany({
      where: { status: { not: "DONE" }, assigneeId: { not: null }, dueAt: { lt: now, gte: new Date(now.getTime() - 7 * 24 * HOUR) } },
      select: { id: true, title: true, assigneeId: true, dueAt: true },
    }),
    db.event.findMany({
      where: { status: "PUBLISHED", organizerId: { not: null }, salesCloseAt: { gt: now, lte: in24h } },
      select: { id: true, title: true, organizerId: true, salesCloseAt: true, capacity: true, allocated: true },
    }),
    db.calendarEntry.findMany({
      where: { remind: true, createdById: { not: null }, startsAt: { gt: now, lte: in24h } },
      select: { id: true, title: true, startsAt: true, createdById: true },
    }),
    db.meeting.findMany({
      where: { heldAt: { gt: now, lte: in24h }, committeeId: { not: null } },
      select: { id: true, title: true, heldAt: true, committee: { select: { members: { select: { userId: true } } } } },
    }),
  ]);

  const rows = [
    ...eventTasks.map((t) => ({
      userId: t.assigneeId!,
      type: "task.event-soon",
      title: `${t.event!.title} is in 2 days`,
      body: `Your task: ${t.title}. The event starts ${format(t.event!.startsAt, "EEE d MMM, HH:mm")}.`,
      link: "/me/volunteering",
      dedupeKey: `event-soon:${t.id}`,
    })),
    ...overdue.map((t) => ({
      userId: t.assigneeId!,
      type: "task.overdue",
      title: `Overdue: ${t.title}`,
      body: `This was due ${format(t.dueAt!, "d MMM")}. Mark it done, or tell the lead if you need help.`,
      link: "/me/volunteering",
      dedupeKey: `task-overdue:${t.id}`,
    })),
    ...salesEnding.map((e) => ({
      userId: e.organizerId!,
      type: "event.sales-ending",
      title: `Ticket sales for ${e.title} close soon`,
      body: `Sales close ${format(e.salesCloseAt!, "EEE d MMM, HH:mm")} with ${e.capacity - e.allocated} seats still unsold.`,
      link: `/events/${e.id}`,
      dedupeKey: `sales-ending:${e.id}`,
    })),
    ...entries.map((c) => ({
      userId: c.createdById!,
      type: "calendar.reminder",
      title: `Tomorrow: ${c.title}`,
      body: `Due ${format(c.startsAt, "EEE d MMM, HH:mm")}.`,
      link: "/calendar",
      dedupeKey: `calendar:${c.id}`,
    })),
    ...meetings.flatMap((m) =>
      (m.committee?.members ?? []).map((cm) => ({
        userId: cm.userId,
        type: "meeting.soon",
        title: `Meeting tomorrow: ${m.title}`,
        body: `Starts ${format(m.heldAt, "EEE d MMM, HH:mm")}.`,
        link: `/meetings/${m.id}`,
        dedupeKey: `meeting:${m.id}:${cm.userId}`,
      })),
    ),
  ];
  if (!rows.length) return 0;
  const { count } = await db.notification.createMany({ data: rows, skipDuplicates: true });
  return count;
}
