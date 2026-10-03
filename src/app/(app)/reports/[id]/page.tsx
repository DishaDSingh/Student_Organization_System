import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { REPORT_TYPES, type ReportType, type Section } from "@/lib/reports/types";
import { ReportEditor } from "./editor";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage(props: PageProps<"/reports/[id]">) {
  const user = await requirePermission("reports.view");
  const { id } = await props.params;
  const r = await db.report.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } });
  if (!r) notFound();
  const label = REPORT_TYPES[r.type as ReportType]?.label ?? r.type;
  const meta = [
    label,
    r.periodFrom && r.periodTo ? `${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}` : null,
    `by ${r.createdBy?.name ?? "—"}`,
    `updated ${fmtDateTime(r.updatedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader title={r.title} description={meta} back={{ href: "/reports", label: "Reports" }} />
      <ReportEditor
        report={{ id: r.id, title: r.title, status: r.status as "DRAFT" | "FINAL", source: r.source, sections: r.sections as Section[] }}
        canEdit={can(user, "reports.generate")}
        canExport={can(user, "reports.export")}
      />
    </>
  );
}
