import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { toDateTimeInput } from "@/lib/events/load";
import { EventForm } from "../../event-forms";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage(props: PageProps<"/events/[id]/edit">) {
  await requirePermission("events.edit");
  const { id } = await props.params;
  const [e, committees] = await Promise.all([
    db.event.findUnique({ where: { id }, include: { organizer: { select: { id: true, name: true } } } }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!e) notFound();

  return (
    <>
      <PageHeader title={`Edit ${e.title}`} back={{ href: `/events/${e.id}`, label: e.title }} />
      <EventForm
        committees={committees}
        defaults={{
          eventId: e.id,
          title: e.title,
          description: e.description ?? "",
          category: e.category,
          venue: e.venue,
          startsAt: toDateTimeInput(e.startsAt),
          endsAt: toDateTimeInput(e.endsAt),
          capacity: e.capacity,
          salesOpenAt: toDateTimeInput(e.salesOpenAt),
          salesCloseAt: toDateTimeInput(e.salesCloseAt),
          organizer: e.organizer,
          committeeId: e.committeeId ?? "",
        }}
      />
    </>
  );
}
