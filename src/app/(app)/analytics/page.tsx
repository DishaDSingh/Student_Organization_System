import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import { can, requirePermission, type CurrentUser } from "@/lib/auth/current-user";
import { PageHeader, PageTabs, Section, activeTab } from "@/components/common";
import { BarList, ColumnChart, type ChartFormat } from "@/components/charts";
import { Meter } from "@/components/events";
import { cn } from "@/lib/utils";
import { param } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { EXPENSE_CATEGORIES } from "@/lib/finance/rules";
import { RANGES, parseRange, type Highlight, type RangeMonths } from "@/lib/analytics/rules";
import {
  eventAnalytics,
  financeAnalytics,
  memberAnalytics,
  merchAnalytics,
  volunteerAnalytics,
  type Kpi,
  type Series,
} from "@/lib/analytics/load";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { BudgetForm } from "./budget-form";

export const metadata: Metadata = { title: "Analytics" };

const AREAS = [
  { key: "members", label: "Members", needs: "members.view" },
  { key: "events", label: "Events", needs: "events.view" },
  { key: "merch", label: "Merch", needs: "merchandise.view" },
  { key: "volunteers", label: "Volunteers", needs: "volunteers.view" },
  { key: "finance", label: "Finance", needs: "finance.view" },
] as const satisfies readonly { key: string; label: string; needs: PermissionKey }[];

export default async function AnalyticsPage(props: PageProps<"/analytics">) {
  const user = await requirePermission("analytics.view");
  const sp = await props.searchParams;
  const months = parseRange(param(sp.range));
  // You only see the areas you're allowed to see in the rest of the app.
  const areas = AREAS.filter((a) => can(user, a.needs));
  const tab = activeTab(
    areas.map((a) => a.key),
    sp.tab,
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How the organization is doing, compared with the period before."
        actions={<RangePicker tab={tab} months={months} />}
      />
      {areas.length === 0 ? (
        <p className="text-muted-foreground text-sm">You don&apos;t have access to any area&apos;s data yet.</p>
      ) : (
        <>
          <PageTabs basePath="/analytics" current={tab} tabs={areas.map((a) => ({ key: a.key, label: a.label }))} />
          {tab === "members" && <Members months={months} />}
          {tab === "events" && <Events months={months} />}
          {tab === "merch" && <Merch months={months} user={user} />}
          {tab === "volunteers" && <Volunteers months={months} />}
          {tab === "finance" && <Finance months={months} user={user} />}
        </>
      )}
    </>
  );
}

