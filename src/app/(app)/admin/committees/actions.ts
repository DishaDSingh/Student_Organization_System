"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { committeeMemberSchema, committeeSchema, deleteByIdSchema, removeCommitteeMemberSchema } from "@/lib/validation/schemas";

export const saveCommittee = guardedAction({ permission: "committees.manage", schema: committeeSchema }, async (input, actor) => {
  const { committeeId, ...rest } = input;
  const data = {
    ...rest,
    description: rest.description ?? null,
    departmentId: rest.departmentId ?? null,
    chairId: rest.chairId ?? null,
    termEnd: rest.termEnd ?? null,
  };

  const id = await db.$transaction(async (tx) => {
    if (committeeId) {
      const before = await tx.committee.findUniqueOrThrow({
        where: { id: committeeId },
        select: { name: true, description: true, departmentId: true, chairId: true, termStart: true, termEnd: true, isActive: true },
      });
      const changes = diff(before, data);
      if (!changes.changed) return committeeId;
      await tx.committee.update({ where: { id: committeeId }, data });
      // The chair is always a member of their committee.
      if (data.chairId) await upsertChair(tx, committeeId, data.chairId);
      await audit(tx, {
        actor,
        action: "committee.update",
        entityType: "Committee",
        entityId: committeeId,
        summary: `Updated committee ${data.name}`,
        before: changes.before,
        after: changes.after,
      });
      return committeeId;
    }
    const c = await tx.committee.create({ data });
    if (data.chairId) await upsertChair(tx, c.id, data.chairId);
    await audit(tx, {
      actor,
      action: "committee.create",
      entityType: "Committee",
      entityId: c.id,
      summary: `Created committee ${c.name}`,
      after: data,
    });
    return c.id;
  });

  revalidatePath("/admin/committees");
  revalidatePath(`/admin/committees/${id}`);
  return ok({ id }, committeeId ? "Committee saved" : "Committee created");
});

async function upsertChair(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], committeeId: string, userId: string) {
  await tx.committeeMember.upsert({
    where: { committeeId_userId: { committeeId, userId } },
    create: { committeeId, userId, position: "Chair" },
    update: { position: "Chair" },
  });
}

export const addCommitteeMember = guardedAction(
  { permission: "committees.manage", schema: committeeMemberSchema },
  async (input, actor) => {
    const [committee, user] = await Promise.all([
      db.committee.findUnique({ where: { id: input.committeeId }, select: { name: true } }),
      db.user.findUnique({ where: { id: input.userId }, select: { name: true, status: true } }),
    ]);
    if (!committee || !user) return fail("Committee or person not found.");
    if (user.status === "SUSPENDED") return fail(`${user.name} is suspended and can't join committees.`);

    const existing = await db.committeeMember.findUnique({
      where: { committeeId_userId: { committeeId: input.committeeId, userId: input.userId } },
    });
    await db.$transaction(async (tx) => {
      await tx.committeeMember.upsert({
        where: { committeeId_userId: { committeeId: input.committeeId, userId: input.userId } },
        create: input,
        update: { position: input.position },
      });
      await audit(tx, {
        actor,
        action: existing ? "committee.member.update" : "committee.member.add",
        entityType: "Committee",
        entityId: input.committeeId,
        summary: existing
          ? `Changed ${user.name}'s position on ${committee.name}: ${existing.position} → ${input.position}`
          : `Added ${user.name} to ${committee.name} as ${input.position}`,
        before: existing ? { position: existing.position } : null,
        after: { userId: input.userId, position: input.position },
      });
    });
    revalidatePath(`/admin/committees/${input.committeeId}`);
    return ok(undefined, existing ? "Position updated" : `${user.name} added`);
  },
);

export const removeCommitteeMember = guardedAction(
  { permission: "committees.manage", schema: removeCommitteeMemberSchema },
  async ({ committeeId, userId }, actor) => {
    const m = await db.committeeMember.findUnique({
      where: { committeeId_userId: { committeeId, userId } },
      select: { position: true, user: { select: { name: true } }, committee: { select: { name: true, chairId: true } } },
    });
    if (!m) return fail("Not a member.");
    if (m.committee.chairId === userId) return fail("Assign a different chair before removing the current one.");

    await db.$transaction(async (tx) => {
      await tx.committeeMember.delete({ where: { committeeId_userId: { committeeId, userId } } });
      await audit(tx, {
        actor,
        action: "committee.member.remove",
        entityType: "Committee",
        entityId: committeeId,
        summary: `Removed ${m.user.name} (${m.position}) from ${m.committee.name}`,
        before: { userId, position: m.position },
      });
    });
    revalidatePath(`/admin/committees/${committeeId}`);
    return ok(undefined, `${m.user.name} removed`);
  },
);

export const deleteCommittee = guardedAction({ permission: "committees.manage", schema: deleteByIdSchema }, async ({ id }, actor) => {
  const c = await db.committee.findUnique({ where: { id }, select: { name: true, _count: { select: { members: true } } } });
  if (!c) return fail("Committee not found.");
  await db.$transaction(async (tx) => {
    await tx.committee.delete({ where: { id } });
    await audit(tx, {
      actor,
      action: "committee.delete",
      entityType: "Committee",
      entityId: id,
      summary: `Deleted committee ${c.name} (${c._count.members} members)`,
      before: { name: c.name },
    });
  });
  revalidatePath("/admin/committees");
  return ok(undefined, "Committee deleted");
});
