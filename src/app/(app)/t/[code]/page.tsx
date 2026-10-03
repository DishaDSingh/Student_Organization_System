import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2Icon, CircleAlertIcon, ScanLineIcon, XCircleIcon } from "lucide-react";
import { can, requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { checkInTicket } from "../../events/actions";

export const metadata: Metadata = { title: "Ticket" };

/**
 * Where a ticket QR lands when scanned with a plain phone camera.
 * Door staff check the ticket in; the holder is sent to their tickets.
 */
export default async function TicketScanPage(props: PageProps<"/t/[code]">) {
  const user = await requireUser();
  const { code } = await props.params;

  if (!can(user, "tickets.checkin")) {
    const mine = await db.ticket.count({ where: { code, order: { buyerId: user.id } } });
    redirect(mine ? "/me/tickets" : "/forbidden");
  }

  const res = await checkInTicket({ code });
  if (!res.ok) redirect("/forbidden");
  const r = res.data;
  const tone = r.result === "ADMITTED" ? "success" : r.result === "ALREADY_IN" ? "warning" : "destructive";
  const Icon = r.result === "ADMITTED" ? CheckCircle2Icon : r.result === "ALREADY_IN" ? CircleAlertIcon : XCircleIcon;
  const eventId = (await db.ticket.findUnique({ where: { code }, select: { eventId: true } }))?.eventId;

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <section
        className={cn(
          "flex flex-col items-center rounded-2xl border-2 p-6 text-center",
          tone === "success" && "border-success/40 bg-success/8",
          tone === "warning" && "border-warning/50 bg-warning/10",
          tone === "destructive" && "border-destructive/40 bg-destructive/6",
        )}
      >
        <Icon className={cn("size-16", tone === "success" ? "text-success" : tone === "warning" ? "text-amber-600" : "text-destructive")} />
        <p className="mt-3 text-2xl font-semibold">{r.result === "ADMITTED" ? "Admit" : r.result === "ALREADY_IN" ? "Already checked in" : "Do not admit"}</p>
        {"holderName" in r && r.holderName && <p className="mt-1 font-medium">{r.holderName}</p>}
        {"eventTitle" in r && r.eventTitle && <p className="text-muted-foreground text-sm">{r.eventTitle}</p>}
        {r.result === "REJECTED" && <p className="text-muted-foreground mt-2 text-sm">{r.reason}</p>}
      </section>
      {eventId && (
        <Button asChild size="lg">
          <Link href={`/events/${eventId}/checkin`}>
            <ScanLineIcon /> Open door scanner
          </Link>
        </Button>
      )}
    </div>
  );
}
