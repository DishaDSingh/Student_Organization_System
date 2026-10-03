import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { AUDIENCES, countAudience, type Audience } from "@/lib/announcements";
import { AnnouncementEditor } from "./editor";

export const metadata: Metadata = { title: "Announcement draft" };

export default async function AnnouncementPage(props: PageProps<"/announcements/[id]">) {
  const user = await requirePermission("announcements.view");
  const { id } = await props.params;
  const a = await db.announcement.findUnique({ where: { id } });
  if (!a) notFound();
  if (a.status === "PUBLISHED") redirect("/announcements");
  // Counts per audience so the editor can show who will be notified before sending.
  const counts = Object.fromEntries(
    await Promise.all((Object.keys(AUDIENCES) as Audience[]).map(async (k) => [k, await countAudience(k)] as const)),
  );

  return (
    <>
      <PageHeader
        title="Review announcement"
        description="Edit anything. It's only sent when you confirm."
        back={{ href: "/announcements?tab=drafts", label: "Drafts" }}
      />
      <AnnouncementEditor
        announcement={{ id: a.id, title: a.title, body: a.body, audience: a.audience as Audience, source: a.source }}
        counts={counts as Record<Audience, number>}
        canEdit={can(user, "announcements.create")}
        canPublish={can(user, "announcements.publish")}
      />
    </>
  );
}
