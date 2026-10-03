import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { eventStats } from "@/lib/events/load";

const INTERVAL_MS = 3000;

/**
 * GET /api/events/:id/live — Server-Sent Events stream for the command center
 * and door screens. Pushes a fresh snapshot every 3 s straight from the
 * database; the browser's EventSource reconnects automatically.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/events/[id]/live">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthenticated", { status: 401 });
  if (!user.permissions.has("events.view") && !user.permissions.has("tickets.checkin")) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!(await db.event.count({ where: { id } }))) return new Response("Not found", { status: 404 });
  const seeMoney = user.permissions.has("tickets.view");

  const snapshot = async () => {
    const since = new Date(Date.now() - 2 * 3600_000);
    const [stats, recent, incidents, arrivals] = await Promise.all([
      eventStats(id),
      db.ticket.findMany({
        where: { eventId: id, checkedInAt: { not: null } },
        orderBy: { checkedInAt: "desc" },
        take: 8,
        select: {
          id: true,
          holderName: true,
          checkedInAt: true,
          ticketType: { select: { name: true } },
          checkedInBy: { select: { name: true } },
        },
      }),
      db.eventIncident.findMany({
        where: { eventId: id },
        orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        take: 6,
        select: { id: true, title: true, severity: true, location: true, createdAt: true, resolvedAt: true },
      }),
      // Arrivals per 10 minutes over the last 2 hours, for the arrival-rate sparkline.
      db.$queryRaw<{ bucket: Date; n: bigint }[]>`
        SELECT to_timestamp(floor(extract(epoch from "checkedInAt") / 600) * 600) AS bucket, count(*) AS n
        FROM "Ticket" WHERE "eventId" = ${id} AND "checkedInAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      at: new Date().toISOString(),
      stats: seeMoney ? stats : { ...stats, revenuePaise: null, refundedPaise: null },
      recent,
      incidents,
      arrivals: arrivals.map((a) => ({ t: a.bucket, n: Number(a.n) })),
    };
  };

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(await snapshot())}\n\n`));
        } catch {
          clearInterval(timer);
        }
      };
      await send();
      timer = setInterval(send, INTERVAL_MS);
      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
