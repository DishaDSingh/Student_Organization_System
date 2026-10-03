"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { people } from "@/lib/format";
import { AUDIENCES, audienceWhere, draftFromBrief, type Audience } from "@/lib/announcements";
import { aiConfigured } from "@/lib/ai/claude";
import { draftAnnouncementSchema, publishAnnouncementSchema, saveAnnouncementSchema } from "@/lib/validation/schemas";

/** ANALYZE → PROPOSE: create a draft. Nothing is sent. */
export const draftAnnouncement = guardedAction(
  { permission: "announcements.create", schema: draftAnnouncementSchema },
  async (input, actor) => {
    const org = await db.organization.findFirst({ select: { name: true } });
    const d = await draftFromBrief(input.brief, org?.name ?? "the committee", input.useAi && aiConfigured());
    const a = await db.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: { title: d.title, body: d.body, audience: input.audience, source: d.source, createdById: actor.id },
      });
      await audit(tx, {
        actor,
        action: d.source === "ai" ? "announcement.ai_draft" : "announcement.draft",
        entityType: "Announcement",
        entityId: a.id,
        summary: `${d.source === "ai" ? "AI drafted" : "Drafted"} announcement "${a.title}" (not sent)`,
      });
      return a;
    });
    revalidatePath("/announcements");
    return ok({ id: a.id }, d.source === "ai" ? "AI wrote a draft — review it before sending" : "Draft created — edit it before sending");
  },
);

/** HUMAN REVIEWS: edit the draft. */
export const saveAnnouncement = guardedAction(
  { permission: "announcements.create", schema: saveAnnouncementSchema },
  async (input, actor) => {
    const a = await db.announcement.findUnique({ where: { id: input.announcementId } });
    if (!a) return fail("Announcement not found.");
    if (a.status !== "DRAFT") return fail("Published announcements can't be edited.");
    await db.$transaction(async (tx) => {
      await tx.announcement.update({ where: { id: a.id }, data: { title: input.title, body: input.body, audience: input.audience } });
      await audit(tx, {
        actor,
        action: "announcement.edit",
        entityType: "Announcement",
        entityId: a.id,
        summary: `Edited draft "${input.title}"`,
      });
    });
    revalidatePath(`/announcements/${a.id}`);
    return ok(undefined, "Draft saved");
  },
);

/**
 * CONFIRM → EXECUTE: only a publisher, only after confirming the exact
 * recipient count they were shown. If the audience changed meanwhile, ask again.
 */
export const publishAnnouncement = guardedAction(
  { permission: "announcements.publish", schema: publishAnnouncementSchema },
  async (input, actor) => {
    const a = await db.announcement.findUnique({ where: { id: input.announcementId } });
    if (!a) return fail("Announcement not found.");
    if (a.status !== "DRAFT") return fail("This was already sent.");
    const where = audienceWhere(a.audience as Audience);
    const users = await db.user.findMany({ where, select: { id: true } });
    if (users.length !== input.confirmRecipients)
      return fail(`The audience changed — it's now ${people(users.length)}. Please confirm again.`);

    const sent = await db.$transaction(async (tx) => {
      const { count } = await tx.announcement.updateMany({
        where: { id: a.id, status: "DRAFT" },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: actor.id, recipients: users.length },
      });
      if (!count) return false;
      await tx.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: "announcement",
          title: a.title,
          body: a.body.slice(0, 180) + (a.body.length > 180 ? "…" : ""),
          link: "/announcements",
          dedupeKey: `announcement:${a.id}:${u.id}`,
        })),
        skipDuplicates: true,
      });
      await audit(tx, {
        actor,
        action: "announcement.publish",
        entityType: "Announcement",
        entityId: a.id,
        summary: `Sent "${a.title}" to ${people(users.length)} (${AUDIENCES[a.audience as Audience].toLowerCase()})${a.source === "ai" ? " — AI-drafted, human-approved" : ""}`,
      });
      return true;
    });
    if (!sent) return fail("This was already sent.");
    revalidatePath("/announcements");
    revalidatePath("/dashboard");
    return ok(undefined, `Sent to ${people(users.length)}`);
  },
);
