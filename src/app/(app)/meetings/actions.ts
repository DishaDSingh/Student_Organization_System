"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { fmtDate, plural } from "@/lib/format";
import { extractMeeting } from "@/lib/meetings/ai";
import { id } from "@/lib/validation/common";
import { confirmMeetingSchema, meetingSchema } from "@/lib/validation/schemas";

export const createMeeting = guardedAction({ permission: "calendar.manage", schema: meetingSchema }, async (input, actor) => {
  const m = await db.$transaction(async (tx) => {
    const m = await tx.meeting.create({ data: { ...input, committeeId: input.committeeId ?? null, createdById: actor.id } });
    await audit(tx, {
      actor,
      action: "meeting.create",
      entityType: "Meeting",
      entityId: m.id,
      summary: `Added notes for "${m.title}" (${fmtDate(m.heldAt)})`,
    });
    return m;
  });
  revalidatePath("/meetings");
  return ok({ id: m.id }, "Notes saved");
});

/** Step 1 — the assistant reads the notes and proposes. Nothing is created yet. */
export const extractFromMeeting = guardedAction(
  { permission: "calendar.manage", schema: z.object({ meetingId: id }) },
  async ({ meetingId }, actor) => {
    const m = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!m) return fail("Meeting not found.");
    if (m.status === "CONFIRMED") return fail("This meeting was already confirmed.");
    const { data, source, notice } = await extractMeeting(m.notes, m.heldAt, m.title);

    // Suggest an owner for each action by matching the written name to a person.
    const people = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    const match = (owner: string | null) => {
      if (!owner) return null;
      const o = owner.toLowerCase();
      const exact = people.filter((p) => p.name.toLowerCase() === o);
      const first = people.filter((p) => p.name.toLowerCase().split(" ")[0] === o.split(" ")[0]);
      const pick = exact.length === 1 ? exact : first.length === 1 ? first : [];
      return pick[0]?.id ?? null; // ambiguous names stay unassigned — a person chooses
    };
    const extracted = { ...data, actions: data.actions.map((a) => ({ ...a, ownerId: match(a.owner) })) };

    await db.$transaction(async (tx) => {
      await tx.meeting.update({ where: { id: meetingId }, data: { extracted, source } });
      await audit(tx, {
        actor,
        action: source === "ai" ? "meeting.ai_extract" : "meeting.extract",
        entityType: "Meeting",
        entityId: meetingId,
        summary: `${source === "ai" ? "AI proposed" : "Extracted"} ${plural(data.decisions.length, "decision")} and ${plural(data.actions.length, "action item")} from "${m.title}" — waiting for review`,
      });
    });
    revalidatePath(`/meetings/${meetingId}`);
    return ok({ notice }, "Review what was found, then confirm");
  },
);

/** Step 2 — a person reviews, edits and confirms. Only now are tasks and memories created. */
export const confirmMeeting = guardedAction({ permission: "calendar.manage", schema: confirmMeetingSchema }, async (input, actor) => {
  const m = await db.meeting.findUnique({ where: { id: input.meetingId } });
  if (!m) return fail("Meeting not found.");
  if (m.status === "CONFIRMED") return fail("This meeting was already confirmed.");
  const chosen = input.actions.filter((a) => a.create);
  const owners = chosen.map((a) => a.ownerId).filter((v): v is string => !!v);
  if (owners.length && (await db.user.count({ where: { id: { in: owners }, status: { not: "SUSPENDED" } } })) !== new Set(owners).size)
    return fail("One of the chosen owners can't take tasks.");

  await db.$transaction(async (tx) => {
    for (const a of chosen) {
      const t = await tx.task.create({
        data: {
          title: a.task,
          meetingId: m.id,
          assigneeId: a.ownerId ?? null,
          dueAt: a.due ?? null,
          createdById: actor.id,
          priority: "MEDIUM",
          estimatedHours: 2,
        },
      });
      if (t.assigneeId) {
        await tx.notification.create({
          data: {
            userId: t.assigneeId,
            type: "task.assigned",
            title: `New task: ${t.title}`,
            body: `From the meeting "${m.title}".`,
            link: "/me/volunteering",
          },
        });
      }
    }
    // Decisions become part of the organization's memory.
    if (input.decisions.length) {
      await tx.memoryItem.createMany({
        data: input.decisions.map((d) => ({
          kind: "DECISION",
          title: d.slice(0, 140),
          body: `${d} (decided at "${m.title}", ${fmtDate(m.heldAt)})`,
          tags: ["meeting"],
          happenedAt: m.heldAt,
          meetingId: m.id,
          createdById: actor.id,
        })),
      });
    }
    await tx.meeting.update({
      where: { id: m.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        extracted: {
          summary: input.summary,
          decisions: input.decisions,
          questions: input.questions,
          actions: input.actions.map((a) => ({ task: a.task, ownerId: a.ownerId ?? null, due: a.due ?? null, created: a.create })),
        },
      },
    });
    await audit(tx, {
      actor,
      action: "meeting.confirm",
      entityType: "Meeting",
      entityId: m.id,
      summary: `Confirmed "${m.title}": created ${plural(chosen.length, "task")}, saved ${plural(input.decisions.length, "decision")} to memory`,
    });
  });
  revalidatePath(`/meetings/${m.id}`);
  revalidatePath("/meetings");
  return ok(undefined, chosen.length ? `Created ${plural(chosen.length, "task")}` : "Meeting confirmed");
});