function RangePicker({ tab, months }: { tab: string; months: RangeMonths }) {
  return (
    <nav className="bg-muted inline-flex rounded-lg p-0.5" aria-label="Period">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/analytics?tab=${tab}${r === 6 ? "" : `&range=${r}`}`}
          scroll={false}
          aria-current={months === r ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            months === r ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r} months
        </Link>
      ))}
    </nav>
  );
}

// ─── Shared layout ───────────────────────────────────────────────────────────

function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
      {items.map((k) => {
        const c = k.change;
        const good = c && c.direction !== "flat" && c.direction === (k.goodWhen ?? "up");
        return (
          <div key={k.label} className="bg-card min-w-0 p-4 sm:p-5">
            <p className="text-muted-foreground text-sm">{k.label}</p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums">{k.value}</p>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
              {c && c.pct !== null && (
                <span
                  className={cn(
                    "inline-flex items-center font-medium",
                    c.direction === "flat" ? "text-muted-foreground" : good ? "text-success" : "text-destructive",
                  )}
                >
                  {c.direction === "up" ? (
                    <ArrowUpRightIcon className="size-3.5" />
                  ) : c.direction === "down" ? (
                    <ArrowDownRightIcon className="size-3.5" />
                  ) : (
                    <ArrowRightIcon className="size-3.5" />
                  )}
                  {Math.abs(c.pct)}%
                </span>
              )}
              {k.hint ?? (c && c.pct !== null ? "vs previous period" : null)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

const TONE_ICON = { good: CircleCheckIcon, bad: CircleAlertIcon, neutral: InfoIcon } as const;
const TONE_CLASS = { good: "text-success", bad: "text-destructive", neutral: "text-muted-foreground" } as const;

function Highlights({ items }: { items: Highlight[] }) {
  return (
    <Section title="What this means">
      <ul className="grid gap-3">
        {items.map((h) => {
          const Icon = TONE_ICON[h.tone];
          return (
            <li key={h.text} className="flex gap-2.5 text-sm">
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[h.tone])} />
              <span>{h.text}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function ChartWithHighlights({
  title,
  chart,
  format,
  highlights,
}: {
  title: string;
  chart: { labels: string[]; series: Series[] };
  format?: ChartFormat;
  highlights: Highlight[];
}) {
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-5">
      <Section title={title} className="lg:col-span-3">
        <ColumnChart labels={chart.labels} series={chart.series} format={format} />
      </Section>
      <div className="lg:col-span-2">
        <Highlights items={highlights} />
      </div>
    </div>
  );
}

// ─── Areas ───────────────────────────────────────────────────────────────────

async function Members({ months }: { months: RangeMonths }) {
  const a = await memberAnalytics(months);
  return (
    <>
      <Kpis items={a.kpis} />
      <ChartWithHighlights title="New members and renewals" chart={a.chart} highlights={a.highlights} />
      <Section title="Engagement" description="Active members who came to an event or finished a volunteer task in this period.">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            {a.engagement.engaged.toLocaleString("en-IN")} of {a.engagement.active.toLocaleString("en-IN")} active members
          </span>
          <span className="font-semibold tabular-nums">{a.engagement.pct}%</span>
        </div>
        <Meter value={a.engagement.pct} max={100} className="mt-2 h-2" />
      </Section>
    </>
  );
}

async function Events({ months }: { months: RangeMonths }) {
  const a = await eventAnalytics(months);
  return (
    <>
      <Kpis items={a.kpis} />
      <ChartWithHighlights title="Tickets sold" chart={a.chart} highlights={a.highlights} />
      <Section title="Finished events" description="Best attended first.">
        {a.top.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events finished in this period.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium sm:px-5">Event</th>
                  <th className="px-2 py-2 text-right font-medium">Sold</th>
                  <th className="px-2 py-2 text-right font-medium">Came</th>
                  <th className="px-2 py-2 text-right font-medium">No-shows</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {a.top.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 sm:px-5">
                      <Link href={`/events/${e.id}`} className="hover:underline">
                        {e.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{e.sold}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{e.came}</td>
                    <td className={cn("px-2 py-2.5 text-right tabular-nums", e.noShowPct >= 25 && "text-destructive")}>{e.noShowPct}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums sm:px-5">{formatINR(e.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

async function Merch({ months, user }: { months: RangeMonths; user: CurrentUser }) {
  const a = await merchAnalytics(months);
  return (
    <>
      <Kpis items={a.kpis} />
      <ChartWithHighlights title="Items sold" chart={a.chart} highlights={a.highlights} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Popular products">
          <BarList rows={a.products} />
        </Section>
        <Section title="Popular sizes">
          <BarList rows={a.sizes} />
        </Section>
        <Section
          title="Running low"
          actions={
            can(user, "merchandise.manage_inventory") && (
              <Link href="/merch/inventory?show=low" className="text-primary text-sm hover:underline">
                Restock
              </Link>
            )
          }
        >
          {a.lowStock.length === 0 ? (
            <p className="text-muted-foreground text-sm">Every size is above its reorder level.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {a.lowStock.map((v) => (
                <li key={v.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {v.product.name}{" "}
                    <span className="text-muted-foreground">
                      · {v.color} · {v.size}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      v.stock === 0 ? "text-destructive font-medium" : "text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {v.stock} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

async function Volunteers({ months }: { months: RangeMonths }) {
  const a = await volunteerAnalytics(months);
  return (
    <>
      <Kpis items={a.kpis} />
      <ChartWithHighlights title="Tasks done" chart={a.chart} highlights={a.highlights} />
      <Section title="Busiest volunteers" description="Hours of open tasks compared with what each person can give per week.">
        <BarList
          empty="Nobody has open tasks."
          rows={a.workload.map((p) => ({
            key: p.name,
            value: p.hours,
            pct: Math.round((p.hours / p.max) * 100),
            note: `${p.hours}h of ${p.max}h`,
          }))}
          tone="bg-warning/70"
        />
      </Section>
    </>
  );
}

async function Finance({ months, user }: { months: RangeMonths; user: CurrentUser }) {
  const a = await financeAnalytics(months);
  return (
    <>
      <Kpis items={a.kpis} />
      <ChartWithHighlights title="Money in and out" chart={a.chart} format="inr" highlights={a.highlights} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Where money went">
          <BarList rows={a.categories} format="inr" empty="No approved expenses in this period." tone="bg-warning/70" />
        </Section>
        <Section title="Budgets this month" description="Monthly limits per spending category.">
          {a.budgets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No budgets set yet.</p>
          ) : (
            <ul className="grid gap-3">
              {a.budgets.map((b) => (
                <li key={b.category} className="grid gap-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span>{b.category}</span>
                    <span className={cn("tabular-nums", b.pct >= 100 && "text-destructive font-medium")}>
                      {formatINR(b.spent)} <span className="text-muted-foreground">of {formatINR(b.limit)}</span>
                    </span>
                  </div>
                  <Meter
                    value={Math.min(100, b.pct)}
                    max={100}
                    className="h-1.5"
                    tone={b.pct >= 100 ? "bg-destructive" : b.pct >= 90 ? "bg-warning" : "bg-success"}
                  />
                </li>
              ))}
            </ul>
          )}
          {can(user, "finance.manage_budget") && (
            <BudgetForm
              categories={[...EXPENSE_CATEGORIES]}
              current={Object.fromEntries(a.budgets.map((b) => [b.category, b.limit / 100]))}
            />
          )}
        </Section>
      </div>
    </>
  );
}
