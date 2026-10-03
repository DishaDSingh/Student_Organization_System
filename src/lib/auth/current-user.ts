import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import { resolvePermissions } from "@/lib/rbac/resolve";
import type { PermissionKey } from "@/lib/rbac/catalog";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  isMasterAdmin: boolean;
  roles: { id: string; name: string; color: string }[];
  permissions: Set<PermissionKey>;
};

/**
 * Loads the signed-in user once per request (React `cache`) and resolves
 * their effective permissions from the database. Returns null when the
 * session is missing, expired, revoked (version bump) or the user is not ACTIVE.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isMasterAdmin: true,
      sessionVersion: true,
      roles: {
        orderBy: { role: { rank: "asc" } },
        select: {
          role: {
            select: { id: true, name: true, color: true, permissions: { select: { permissionKey: true } } },
          },
        },
      },
      permissionOverrides: { select: { permissionKey: true, effect: true } },
    },
  });

  if (!user || user.status !== "ACTIVE" || user.sessionVersion !== session.ver) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isMasterAdmin: user.isMasterAdmin,
    roles: user.roles.map(({ role }) => ({ id: role.id, name: role.name, color: role.color })),
    permissions: resolvePermissions({
      isMasterAdmin: user.isMasterAdmin,
      rolePermissions: user.roles.flatMap(({ role }) => role.permissions.map((p) => p.permissionKey)),
      overrides: user.permissionOverrides,
    }),
  };
});

export function can(user: CurrentUser | null, permission: PermissionKey) {
  return !!user && user.permissions.has(permission);
}

/** For pages/layouts: redirect to login when signed out. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: signed in AND holds the permission, otherwise the 403 page. */
export async function requirePermission(...anyOf: PermissionKey[]) {
  const user = await requireUser();
  if (!anyOf.some((p) => user.permissions.has(p))) redirect("/forbidden");
  return user;
}

export async function requireMasterAdmin() {
  const user = await requireUser();
  if (!user.isMasterAdmin) redirect("/forbidden");
  return user;
}
