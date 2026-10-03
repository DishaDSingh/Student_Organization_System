import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { fmtDate } from "@/lib/format";
import { REPORT_TYPES, toMarkdown, type ReportType, type Section } from "@/lib/reports/types";

/** GET /api/reports/:id/export — the report as a Markdown file. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/reports/[id]/export">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.permissions.has("reports.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const r = await db.report.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = `${REPORT_TYPES[r.type as ReportType]?.label ?? r.type} · ${r.status === "FINAL" ? "Final" : "Draft"} · ${fmtDate(r.updatedAt)}`;
  const body = toMarkdown(r.title, meta, r.sections as Section[]);
  await db.$transaction((tx) =>
    audit(tx, { actor: user, action: "report.export", entityType: "Report", entityId: r.id, summary: `Downloaded "${r.title}"` }),
  );
  const filename =
    r.title
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "report";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
