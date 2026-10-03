import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { auditWhere } from "@/lib/audit-query";
import { getCurrentUser } from "@/lib/auth/current-user";

const MAX_ROWS = 10_000;

/** GET /api/audit/export — CSV of the filtered audit log. Exporting is itself audited. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.permissions.has("audit.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const logs = await db.auditLog.findMany({ where: auditWhere(sp), orderBy: { createdAt: "desc" }, take: MAX_ROWS });

  const cell = (v: unknown) => {
    let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Time (UTC)", "Actor", "Action", "Record type", "Record id", "Summary", "Before", "After", "IP", "User agent"];
  const rows = logs.map((l) =>
    [l.createdAt.toISOString(), l.actorName, l.action, l.entityType, l.entityId, l.summary, l.before, l.after, l.ip, l.userAgent].map(cell),
  );

  await db.$transaction((tx) =>
    audit(tx, {
      actor: user,
      action: "audit.export",
      entityType: "AuditLog",
      summary: `Exported ${logs.length} audit entries`,
      after: { filters: sp },
    }),
  );

  return new NextResponse([header.map(cell), ...rows].map((r) => r.join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campusbuzz-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
