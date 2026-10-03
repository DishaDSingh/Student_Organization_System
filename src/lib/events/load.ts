import "server-only";
import { format } from "date-fns";
import { db } from "@/lib/db";

export const toDateTimeInput = (d: Date | null | undefined) => (d ? format(d, "yyyy-MM-dd'T'HH:mm") : "");

/**
 * Live numbers for one event — used by the event page, the command center
 * stream and the check-in screen. All counted in SQL.
 */
export async function eventStats(eventId: string) {
  const [byStatus, checkedIn, revenue, refunds, pendingOrders, types, incidentsOpen] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], where: { eventId }, _count: true }),
    db.ticket.count({ where: { eventId, status: "VALID", checkedInAt: { not: null } } }),
    db.payment.aggregate({ where: { ticketOrder: { eventId }, status: "PAID" }, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { ticketOrder: { eventId }, status: "REFUNDED" }, _sum: { amountPaise: true }, _count: true }),
    db.ticketOrder.count({ where: { eventId, status: "PENDING_PAYMENT" } }),
    db.ticketType.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        quantity: true,
        allocated: true,
        _count: { select: { tickets: { where: { status: "VALID", checkedInAt: { not: null } } } } },
      },
    }),
    db.eventIncident.count({ where: { eventId, resolvedAt: null } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const sold = count("VALID");
  return {
    sold,
    reserved: count("RESERVED"),
    refunded: count("REFUNDED"),
    checkedIn,
    noShows: sold - checkedIn,
    revenuePaise: revenue._sum.amountPaise ?? 0,
    refundedPaise: refunds._sum.amountPaise ?? 0,
    pendingOrders,
    incidentsOpen,
    byType: types.map((t) => ({ id: t.id, name: t.name, quantity: t.quantity, allocated: t.allocated, checkedIn: t._count.tickets })),
  };
}
export type EventStats = Awaited<ReturnType<typeof eventStats>>;
