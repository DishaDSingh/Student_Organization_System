import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { PhaseBadge } from "@/components/events";
import { eventPhase } from "@/lib/events/rules";
import { CommandCenter } from "./command-center";

export const metadata: Metadata = { title: "Command center" };

export default async function CommandCenterPage(props: PageProps<"/events/[id]/live">) {
  const user = await requirePermission("events.view");
  const { id } = await props.params;
  const e = await db.event.findUnique({
    where: { id },
    select: { id: true, title: true, venue: true, status: true, startsAt: true, endsAt: true, capacity: true },
  });
  if (!e) notFound();

  return (
    <>
      <PageHeader
        back={{ href: `/events/${id}`, label: e.title }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Event control room
            <PhaseBadge phase={eventPhase(e)} />
          </span>
        }
        description={`${e.title} · ${e.venue}. Updates every few seconds from the door scanners.`}
      />
      <CommandCenter eventId={id} capacity={e.capacity} canCheckIn={can(user, "tickets.checkin")} />
    </>
  );
}
