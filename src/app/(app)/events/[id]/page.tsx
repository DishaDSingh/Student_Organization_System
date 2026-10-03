import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClockIcon, MapPinIcon, MonitorPlayIcon, PencilIcon, ScanLineIcon, UsersIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { Meter, PhaseBadge, SalesBadge } from "@/components/events";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR, standing } from "@/lib/membership/rules";
import { attendanceRate, eventPhase, salesState } from "@/lib/events/rules";
import { eventStats } from "@/lib/events/load";
import {
  BuyTicketsPanel,
  CancelEventDialog,
  ConfirmOrderDialog,
  IncidentDialog,
  PublishButton,
  ResolveIncidentButton,
  TicketTypeDialog,
  VoidOrderButton,
} from "../event-forms";

export const metadata: Metadata = { title: "Event" };

const ORDER_TONE: Record<string, string> = {
  PAID: "text-success",
  PENDING_PAYMENT: "text-info",
  CANCELLED: "text-muted-foreground",
  REFUNDED: "text-destructive",
};

export default async function EventPage(props: PageProps<"/events/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const staff = can(user, "events.view");

  const event = await db.event.findUnique({
    where: { id },
    include: {
      organizer: { select: { name: true } },
      committee: { select: { id: true, name: true } },
      ticketTypes: { orderBy: { sortOrder: "asc" } },
    },
  });
  // Drafts are invisible to non-staff — same answer as a missing event.
  if (!event || (event.status === "DRAFT" && !staff)) notFound();

  const now = new Date();
  const phase = eventPhase(event, now);
  const sales = salesState(event, now);
  const seeOrders = can(user, "tickets.view");

  const [stats, myTerms, myMemberTickets, myOrders, orders, incidents] = await Promise.all([
    staff ? eventStats(id) : null,
    db.membership.findMany({ where: { userId: user.id }, select: { status: true, startDate: true, endDate: true } }),
    db.ticket.count({ where: { eventId: id, isMemberPrice: true, status: { in: ["RESERVED", "VALID"] }, order: { buyerId: user.id } } }),
    db.ticketOrder.findMany({
      where: { eventId: id, buyerId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, status: true, totalPaise: true, _count: { select: { tickets: true } } },
    }),
    seeOrders
      ? db.ticketOrder.findMany({
          where: { eventId: id },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 40,
          select: {
            id: true,
            orderNumber: true,
            buyerName: true,
            status: true,
            channel: true,
            totalPaise: true,
            claimedReference: true,
            createdAt: true,
            _count: { select: { tickets: true } },
          },
        })
      : null,
    staff
      ? db.eventIncident.findMany({
          where: { eventId: id },
          orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
          include: { reportedBy: { select: { name: true } } },
        })
      : null,
  ]);
  const myState = standing(myTerms).state;
  const isMember = myState === "ACTIVE" || myState === "EXPIRING";
  const activeTypes = event.ticketTypes.filter((t) => t.isActive);

  return (
    <>
      <PageHeader
        back={{ href: "/events", label: "Events" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {event.title}
            <PhaseBadge phase={phase} />
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClockIcon className="size-4" />
              {fmtDateTime(event.startsAt)} –{" "}
              {event.endsAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon className="size-4" />
              {event.venue}
            </span>
            <span>{event.category}</span>
          </span>
        }
        actions={
          staff && (
            <>
              {(phase === "LIVE" || phase === "UPCOMING") && (
                <Button variant="outline" asChild>
                  <Link href={`/events/${id}/live`}>
                    <MonitorPlayIcon /> Command center
                  </Link>
                </Button>
              )}
              {can(user, "tickets.checkin") && (phase === "LIVE" || phase === "UPCOMING") && (
                <Button variant="outline" asChild>
                  <Link href={`/events/${id}/checkin`}>
                    <ScanLineIcon /> Door
                  </Link>
                </Button>
              )}
              {can(user, "events.edit") && event.status !== "CANCELLED" && (
                <Button variant="outline" asChild>
                  <Link href={`/events/${id}/edit`}>
                    <PencilIcon /> Edit
                  </Link>
                </Button>
              )}
              {event.status === "DRAFT" && can(user, "events.publish") && <PublishButton eventId={id} />}
              {event.status === "PUBLISHED" && phase !== "ENDED" && can(user, "events.cancel") && <CancelEventDialog eventId={id} />}
            </>
          )
        }
      />

      {event.status === "CANCELLED" && (
        <p className="border-destructive/30 bg-destructive/5 text-destructive mb-6 rounded-xl border px-4 py-3 text-sm">
          This event was cancelled: {event.cancelledReason}
        </p>
      )}

      {stats && (
        <div className="bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
          {[
            { label: "Tickets sold", value: `${stats.sold}`, sub: `of ${event.capacity} · ${stats.reserved} awaiting payment` },
            {
              label: phase === "ENDED" ? "Attended" : "Checked in",
              value: `${stats.checkedIn}`,
              sub:
                phase === "ENDED"
                  ? `${attendanceRate(stats.checkedIn, stats.sold)}% · ${stats.noShows} no-shows`
                  : `${stats.sold - stats.checkedIn} still to arrive`,
            },
            ...(seeOrders
              ? [
                  {
                    label: "Revenue",
                    value: formatINR(stats.revenuePaise),
                    sub: stats.refundedPaise ? `${formatINR(stats.refundedPaise)} refunded` : "net of refunds",
                  },
                ]
              : []),
            { label: "Open incidents", value: `${stats.incidentsOpen}`, sub: `${stats.pendingOrders} orders unpaid` },
          ].map((s) => (
            <div key={s.label} className="bg-card p-4 sm:p-5">
              <p className="text-muted-foreground text-sm">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{s.value}</p>
              <p className="text-muted-foreground mt-1 text-xs">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="grid min-w-0 content-start gap-6">
          {event.description && (
            <Section title="About">
              <p className="text-sm leading-relaxed whitespace-pre-line">{event.description}</p>
              <p className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 text-xs">
                {event.organizer && <span>Organised by {event.organizer.name}</span>}
                {event.committee && <span>{event.committee.name}</span>}
              </p>
            </Section>
          )}

          {staff && (
            <Section
              title="Ticket types"
              description="Member price applies to an active member's own ticket."
              actions={can(user, "tickets.manage") && event.status !== "CANCELLED" && <TicketTypeDialog eventId={id} />}
            >
              {event.ticketTypes.length ? (
                <ul className="grid gap-3">
                  {event.ticketTypes.map((t) => {
                    const row = stats?.byType.find((b) => b.id === t.id);
                    return (
                      <li key={t.id} className={cn("grid gap-1.5", !t.isActive && "opacity-60")}>
                        <div className="flex items-baseline gap-2 text-sm">
                          <span className="font-medium">{t.name}</span>
                          {t.membersOnly && <span className="text-primary text-xs">Members only</span>}
                          {!t.isActive && <span className="text-muted-foreground text-xs">Paused</span>}
                          <span className="text-muted-foreground ml-auto tabular-nums">
                            {formatINR(t.memberPricePaise)} / {formatINR(t.publicPricePaise)}
                          </span>
                          {can(user, "tickets.manage") && event.status !== "CANCELLED" && <TicketTypeDialog eventId={id} type={t} />}
                        </div>
                        <Meter value={t.allocated} max={t.quantity} />
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {t.allocated} of {t.quantity} sold or held{row && phase !== "UPCOMING" ? ` · ${row.checkedIn} checked in` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No ticket types yet. Add at least one before publishing.</p>
              )}
            </Section>
          )}

          {orders && (
            <Section
              title="Orders"
              description="Unpaid online orders hold seats for 48 hours unless the buyer has submitted a payment reference."
            >
              {orders.length ? (
                <div className="-mx-4 overflow-x-auto sm:-mx-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4 sm:pl-5">Order</TableHead>
                        <TableHead>Buyer</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="pr-4 text-right sm:pr-5">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="pl-4 sm:pl-5">
                            <span className="font-mono text-xs">{o.orderNumber}</span>
                            <span className="text-muted-foreground block text-xs">
                              {o.channel === "DOOR" ? "Door" : "Online"} · {fmtRelative(o.createdAt)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {o.buyerName}
                            <span className="text-muted-foreground block text-xs">
                              {o._count.tickets} ticket{o._count.tickets > 1 ? "s" : ""}
                              {o.claimedReference && ` · ref ${o.claimedReference}`}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{o.totalPaise ? formatINR(o.totalPaise) : "Free"}</TableCell>
                          <TableCell className="pr-4 text-right sm:pr-5">
                            <span className={cn("text-xs font-medium", ORDER_TONE[o.status])}>
                              {o.status.replace("_", " ").toLowerCase()}
                            </span>
                            <span className="ml-1 inline-flex">
                              {o.status === "PENDING_PAYMENT" && (can(user, "tickets.sell") || can(user, "finance.record_income")) && (
                                <ConfirmOrderDialog orderId={o.id} totalPaise={o.totalPaise} claimedReference={o.claimedReference} />
                              )}
                              {((o.status === "PENDING_PAYMENT" && can(user, "tickets.sell")) ||
                                (o.status === "PAID" && can(user, "tickets.refund"))) && (
                                <VoidOrderButton orderId={o.id} paid={o.status === "PAID"} />
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No orders yet.</p>
              )}
            </Section>
          )}

          {incidents && (
            <Section title="Incidents" actions={event.status === "PUBLISHED" && phase !== "UPCOMING" && <IncidentDialog eventId={id} />}>
              {incidents.length ? (
                <ul className="divide-y">
                  {incidents.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          i.resolvedAt
                            ? "bg-muted-foreground/40"
                            : i.severity === "HIGH"
                              ? "bg-destructive"
                              : i.severity === "MEDIUM"
                                ? "bg-warning"
                                : "bg-info",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium", i.resolvedAt && "text-muted-foreground")}>{i.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {i.severity.toLowerCase()} · {i.location ?? "—"} · {fmtDateTime(i.createdAt)} · {i.reportedBy?.name}
                        </p>
                        {i.resolution && <p className="text-muted-foreground mt-0.5 text-xs">✓ {i.resolution}</p>}
                      </div>
                      {!i.resolvedAt && can(user, "events.edit") && <ResolveIncidentButton incidentId={i.id} />}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No incidents logged.</p>
              )}
            </Section>
          )}
        </div>

        <aside className="grid content-start gap-6">
          <Section title="Tickets" actions={<SalesBadge state={sales} />}>
            {sales === "OPEN" && activeTypes.length ? (
              <BuyTicketsPanel
                eventId={id}
                memberPriceAvailable={isMember && myMemberTickets === 0}
                types={activeTypes.map((t) => ({
                  id: t.id,
                  name: t.name,
                  description: t.description,
                  memberPricePaise: t.memberPricePaise,
                  publicPricePaise: t.publicPricePaise,
                  remaining: Math.max(0, Math.min(t.quantity - t.allocated, event.capacity - event.allocated)),
                  maxPerOrder: t.maxPerOrder,
                  membersOnly: t.membersOnly,
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {sales === "NOT_YET" && event.salesOpenAt
                  ? `Tickets go on sale ${fmtDateTime(event.salesOpenAt)}.`
                  : sales === "SOLD_OUT"
                    ? "Sold out."
                    : event.status === "DRAFT"
                      ? "Draft — not visible to members yet."
                      : "Ticket sales are closed."}
              </p>
            )}
            {!isMember && sales === "OPEN" && (
              <p className="text-muted-foreground mt-3 text-xs">
                <Link href="/me" className="text-primary hover:underline">
                  Become a member
                </Link>{" "}
                to get member pricing.
              </p>
            )}
          </Section>

          {myOrders.length > 0 && (
            <Section
              title="Your orders"
              actions={
                <Link href="/me/tickets" className="text-primary text-sm hover:underline">
                  My tickets
                </Link>
              }
            >
              <ul className="grid gap-2 text-sm">
                {myOrders.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs">{o.orderNumber}</span> · {o._count.tickets} ticket
                      {o._count.tickets > 1 ? "s" : ""}
                    </span>
                    <span className={cn("text-xs font-medium", ORDER_TONE[o.status])}>{o.status.replace("_", " ").toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {stats && (
            <Section title="Capacity">
              <div className="flex items-center gap-3 text-sm">
                <UsersIcon className="text-muted-foreground size-4" />
                <span className="tabular-nums">
                  {event.allocated} / {event.capacity}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">{Math.round((event.allocated / event.capacity) * 100)}% full</span>
              </div>
              <Meter value={event.allocated} max={event.capacity} className="mt-2" />
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
