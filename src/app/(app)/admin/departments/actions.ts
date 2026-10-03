"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { deleteByIdSchema, departmentSchema } from "@/lib/validation/schemas";

export const saveDepartment = guardedAction({ permission: "departments.manage", schema: departmentSchema }, async (input, actor) => {
  const { departmentId, ...rest } = input;
  const data = { ...rest, description: rest.description ?? null, headId: rest.headId ?? null };

  if (data.headId && !(await db.user.findUnique({ where: { id: data.headId }, select: { id: true } }))) {
    return fail("Selected head no longer exists.", { headId: ["Pick another person"] });
  }

  await db.$transaction(async (tx) => {
    if (departmentId) {
      const before = await tx.department.findUniqueOrThrow({
        where: { id: departmentId },
        select: { name: true, code: true, description: true, headId: true },
      });
      const changes = diff(before, data);
      if (!changes.changed) return;
      await tx.department.update({ where: { id: departmentId }, data });
      await audit(tx, {
        actor,
        action: "department.update",
        entityType: "Department",
        entityId: departmentId,
        summary: `Updated department ${data.name}`,
        before: changes.before,
        after: changes.after,
      });
    } else {
      const d = await tx.department.create({ data });
      await audit(tx, {
        actor,
        action: "department.create",
        entityType: "Department",
        entityId: d.id,
        summary: `Created department ${d.name} (${d.code})`,
        after: data,
      });
    }
  });
  revalidatePath("/admin/departments");
  return ok(undefined, departmentId ? "Department saved" : "Department created");
});

export const deleteDepartment = guardedAction({ permission: "departments.manage", schema: deleteByIdSchema }, async ({ id }, actor) => {
  const d = await db.department.findUnique({
    where: { id },
    select: { name: true, _count: { select: { members: true, committees: true } } },
  });
  if (!d) return fail("Department not found.");

  await db.$transaction(async (tx) => {
    // Members and committees are kept; they simply lose the department link.
    await tx.department.delete({ where: { id } });
    await audit(tx, {
      actor,
      action: "department.delete",
      entityType: "Department",
      entityId: id,
      summary: `Deleted department ${d.name} (${d._count.members} members and ${d._count.committees} committees unlinked)`,
      before: { name: d.name },
    });
  });
  revalidatePath("/admin/departments");
  return ok(undefined, "Department deleted");
});
