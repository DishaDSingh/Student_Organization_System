"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { guardGrant, guardSelf, guardTarget, permissionsOfRoles, wouldRemoveLastMaster } from "@/lib/rbac/guards";
import {
  createUserSchema,
  setOverridesSchema,
  setUserRolesSchema,
  setUserStatusSchema,
  updateUserSchema,
  userIdSchema,
} from "@/lib/validation/schemas";

const profileSelect = { name: true, email: true, phone: true, studentId: true, departmentId: true } as const;

export const createUser = guardedAction({ permission: "users.create", schema: createUserSchema }, async (input, actor) => {
  const { roleIds, ...profile } = input;
  if (roleIds.length && !actor.permissions.has("roles.assign")) return fail("You can create the account, but not assign roles.");

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await db
    .$transaction(async (tx) => {
      const grantError = guardGrant(actor, await permissionsOfRoles(tx, roleIds));
      if (grantError) throw new GuardError(grantError);

      const roles = await tx.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } });
      const user = await tx.user.create({
        data: {
          ...profile,
          passwordHash,
          status: "INVITED",
          roles: { create: roles.map((r) => ({ roleId: r.id, assignedById: actor.id })) },
        },
      });
      await audit(tx, {
        actor,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        summary: `Created account for ${user.name}${roles.length ? ` with roles: ${roles.map((r) => r.name).join(", ")}` : ""}`,
        after: { ...profile, roles: roles.map((r) => r.name) },
      });
      return user;
    })
    .catch(rethrowGuard);
  if ("error" in user) return fail(user.error);

  revalidatePath("/admin/users");
  return ok({ id: user.id, tempPassword }, "Account created");
});

export const updateUser = guardedAction({ permission: "users.edit", schema: updateUserSchema }, async (input, actor) => {
  const { userId, ...profile } = input;
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, isMasterAdmin: true, ...profileSelect } });
  if (!target) return fail("User not found.");
  const guard = guardTarget(actor, target);
  if (guard) return fail(guard);

  const { id: _id, isMasterAdmin: _m, ...before } = target;
  const normalized = {
    ...profile,
    phone: profile.phone ?? null,
    studentId: profile.studentId ?? null,
    departmentId: profile.departmentId ?? null,
  };
  const changes = diff(before, normalized);
  if (!changes.changed) return ok(undefined, "No changes to save");

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: normalized });
    await audit(tx, {
      actor,
      action: "user.update",
      entityType: "User",
      entityId: userId,
      summary: `Updated ${normalized.name}'s profile (${Object.keys(changes.after).join(", ")})`,
      before: changes.before,
      after: changes.after,
    });
  });
  revalidatePath(`/admin/users/${userId}`);
  return ok(undefined, "Profile saved");
});

export const setUserStatus = guardedAction(
  { permission: "users.suspend", schema: setUserStatusSchema },
  async ({ userId, status }, actor) => {
    if (userId === actor.id) return fail("You can't change your own account status.");
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, status: true, isMasterAdmin: true } });
    if (!target) return fail("User not found.");
    const guard = guardTarget(actor, target);
    if (guard) return fail(guard);
    if (target.status === status) return ok(undefined);

    const result = await db.$transaction(async (tx) => {
      if (status === "SUSPENDED" && target.isMasterAdmin && (await wouldRemoveLastMaster(tx, userId))) {
        return "You can't suspend the last active Master Admin.";
      }
      await tx.user.update({
        where: { id: userId },
        // Bumping the session version signs the user out everywhere, immediately.
        data: { status, ...(status === "SUSPENDED" ? { sessionVersion: { increment: 1 } } : {}) },
      });
      await audit(tx, {
        actor,
        action: "user.status.update",
        entityType: "User",
        entityId: userId,
        summary: `${status === "SUSPENDED" ? "Suspended" : "Reactivated"} ${target.name}`,
        before: { status: target.status },
        after: { status },
      });
      return null;
    });
    if (result) return fail(result);
    revalidatePath(`/admin/users/${userId}`);
    return ok(undefined, status === "SUSPENDED" ? "Account suspended and signed out" : "Account reactivated");
  },
);

export const resetUserPassword = guardedAction({ permission: "users.reset_password", schema: userIdSchema }, async ({ userId }, actor) => {
  if (userId === actor.id) return fail("Change your own password from your profile.");
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, isMasterAdmin: true } });
  if (!target) return fail("User not found.");
  const guard = guardTarget(actor, target);
  if (guard) return fail(guard);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await audit(tx, {
      actor,
      action: "user.password.reset",
      entityType: "User",
      entityId: userId,
      summary: `Reset password for ${target.name}`,
    });
  });
  return ok({ tempPassword }, "Temporary password generated");
});

