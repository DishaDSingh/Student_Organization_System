import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { EventForm } from "../event-forms";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const user = await requirePermission("events.create");
  const committees = await db.committee.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="New event" description="Starts as a draft. Add ticket types, then publish to open sales." back={{ href: "/events", label: "Events" }} />
      <EventForm
        committees={committees}
        defaults={{
          title: "",
          description: "",
          category: "",
          venue: "",
          startsAt: "",
          endsAt: "",
          capacity: "",
          salesOpenAt: "",
          salesCloseAt: "",
          organizer: { id: user.id, name: user.name },
          committeeId: "",
        }}
      />
    </>
  );
}
