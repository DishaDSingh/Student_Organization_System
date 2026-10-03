import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalog";

export type PermissionSource = {
  isMasterAdmin: boolean;
  rolePermissions: string[];
  overrides: { permissionKey: string; effect: "GRANT" | "DENY" }[];
};

/**
 * Effective permissions = union(role permissions) + GRANT overrides − DENY overrides.
 * DENY wins over everything except Master Admin, so a user can be given a
 * broad role with a specific capability carved out.
 */
export function resolvePermissions(src: PermissionSource): Set<PermissionKey> {
  if (src.isMasterAdmin) return new Set(ALL_PERMISSION_KEYS);

  const set = new Set<string>(src.rolePermissions);
  for (const o of src.overrides) if (o.effect === "GRANT") set.add(o.permissionKey);
  for (const o of src.overrides) if (o.effect === "DENY") set.delete(o.permissionKey);
  return set as Set<PermissionKey>;
}

/**
 * Privilege-escalation guard: a non-master user may only hand out
 * permissions they hold themselves. Returns the keys they are NOT allowed
 * to grant (empty array = allowed).
 */
export function ungrantable(actor: { isMasterAdmin: boolean; permissions: Set<PermissionKey> }, keys: Iterable<string>) {
  if (actor.isMasterAdmin) return [];
  return [...keys].filter((k) => !actor.permissions.has(k as PermissionKey));
}
