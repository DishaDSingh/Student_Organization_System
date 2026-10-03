"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { guardGrant } from "@/lib/rbac/guards";
import { people } from "@/lib/format";
import { createRoleSchema, roleIdSchema, setRolePermissionsSchema, updateRoleSchema } from "@/lib/validation/schemas";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "role";

export const createRole = guardedAction({ permission: "roles.manage", schema: createRoleSchema }, async (input, actor) => {
  const { cloneFromId, ...data } = input;
  const source = cloneFromId
    ? await db.role.findUnique({ where: { id: cloneFromId }, select: { name: true, permissions: { select: { permissionKey: true } } } })
    : null;
  if (cloneFromId && !source) return fail("The role to copy from no longer exists.");
  const permissions = source?.permissions.map((p) => p.permissionKey) ?? [];

  const grantError = guardGrant(actor, permissions);
  if (grantError) return fail(grantError);

  let key = `custom_${slug(data.name)}`;
  if (await db.role.findUnique({ where: { key }, select: { id: true } })) key = `${key}_${Date.now().toString(36)}`;

  const role = await db.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { ...data, key, isSystem: false, rank: 200, permissions: { create: permissions.map((permissionKey) => ({ permissionKey })) } },
    });
    await audit(tx, {
      actor,
      action: "role.create",
      entityType: "Role",
      entityId: role.id,
      summary: `Created custom role "${role.name}"${source ? ` (copied from ${source.name}, ${permissions.length} permissions)` : ""}`,
      after: { ...data, permissions },
    });
    return role;
  });
  revalidatePath("/admin/roles");
  return ok({ id: role.id }, "Role created");
});

export const updateRole = guardedAction({ permission: "roles.manage", schema: updateRoleSchema }, async ({ roleId, ...data }, actor) => {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true, description: true, color: true, isSystem: true } });
  if (!role) return fail("Role not found.");
  if (role.isSystem && data.name !== role.name)
    return fail("Built-in roles can't be renamed. Create a custom role instead.", { name: ["Built-in roles keep their name"] });

  const next = { name: data.name, description: data.description ?? null, color: data.color };
  const changes = diff({ name: role.name, description: role.description, color: role.color }, next);
  if (!changes.changed) return ok(undefined, "No changes to save");

  await db.$transaction(async (tx) => {
    await tx.role.update({ where: { id: roleId }, data: next });
    await audit(tx, {
      actor,
      action: "role.update",
      entityType: "Role",
      entityId: roleId,
      summary: `Updated role "${next.name}"`,
      before: changes.before,
      after: changes.after,
    });
  });
  revalidatePath(`/admin/roles/${roleId}`);
  return ok(undefined, "Role saved");
});

export const setRolePermissions = guardedAction(
  { permission: "roles.manage", schema: setRolePermissionsSchema },
  async ({ roleId, permissions }, actor) => {
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { name: true, permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } },
    });
    if (!role) return fail("Role not found.");

    const current = new Set(role.permissions.map((p) => p.permissionKey));
    const next = new Set<string>(permissions);
    const added = [...next].filter((k) => !current.has(k));
    const removed = [...current].filter((k) => !next.has(k));
    if (!added.length && !removed.length) return ok(undefined, "No changes to save");

    const grantError = guardGrant(actor, [...added, ...removed]);
    if (grantError) return fail(grantError);

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId, permissionKey: { in: removed } } });
      await tx.rolePermission.createMany({ data: added.map((permissionKey) => ({ roleId, permissionKey })) });
      await tx.role.update({ where: { id: roleId }, data: { updatedAt: new Date() } });
      await audit(tx, {
        actor,
        action: "role.permissions.update",
        entityType: "Role",
        entityId: roleId,
        summary: `Updated ${role.name} permissions (${[...added.map((k) => `+${k}`), ...removed.map((k) => `−${k}`)].join(", ")}) — affects ${people(role._count.users)}`,
        before: { removed },
        after: { added },
      });
    });
    revalidatePath(`/admin/roles/${roleId}`);
    return ok(undefined, `Saved — applies to ${people(role._count.users)} immediately`);
  },
);

export const deleteRole = guardedAction({ permission: "roles.manage", schema: roleIdSchema }, async ({ roleId }, actor) => {
  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { name: true, isSystem: true, permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } },
  });
  if (!role) return fail("Role not found.");
  if (role.isSystem) return fail("Built-in roles can't be deleted. Remove their permissions instead.");

  // Deleting revokes these permissions from everyone holding the role.
  const grantError = guardGrant(
    actor,
    role.permissions.map((p) => p.permissionKey),
  );
  if (grantError) return fail(grantError);

  await db.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: roleId } });
    await audit(tx, {
      actor,
      action: "role.delete",
      entityType: "Role",
      entityId: roleId,
      summary: `Deleted custom role "${role.name}" (removed from ${people(role._count.users)})`,
      before: { name: role.name, permissions: role.permissions.map((p) => p.permissionKey), holders: role._count.users },
    });
  });
  revalidatePath("/admin/roles");
  return ok(undefined, "Role deleted");
});
