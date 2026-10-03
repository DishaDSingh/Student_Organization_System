"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth/current-user";
import { fmtDateTime } from "@/lib/format";
import { nextReceiptNumber } from "@/lib/membership/service";
import { formatINR, rupeesToPaise } from "@/lib/membership/rules";
import { CATEGORY_INTERESTS, rankCandidates } from "@/lib/volunteers/rules";
import { loadCandidates } from "@/lib/volunteers/load";
import { id } from "@/lib/validation/common";
import {
  assignTaskSchema,
  donationSchema,
  fundraiserSchema,
  logHoursSchema,
  PAYMENT_METHOD_LABEL,
  taskSchema,
  taskStatusSchema,
} from "@/lib/validation/schemas";

const ASSIGNERS = ["fundraisers.manage", "volunteers.assign_tasks"] as const;
const canAssign = (u: CurrentUser) => ASSIGNERS.some((p) => u.permissions.has(p));

function refresh(t: { fundraiserId?: string | null; eventId?: string | null }) {
  if (t.fundraiserId) revalidatePath(`/fundraisers/${t.fundraiserId}`);
  if (t.eventId) revalidatePath(`/events/${t.eventId}`);
  revalidatePath("/fundraisers");
  revalidatePath("/me/volunteering");
}

// ─── Fundraisers ─────────────────────────────────────────────────────────────

export const saveFundraiser = guardedAction({ permission: "fundraisers.manage", schema: fundraiserSchema }, async (input, actor) => {
  const { fundraiserId, goalRupees, ...rest } = input;
  const data = {
    ...rest,
    description: rest.description ?? null,
    leadId: rest.leadId ?? actor.id,
    committeeId: rest.committeeId ?? null,
    eventId: rest.eventId ?? null,
    goalPaise: goalRupees * 100,
    endsAt: new Date(new Date(rest.endsAt).setHours(23, 59, 59, 999)),
  };
  const fid = await db.$transaction(async (tx) => {
    if (fundraiserId) {
      const before = await tx.fundraiser.findUniqueOrThrow({
        where: { id: fundraiserId },
        select: {
          title: true,
          description: true,
          cause: true,
          goalPaise: true,
          startsAt: true,
          endsAt: true,
          status: true,
          leadId: true,
          committeeId: true,
          eventId: true,
        },
      });
      const changes = diff(before, data);
      if (!changes.changed) return fundraiserId;
      await tx.fundraiser.update({ where: { id: fundraiserId }, data });
      await audit(tx, {
        actor,
        action: "fundraiser.update",
        entityType: "Fundraiser",
        entityId: fundraiserId,
        summary: `Updated fundraiser "${data.title}" (${Object.keys(changes.after).join(", ")})`,
        before: changes.before,
        after: changes.after,
      });
      return fundraiserId;
    }
    const f = await tx.fundraiser.create({ data: { ...data, createdById: actor.id } });
    await audit(tx, {
      actor,
      action: "fundraiser.create",
      entityType: "Fundraiser",
      entityId: f.id,
      summary: `Created fundraiser "${f.title}" — goal ${formatINR(f.goalPaise)}`,
      after: data,
    });
    return f.id;
  });
  refresh({ fundraiserId: fid });
  return ok({ id: fid }, fundraiserId ? "Fundraiser saved" : "Fundraiser created");
});

export const recordDonation = guardedAction(
  { permission: ["fundraisers.manage", "finance.record_income"], schema: donationSchema },
  async (input, actor) => {
    const f = await db.fundraiser.findUnique({ where: { id: input.fundraiserId }, select: { title: true, status: true } });
    if (!f) return fail("Fundraiser not found.");
    if (f.status === "CANCELLED") return fail("This fundraiser was cancelled.");
    const member = input.memberId ? await db.user.findUnique({ where: { id: input.memberId }, select: { id: true, name: true } }) : null;
    const donor = input.anonymous ? "Anonymous" : (member?.name ?? input.donorName!);
    const amountPaise = rupeesToPaise(input.amountRupees);

    const payment = await db.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          receiptNumber: await nextReceiptNumber(tx),
          purpose: "DONATION",
          payerId: member?.id ?? null,
          fundraiserId: input.fundraiserId,
          amountPaise,
          method: input.method,
          reference: input.reference ?? null,
          receivedById: actor.id,
          notes: [input.anonymous ? null : `Donor: ${donor}`, input.note].filter(Boolean).join(" · ") || null,
        },
      });
      await audit(tx, {
        actor,
        action: "donation.record",
        entityType: "Fundraiser",
        entityId: input.fundraiserId,
        summary: `Recorded ${formatINR(amountPaise)} donation from ${donor} to "${f.title}" (${PAYMENT_METHOD_LABEL[input.method]}, receipt ${p.receiptNumber})`,
      });
      return p;
    });
    refresh({ fundraiserId: input.fundraiserId });
    return ok({ receipt: payment.receiptNumber }, `Donation recorded — receipt ${payment.receiptNumber}`);
  },
);

// ─── Tasks ───────────────────────────────────────────────────────────────────