export const setUserRoles = guardedAction(
  { permission: "roles.assign", schema: setUserRolesSchema },
  async ({ userId, roleIds }, actor) => {
    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, isMasterAdmin: true, roles: { select: { roleId: true, role: { select: { name: true } } } } },
    });
    if (!target) return fail("User not found.");
    const guard = guardTarget(actor, target) ?? guardSelf(actor, userId, "your own roles");
    if (guard) return fail(guard);

    const current = new Set(target.roles.map((r) => r.roleId));
    const next = new Set(roleIds);
    const added = roleIds.filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !next.has(id));
    if (!added.length && !removed.length) return ok(undefined, "No changes to save");

    const result = await db.$transaction(async (tx) => {
      // Both adding and removing a role counts as granting/revoking its permissions.
      const grantError = guardGrant(actor, await permissionsOfRoles(tx, [...added, ...removed]));
      if (grantError) return grantError;

      const names = Object.fromEntries(
        (await tx.role.findMany({ where: { id: { in: [...added, ...removed] } }, select: { id: true, name: true } })).map((r) => [
          r.id,
          r.name,
        ]),
      );
      if (added.some((id) => !names[id])) return "One of the selected roles no longer exists.";

      await tx.userRole.deleteMany({ where: { userId, roleId: { in: removed } } });
      await tx.userRole.createMany({ data: added.map((roleId) => ({ userId, roleId, assignedById: actor.id })) });
      await audit(tx, {
        actor,
        action: "user.roles.update",
        entityType: "User",
        entityId: userId,
        summary: `Changed ${target.name}'s roles: ${[...added.map((id) => `+${names[id]}`), ...removed.map((id) => `−${names[id]}`)].join(", ")}`,
        before: { roles: target.roles.map((r) => r.role.name) },
        after: { added: added.map((id) => names[id]), removed: removed.map((id) => names[id]) },
      });
      return null;
    });
    if (result) return fail(result);
    revalidatePath(`/admin/users/${userId}`);
    return ok(undefined, "Roles updated");
  },
);

export const setUserOverrides = guardedAction(
  { permission: "roles.assign", schema: setOverridesSchema },
  async ({ userId, overrides }, actor) => {
    const target = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        isMasterAdmin: true,
        permissionOverrides: { select: { permissionKey: true, effect: true, reason: true } },
      },
    });
    if (!target) return fail("User not found.");
    const guard = guardTarget(actor, target) ?? guardSelf(actor, userId, "your own permissions");
    if (guard) return fail(guard);
    if (new Set(overrides.map((o) => o.permissionKey)).size !== overrides.length)
      return fail("Each permission can only have one override.");

    const before = new Map(target.permissionOverrides.map((o) => [o.permissionKey, o]));
    const after = new Map<string, (typeof overrides)[number]>(overrides.map((o) => [o.permissionKey, o]));
    const changedKeys = [...new Set([...before.keys(), ...after.keys()])].filter(
      (k) => before.get(k)?.effect !== after.get(k)?.effect || (before.get(k)?.reason ?? undefined) !== after.get(k)?.reason,
    );
    if (!changedKeys.length) return ok(undefined, "No changes to save");

    const grantError = guardGrant(actor, changedKeys);
    if (grantError) return fail(grantError);

    await db.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });
      await tx.userPermission.createMany({
        data: overrides.map((o) => ({ userId, permissionKey: o.permissionKey, effect: o.effect, reason: o.reason, grantedById: actor.id })),
      });
      const describe = (k: string) => {
        const a = after.get(k);
        return a ? `${a.effect === "GRANT" ? "+" : "−"}${k}` : `reset ${k}`;
      };
      await audit(tx, {
        actor,
        action: "user.permissions.update",
        entityType: "User",
        entityId: userId,
        summary: `Changed ${target.name}'s permission overrides: ${changedKeys.map(describe).join(", ")}`,
        before: Object.fromEntries(changedKeys.map((k) => [k, before.get(k)?.effect ?? "inherit"])),
        after: Object.fromEntries(changedKeys.map((k) => [k, after.get(k)?.effect ?? "inherit"])),
      });
    });
    revalidatePath(`/admin/users/${userId}`);
    return ok(undefined, "Overrides saved");
  },
);

export const setMasterAdmin = guardedAction(
  { schema: z.object({ userId: z.string().min(1), value: z.boolean() }) },
  async ({ userId, value }, actor) => {
    if (!actor.isMasterAdmin) return fail("Only a Master Admin can do that.");
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, isMasterAdmin: true, status: true } });
    if (!target) return fail("User not found.");
    if (target.isMasterAdmin === value) return ok(undefined);
    if (value && target.status !== "ACTIVE") return fail("Only active accounts can become Master Admin.");

    const result = await db.$transaction(async (tx) => {
      if (!value && (await wouldRemoveLastMaster(tx, userId))) return "There must always be at least one Master Admin.";
      await tx.user.update({ where: { id: userId }, data: { isMasterAdmin: value } });
      await audit(tx, {
        actor,
        action: value ? "user.master.grant" : "user.master.revoke",
        entityType: "User",
        entityId: userId,
        summary: `${value ? "Made" : "Removed"} ${target.name} ${value ? "a" : "as"} Master Admin`,
        before: { isMasterAdmin: !value },
        after: { isMasterAdmin: value },
      });
      return null;
    });
    if (result) return fail(result);
    revalidatePath(`/admin/users/${userId}`);
    return ok(undefined, value ? "Master Admin granted" : "Master Admin removed");
  },
);

// Lets a guard inside a transaction abort it with a user-facing message.
class GuardError extends Error {}
function rethrowGuard(e: unknown): { error: string } {
  if (e instanceof GuardError) return { error: e.message };
  throw e;
}
