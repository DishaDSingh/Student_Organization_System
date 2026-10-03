import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { aiConfigured } from "@/lib/ai/claude";
import { fmtDate, param } from "@/lib/format";
import { REPORT_TYPES, REPORT_TYPE_KEYS } from "@/lib/reports/types";
import { GenerateForm } from "./generate-form";

export const metadata: Metadata = { title: "Generate report" };

export default async function NewReportPage(props: PageProps<"/reports/new">) {
  const user = await requirePermission("reports.generate");
  const sp = await props.searchParams;
  const [events, fundraisers] = await Promise.all([
    db.event.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { startsAt: "desc" },
      take: 60,
      select: { id: true, title: true, startsAt: true },
    }),
    db.fundraiser.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { endsAt: "desc" }, select: { id: true, title: true } }),
  ]);
  // Only offer reports on areas you can already see.
  const types = REPORT_TYPE_KEYS.filter((t) => user.permissions.has(REPORT_TYPES[t].needs)).map((t) => ({
    key: t,
    label: REPORT_TYPES[t].label,
    subject: REPORT_TYPES[t].subject,
  }));
  const initial = types.find((t) => t.key === param(sp.type))?.key ?? types[0]?.key;

  return (
    <>
      <PageHeader
        title="Generate report"
        description="Pick what the report is about. You can edit every word before saving or sharing it."
        back={{ href: "/reports", label: "Reports" }}
      />
      {types.length === 0 ? (
        <p className="text-muted-foreground text-sm">You don&apos;t have access to any area&apos;s data yet.</p>
      ) : (
        <GenerateForm
          types={types}
          initialType={initial!}
          initialSubject={param(sp.subject)}
          events={events.map((e) => ({ id: e.id, label: `${e.title} · ${fmtDate(e.startsAt)}` }))}
          fundraisers={fundraisers.map((f) => ({ id: f.id, label: f.title }))}
          ai={aiConfigured()}
        />
      )}
    </>
  );
}
