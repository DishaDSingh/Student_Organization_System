import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { aiConfigured } from "@/lib/ai/claude";
import { param } from "@/lib/format";
import { DraftForm } from "./draft-form";

export const metadata: Metadata = { title: "New announcement" };

export default async function NewAnnouncementPage(props: PageProps<"/announcements/new">) {
  await requirePermission("announcements.create");
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader
        title="New announcement"
        description="Say what it's about in a sentence or two. You'll get a draft to edit — nothing is sent yet."
        back={{ href: "/announcements?tab=drafts", label: "Announcements" }}
      />
      <DraftForm
        ai={aiConfigured()}
        brief={param(sp.brief) ?? ""}
        audience={["EXPIRING", "VOLUNTEERS", "ALL"].find((a) => a === param(sp.audience)) ?? "MEMBERS"}
      />
    </>
  );
}
