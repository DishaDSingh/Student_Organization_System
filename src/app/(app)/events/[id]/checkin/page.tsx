import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { canCheckIn, CHECKIN_OPENS_MINUTES } from "@/lib/events/rules";
import { fmtDateTime } from "@/lib/format";
import { DoorStation } from "./door";

export const metadata: Metadata = { title: "Door check-in" };

export default async function CheckInPage(props: PageProps<"/events/[id]/checkin">) {
  await requirePermission("tickets.checkin");
  const { id } = await props.params;
  const e = await db.event.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true, capacity: true },
  });
  if (!e) notFound();
  const open = canCheckIn(e);

  return (
    <>
      <PageHeader
        back={{ href: `/events/${id}`, label: e.title }}
        title="Door check-in"
        description={
          open
            ? `${e.title} — scan tickets as people arrive. Each ticket admits once.`
            : `Check-in opens ${CHECKIN_OPENS_MINUTES / 60} hours before the start (${fmtDateTime(e.startsAt)}). You can still sell tickets and test the scanner.`
        }
      />
      <DoorStation eventId={id} capacity={e.capacity} />
    </>
  );
}
