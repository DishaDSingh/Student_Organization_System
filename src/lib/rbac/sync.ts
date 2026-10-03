import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { ALL_PERMISSIONS } from "./catalog";
import { ROLE_PRESETS } from "./presets";

type Client = PrismaClient | Prisma.TransactionClient;

/** Upsert the code catalog into the Permission table. Safe to run repeatedly. */
export async function syncPermissionCatalog(db: Client) {
  for (const p of ALL_PERMISSIONS) {
    const data = {
      module: p.module,
      action: p.action,
      label: p.label,
      description: p.description,
      isSensitive: !!p.sensitive,
      sortOrder: p.sortOrder,
    };
    await db.permission.upsert({ where: { key: p.key }, create: { key: p.key, ...data }, update: data });
  }
}

/**
 * Create any missing preset roles with their default permissions.
 * Existing roles are left alone — the admin may have customised them.
 */
export async function ensurePresetRoles(db: Client) {
  for (const preset of ROLE_PRESETS) {
    const exists = await db.role.findUnique({ where: { key: preset.key }, select: { id: true } });
    if (exists) continue;
    await db.role.create({
      data: {
        key: preset.key,
        name: preset.name,
        description: preset.description,
        color: preset.color,
        rank: preset.rank,
        isSystem: true,
        permissions: { create: preset.permissions.map((permissionKey) => ({ permissionKey })) },
      },
    });
  }
}
