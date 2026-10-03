import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDate, param } from "@/lib/format";
import { REPORT_TYPES, REPORT_TYPE_KEYS, type ReportType } from "@/lib/reports/types";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  const user = await requirePermission("reports.view");
  const sp = await props.searchParams;
  const type = REPORT_TYPE_KEYS.find((t) => t === param(sp.type));
  const reports = await db.report.findMany({
    where: type ? { type } : {},
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, type: true, status: true, source: true, updatedAt: true, createdBy: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description="Reports and summaries built from live data. Edit them before you share."
        actions={
          can(user, "reports.generate") && (
            <Button asChild>
              <Link href="/reports/new">
                <PlusIcon /> Generate report
              </Link>
            </Button>
          )
        }
      />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by type">
        {[undefined, ...REPORT_TYPE_KEYS].map((t) => (
          <Link
            key={t ?? "all"}
            href={t ? `/reports?type=${t}` : "/reports"}
            aria-current={type === t ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              type === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
            )}
          >
            {t ? REPORT_TYPES[t].label.replace(" report", "") : "All"}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <EmptyState icon={FileTextIcon} title="No reports yet">
          Generate one — it&apos;s built from your live data in seconds.
        </EmptyState>
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/${r.id}`} className="hover:bg-muted/50 flex items-center gap-4 px-4 py-3 transition-colors sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {r.title}
                    {r.source === "ai" && <SparklesIcon className="text-primary size-3.5 shrink-0" aria-label="AI-written draft" />}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {REPORT_TYPES[r.type as ReportType]?.label ?? r.type} · {r.createdBy?.name ?? "—"} · updated {fmtDate(r.updatedAt)}
                  </p>
                </div>
                <span className={cn("text-xs font-medium", r.status === "FINAL" ? "text-success" : "text-muted-foreground")}>
                  {r.status === "FINAL" ? "Final" : "Draft"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
