import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { TicketIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, Section } from "@/components/common";
import { QrImage } from "@/components/membership";
import { PhaseBadge } from "@/components/events";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { eventPhase, HOLD_HOURS } from "@/lib/events/rules";
import { qrSvg, upiUri } from "@/lib/qr";
import { CancelMyOrderButton } from "../../events/event-forms";

export const metadata: Metadata = { title: "My tickets" };

export default async function MyTicketsPage() {
  const user = await requireUser();
  const [orders, org] = await Promise.all([
    db.ticketOrder.findMany({
      where: { buyerId: user.id, status: { in: ["PAID", "PENDING_PAYMENT", "REFUNDED"] } },
      orderBy: { event: { startsAt: "desc" } },
      include: {
        event: { select: { id: true, title: true, venue: true, startsAt: true, endsAt: true, status: true } },
        tickets: { orderBy: { createdAt: "asc" }, include: { ticketType: { select: { name: true } } } },
      },
    }),
    db.organization.findFirst({ select: { name: true, shortName: true, upiId: true } }),
  ]);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const now = new Date();
  const upcoming = orders.filter((o) => o.event.endsAt >= now && o.event.status !== "CANCELLED");
  const past = orders.filter((o) => !upcoming.includes(o));

  // Pre-render QR codes server-side (only for upcoming, paid tickets and pending payments).
  const qr = new Map<string, string>();
  for (const o of upcoming) {
    if (o.status === "PAID") for (const t of o.tickets.filter((t) => t.status === "VALID")) qr.set(t.id, await qrSvg(`${origin}/t/${t.code}`));
    if (o.status === "PENDING_PAYMENT" && org?.upiId)
      qr.set(o.id, await qrSvg(upiUri({ upiId: org.upiId, payee: org.name, amountPaise: o.totalPaise, note: `${org.shortName} ${o.orderNumber}` })));
  }

  return (
    <>
      <PageHeader
        title="My tickets"
        description="Show a ticket's QR at the door. Each ticket admits one person, once."
        actions={
          <Link href="/events" className="text-primary self-center text-sm hover:underline">
            Browse events
          </Link>
        }
      />

      {orders.length === 0 ? (
        <EmptyState icon={TicketIcon} title="No tickets yet">
          <Link href="/events" className="text-primary hover:underline">
            See what&apos;s coming up
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          {upcoming.map((o) => (
            <section key={o.id} className="grid gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/events/${o.event.id}`} className="text-lg font-semibold hover:underline">
                  {o.event.title}
                </Link>
                <span className="text-muted-foreground text-sm">
                  {fmtDateTime(o.event.startsAt)} · {o.event.venue}
                </span>
                <span className="text-muted-foreground ml-auto font-mono text-xs">{o.orderNumber}</span>
              </div>

              {o.status === "PENDING_PAYMENT" ? (
                <Section title={`Pay ${formatINR(o.totalPaise)} to confirm`} description={`Seats are held for ${HOLD_HOURS} hours. Pay by UPI or at the council desk.`}>
                  <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                    {qr.get(o.id) ? <QrImage svg={qr.get(o.id)!} label={`UPI payment QR for ${formatINR(o.totalPaise)}`} /> : null}
                    <div className="text-muted-foreground grid content-start gap-2 text-sm">
                      <p>
                        {o.tickets.length} ticket{o.tickets.length > 1 ? "s" : ""}: {o.tickets.map((t) => t.ticketType.name).join(", ")}
                      </p>
                      {o.claimedReference ? (
                        <p className="text-info">Reference {o.claimedReference} submitted — waiting for confirmation.</p>
                      ) : (
                        <p>Mention {o.orderNumber} in the UPI note so the treasurer can match it.</p>
                      )}
                      <div>
                        <CancelMyOrderButton orderId={o.id} />
                      </div>
                    </div>
                  </div>
                </Section>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {o.tickets.map((t) => (
                    <li key={t.id} className={cn("bg-card overflow-hidden rounded-2xl border", t.status !== "VALID" && "opacity-50")}>
                      <div className={cn("h-1.5", t.checkedInAt ? "bg-muted-foreground/40" : "bg-primary")} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{t.holderName}</p>
                            <p className="text-muted-foreground text-xs">
                              {t.ticketType.name} · {t.pricePaise ? formatINR(t.pricePaise) : "Free"}
                              {t.isMemberPrice && " · member price"}
                            </p>
                          </div>
                          <PhaseBadge phase={eventPhase(o.event, now)} />
                        </div>
                        {qr.get(t.id) && !t.checkedInAt ? (
                          <QrImage svg={qr.get(t.id)!} label={`Entry QR for ${t.holderName}`} className="mx-auto mt-3 w-44" />
                        ) : (
                          <p className="text-muted-foreground mt-3 text-sm">
                            {t.checkedInAt ? `Checked in ${fmtDateTime(t.checkedInAt)}` : `Ticket ${t.status.toLowerCase()}`}
                          </p>
                        )}
                        {!t.holderName.startsWith("Guest of") ? null : <p className="text-muted-foreground mt-2 text-center text-xs">Forward this QR to your guest</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {past.length > 0 && (
            <Section title="Past & cancelled">
              <ul className="divide-y text-sm">
                {past.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/events/${o.event.id}`} className="font-medium hover:underline">
                      {o.event.title}
                    </Link>
                    <span className="text-muted-foreground">{fmtDateTime(o.event.startsAt)}</span>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {o.status === "REFUNDED"
                        ? "Refunded"
                        : o.event.status === "CANCELLED"
                          ? "Event cancelled — refund pending"
                          : `${o.tickets.filter((t) => t.checkedInAt).length}/${o.tickets.length} attended`}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </>
  );
}
