import type { Prisma } from "@/generated/prisma/client";
import { param } from "@/lib/format";

/** Audit-log filters from query params — shared by the page and the CSV export. */
export function auditWhere(sp: Record<string, string | string[] | undefined>): Prisma.AuditLogWhereInput {
  const q = param(sp.q)?.trim().slice(0, 80);
  const type = param(sp.type);
  const actor = param(sp.actor);
  const entity = param(sp.entity);
  const valid = (d?: string) => (d && !Number.isNaN(Date.parse(d)) ? new Date(d) : undefined);
  const from = valid(param(sp.from));
  const to = valid(param(sp.to));
  if (to) to.setHours(23, 59, 59, 999);
  return {
    ...(q && { OR: [{ summary: { contains: q, mode: "insensitive" } }, { actorName: { contains: q, mode: "insensitive" } }] }),
    ...(type && { entityType: type }),
    ...(actor && { actorId: actor }),
    ...(entity && { entityId: entity }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
}
