import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDaysIcon, PlusIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { DateBlock, Meter, PhaseBadge, SalesBadge } from "@/components/events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { param } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { eventPhase, salesState } from "@/lib/events/rules";

export const metadata: Metadata = { title: "Events" };

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "drafts", label: "Drafts", staff: true },
  { key: "cancelled", label: "Cancelled", staff: true },
] as const;

export default async function EventsPage(props: PageProps<"/events">) {
  const user = await requireUser();
  const staff = can(user, "events.view");
  const seeMoney = can(user, "tickets.view");
  const tabs = TABS.filter((t) => !("staff" in t) || staff);
  const requested = param((await props.searchParams).tab);
  const tab = tabs.find((t) => t.key === requested)?.key ?? "upcoming";
  const now = new Date();

  const where: Prisma.EventWhereInput =
    tab === "upcoming"
      ? { status: "PUBLISHED", endsAt: { gte: now } }
      : tab === "past"
        ? { status: "PUBLISHED", endsAt: { lt: now } }
        : tab === "drafts"
          ? { status: "DRAFT" }
          : { status: "CANCELLED" };

  const events = await db.event.findMany({
    where,
    orderBy: { startsAt: tab === "upcoming" || tab === "drafts" ? "asc" : "desc" },
    take: 60,
    select: {
      id: true,
      title: true,
      category: true,
      venue: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      allocated: true,
      status: true,
      salesOpenAt: true,
      salesCloseAt: true,
      ticketTypes: { where: { isActive: true }, select: { memberPricePaise: true, publicPricePaise: true } },
      _count: { select: { tickets: { where: { status: "VALID", checkedInAt: { not: null } } } } },
    },
  });

  // Paid ticket revenue per event (refunded payments excluded).
  const revenue: Record<string, number> = {};
  if (seeMoney && events.length) {
    const paid = await db.payment.findMany({
      where: { status: "PAID", ticketOrder: { eventId: { in: events.map((e) => e.id) } } },
      select: { amountPaise: true, ticketOrder: { select: { eventId: true } } },
    });
    for (const p of paid) revenue[p.ticketOrder!.eventId] = (revenue[p.ticketOrder!.eventId] ?? 0) + p.amountPaise;
  }

  return (
    <>
      <PageHeader
        title="Events"
        description={
          staff ? "Plan events, sell tickets and run the door." : "What's coming up. Members get member pricing on their own ticket."
        }
        actions={
          can(user, "events.create") && (
            <Button asChild>
              <Link href="/events/new">
                <PlusIcon /> New event
              </Link>
            </Button>
          )
        }
      />

      <nav className="mb-4 flex gap-1 border-b" aria-label="Event filter">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "upcoming" ? "/events" : `/events?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <EmptyState icon={CalendarDaysIcon} title="No events here yet" />
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-xl border">
          {events.map((e) => {
            const phase = eventPhase(e, now);
            const from = Math.min(...e.ticketTypes.map((t) => t.memberPricePaise));
            return (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="hover:bg-muted/40 flex items-center gap-4 px-4 py-3 transition-colors">
                  <DateBlock date={e.startsAt} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {e.title}
                      {(phase === "LIVE" || phase === "CANCELLED" || phase === "DRAFT") && <PhaseBadge phase={phase} />}
                    </p>
                    <p className="text-muted-foreground truncate text-sm">
                      {e.category} · {e.venue} · {e.startsAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="hidden w-44 shrink-0 text-right text-xs sm:block">
                    {staff ? (
                      <>
                        <p className="tabular-nums">
                          {phase === "ENDED" ? `${e._count.tickets} attended · ` : ""}
                          {e.allocated}/{e.capacity} sold
                        </p>
                        <Meter value={e.allocated} max={e.capacity} className="mt-1" />
                        {seeMoney && revenue[e.id] !== undefined && (
                          <p className="text-muted-foreground mt-1 tabular-nums">{formatINR(revenue[e.id])}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <SalesBadge state={salesState(e, now)} />
                        {Number.isFinite(from) && (
                          <p className="text-muted-foreground mt-0.5">{from ? `from ${formatINR(from)}` : "Free"}</p>
                        )}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