async function notifyAssignee(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  task: { id: string; title: string; dueAt: Date | null; fundraiserId: string | null; eventId: string | null },
  userId: string,
  by: string,
) {
  await tx.notification.create({
    data: {
      userId,
      type: "task.assigned",
      title: `New task: ${task.title}`,
      body: `${by} assigned this to you${task.dueAt ? `, due ${fmtDateTime(task.dueAt)}` : ""}.`,
      link: "/me/volunteering",
    },
  });
}

export const saveTask = guardedAction({ permission: [...ASSIGNERS], schema: taskSchema }, async (input, actor) => {
  const { taskId, ...rest } = input;
  const data = {
    ...rest,
    description: rest.description ?? null,
    fundraiserId: rest.fundraiserId ?? null,
    eventId: rest.eventId ?? null,
    assigneeId: rest.assigneeId ?? null,
    dueAt: rest.dueAt ?? null,
    estimatedHours: rest.estimatedHours ?? null,
  };
  const task = await db.$transaction(async (tx) => {
    if (taskId) {
      const before = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      const t = await tx.task.update({ where: { id: taskId }, data });
      if (data.assigneeId && data.assigneeId !== before.assigneeId) await notifyAssignee(tx, t, data.assigneeId, actor.name);
      await audit(tx, { actor, action: "task.update", entityType: "Task", entityId: taskId, summary: `Updated task "${t.title}"` });
      return t;
    }
    const t = await tx.task.create({ data: { ...data, createdById: actor.id } });
    if (t.assigneeId) await notifyAssignee(tx, t, t.assigneeId, actor.name);
    await audit(tx, {
      actor,
      action: "task.create",
      entityType: "Task",
      entityId: t.id,
      summary: `Created task "${t.title}"${t.dueAt ? ` due ${fmtDateTime(t.dueAt)}` : ""}`,
    });
    return t;
  });
  refresh(task);
  return ok({ id: task.id }, taskId ? "Task saved" : "Task created");
});

export const assignTask = guardedAction({ permission: [...ASSIGNERS], schema: assignTaskSchema }, async ({ taskId, assigneeId }, actor) => {
  const t = await db.task.findUnique({ where: { id: taskId }, include: { assignee: { select: { name: true } } } });
  if (!t) return fail("Task not found.");
  if (t.assigneeId === assigneeId) return ok(undefined);
  const person = assigneeId ? await db.user.findUnique({ where: { id: assigneeId }, select: { name: true, status: true } }) : null;
  if (assigneeId && (!person || person.status === "SUSPENDED")) return fail("That person can't take tasks.");
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { assigneeId } });
    if (assigneeId) await notifyAssignee(tx, t, assigneeId, actor.name);
    await audit(tx, {
      actor,
      action: "task.assign",
      entityType: "Task",
      entityId: taskId,
      summary: assigneeId
        ? `Assigned "${t.title}" to ${person!.name}${t.assignee ? ` (was ${t.assignee.name})` : ""}`
        : `Unassigned "${t.title}" from ${t.assignee?.name}`,
    });
  });
  refresh(t);
  return ok(undefined, assigneeId ? `Assigned to ${person!.name}` : "Unassigned");
});

/** Assignees update their own tasks; coordinators can update any. */
export const setTaskStatus = guardedAction({ schema: taskStatusSchema }, async ({ taskId, status }, actor) => {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) return fail("Task not found.");
  if (t.assigneeId !== actor.id && !canAssign(actor)) return fail("Only the assignee or a coordinator can update this task.");
  if (t.status === status) return ok(undefined);
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
    await audit(tx, {
      actor,
      action: "task.status",
      entityType: "Task",
      entityId: taskId,
      summary: `"${t.title}": ${t.status.toLowerCase().replace("_", " ")} → ${status.toLowerCase().replace("_", " ")}`,
    });
  });
  refresh(t);
  return ok(undefined, status === "DONE" ? "Nice work — task done" : "Updated");
});

export const logTaskHours = guardedAction({ schema: logHoursSchema }, async ({ taskId, hours }, actor) => {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) return fail("Task not found.");
  if (t.assigneeId !== actor.id) return fail("Log hours on your own tasks.");
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { loggedHours: { increment: hours } } });
    await audit(tx, {
      actor,
      action: "task.hours",
      entityType: "Task",
      entityId: taskId,
      summary: `${actor.name} logged ${hours}h on "${t.title}"`,
    });
  });
  refresh(t);
  return ok(undefined, `Logged ${hours}h`);
});

/** Smart matching for a task: ranked volunteers with the reasons for each score. */
export const suggestForTask = guardedAction({ permission: [...ASSIGNERS], schema: z.object({ taskId: id }) }, async ({ taskId }) => {
  const t = await db.task.findUnique({
    where: { id: taskId },
    include: { fundraiser: { select: { cause: true } }, event: { select: { category: true, startsAt: true } } },
  });
  if (!t) return fail("Task not found.");
  const interests = CATEGORY_INTERESTS[t.fundraiser?.cause ?? t.event?.category ?? ""] ?? [];
  const when = t.event?.startsAt ?? t.dueAt ?? null;
  const candidates = await loadCandidates();
  return ok(
    rankCandidates(
      { requiredSkills: t.requiredSkills, interests, when, estimatedHours: t.estimatedHours ?? 2 },
      candidates.filter((c) => c.userId !== t.assigneeId),
    ),
  );
});
