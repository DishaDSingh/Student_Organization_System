import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CircleCheckIcon, LightbulbIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { param } from "@/lib/format";
import { loadInsights, pulse } from "@/lib/insights/engine";
import { AREA_LABEL, type Area, type Insight, type Severity } from "@/lib/insights/rules";
import type { PulseStatus } from "@/lib/insights/rules";

export const metadata: Metadata = { title: "Insights" };

const STATUS: Record<PulseStatus, { dot: string; label: string }> = {
  green: { dot: "bg-success", label: "Healthy" },
  orange: { dot: "bg-warning", label: "Needs a look" },
  red: { dot: "bg-destructive", label: "Act now" },
};

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  critical: { label: "Urgent", className: "bg-destructive/10 text-destructive" },
  warning: { label: "Watch", className: "bg-warning/15 text-amber-700 dark:text-amber-300" },
  opportunity: { label: "Opportunity", className: "bg-primary/10 text-primary" },
  info: { label: "FYI", className: "bg-muted text-muted-foreground" },
};

export default async function InsightsPage(props: PageProps<"/insights">) {
  const user = await requirePermission("analytics.view");
  const sp = await props.searchParams;
  const { areas, insights } = await loadInsights(user);
  const rows = pulse(areas, insights);
  const selected = areas.find((a) => a === param(sp.area)) as Area | undefined;
  const shown = selected ? insights.filter((i) => i.area === selected) : insights;
  const selectedRow = rows.find((r) => r.area === selected);

  return (
    <>
      <PageHeader title="Insights" description="What needs attention, why, and what you could do. Nothing changes until you act." />

      {/* Organization pulse — every colour is explained, never a mystery score. */}
      <section aria-label="Organization pulse" className="mb-6">
        <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Organization pulse</h2>
        <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-6">
          {rows.map((r) => (
            <Link
              key={r.area}
              href={selected === r.area ? "/insights" : `/insights?area=${r.area}`}
              scroll={false}
              aria-current={selected === r.area ? "true" : undefined}
              className={cn("bg-card hover:bg-muted/60 p-4 transition-colors", selected === r.area && "bg-muted")}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className={cn("size-2.5 rounded-full", STATUS[r.status].dot)} aria-hidden />
                {r.label}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{STATUS[r.status].label}</p>
            </Link>
          ))}
        </div>
        {selectedRow && (
          <div className="bg-card mt-3 grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2 sm:p-5">
            <div>
              <p className="font-medium">
                Why is {selectedRow.label} {selectedRow.status === "green" ? "green" : selectedRow.status === "orange" ? "orange" : "red"}?
              </p>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
                {selectedRow.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">What we check</p>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
                {selectedRow.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">
                Red = something urgent · Orange = something to watch · Green = no problems found.
              </p>
            </div>
          </div>
        )}
      </section>

      {shown.length === 0 ? (
        <EmptyState icon={CircleCheckIcon} title={selected ? `Nothing to flag in ${AREA_LABEL[selected]}` : "Nothing to flag right now"}>
          The checks found no problems or opportunities.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {shown.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </ul>
      )}
    </>
  );
}

function InsightCard({ insight: i }: { insight: Insight }) {
  return (
    <li className="bg-card rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", SEVERITY[i.severity].className)}>
              {SEVERITY[i.severity].label}
            </span>
            <span className="text-muted-foreground text-xs">{AREA_LABEL[i.area]}</span>
          </p>
          <p className="mt-1.5 font-medium">{i.title}</p>
          <p className="text-muted-foreground mt-1 flex gap-1.5 text-sm">
            <LightbulbIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="text-foreground font-medium">Why: </span>
              {i.why}
            </span>
          </p>
        </div>
        {i.action && (
          <Button asChild variant="outline" size="sm">
            <Link href={i.action.href}>
              {i.action.label} <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
      <details className="group mt-3">
        <summary className="text-primary cursor-pointer text-sm select-none hover:underline">Show evidence</summary>
        <div className="-mx-4 mt-2 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr className="border-b">
                {i.evidence.columns.map((c) => (
                  <th key={c} className="px-4 py-1.5 font-medium sm:px-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {i.evidence.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, ci) => (
                    <td key={ci} className="px-4 py-1.5 sm:px-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {i.evidence.more && <p className="text-muted-foreground px-4 pt-2 text-xs sm:px-2">…and {i.evidence.more} more.</p>}
        </div>
      </details>
    </li>
  );
}
