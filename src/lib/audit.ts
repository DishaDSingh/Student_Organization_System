import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditEntry = {
  actor: { id: string; name: string } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Keep only the fields that actually changed, so the log shows a clean diff. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

/**
 * Write an audit row. Pass the transaction client so the log entry commits
 * (or rolls back) together with the change it describes.
 */
export async function audit(tx: Tx, entry: AuditEntry) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  await tx.auditLog.create({
    data: {
      actorId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? "System",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
}
