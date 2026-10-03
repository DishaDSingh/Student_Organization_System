import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth/current-user";
import { ungrantable } from "./resolve";

type Tx = Prisma.TransactionClient;

/**
 * Rules that stop the permission system from being used against itself.
 * Each returns an error message, or null when the action is allowed.
 */

/** Only a Master Admin may act on another Master Admin's account. */
export function guardTarget(actor: CurrentUser, target: { id: string; isMasterAdmin: boolean }) {
  if (target.isMasterAdmin && !actor.isMasterAdmin) return "Only a Master Admin can change a Master Admin's account.";
  return null;
}

/** Nobody but a Master Admin changes their own access — no self-promotion. */
export function guardSelf(actor: CurrentUser, targetId: string, what = "your own access") {
  if (actor.id === targetId && !actor.isMasterAdmin) return `You can't change ${what}. Ask another admin.`;
  return null;
}

/**
 * You can only hand out (or take away) permissions you hold yourself.
 * Stops e.g. a Secretary with `roles.assign` from making someone Treasurer.
 */
export function guardGrant(actor: CurrentUser, keys: Iterable<string>) {
  const missing = ungrantable(actor, keys);
  if (missing.length === 0) return null;
  const list = missing.slice(0, 3).join(", ") + (missing.length > 3 ? ` and ${missing.length - 3} more` : "");
  return `You can't grant permissions you don't have yourself (${list}).`;
}

/** Permission keys carried by a set of roles. */
export async function permissionsOfRoles(tx: Tx, roleIds: string[]) {
  if (roleIds.length === 0) return [];
  const rows = await tx.rolePermission.findMany({ where: { roleId: { in: roleIds } }, select: { permissionKey: true } });
  return [...new Set(rows.map((r) => r.permissionKey))];
}

/** There must always be at least one active Master Admin. */
export async function wouldRemoveLastMaster(tx: Tx, userId: string) {
  const others = await tx.user.count({ where: { isMasterAdmin: true, status: "ACTIVE", id: { not: userId } } });
  return others === 0;
}
