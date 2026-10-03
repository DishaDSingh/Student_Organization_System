import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";

/**
 * Small server-rendered SVG charts. No chart library, no client JavaScript:
 * they render instantly, work offline and follow the theme via CSS colours.
 * Hover any bar for its exact value (native <title> tooltip).
 */

export type ChartFormat = "number" | "inr";

const SERIES_FILL = ["fill-primary", "fill-warning"] as const;
const SERIES_DOT = ["bg-primary", "bg-warning"] as const;

function fmt(v: number, format: ChartFormat, compact = false) {
  if (format === "inr") {
    if (!compact) return formatINR(v);
    const r = v / 100;
    return r >= 100_000
      ? `₹${(r / 100_000).toFixed(r >= 1_000_000 ? 0 : 1)}L`
      : r >= 1000
        ? `₹${Math.round(r / 1000)}k`
        : `₹${Math.round(r)}`;
  }
  return compact && v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : v.toLocaleString("en-IN");
}

/** A "nice" axis maximum: 1, 2, 2.5 or 5 × 10ⁿ above the data. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

export function ColumnChart({
  labels,
  series,
  format = "number",
  className,
}: {
  labels: string[];
  series: { label: string; values: number[] }[];
  format?: ChartFormat;
  className?: string;
}) {
  const W = 600;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 48 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const group = plotW / Math.max(1, labels.length);
  const barW = Math.min(36, (group * 0.7) / series.length);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const empty = series.every((s) => s.values.every((v) => v === 0));

  return (
    <figure className={cn("grid gap-3", className)}>
      {series.length > 1 && (
        <figcaption className="text-muted-foreground flex flex-wrap gap-4 text-xs">
          {series.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", SERIES_DOT[i % 2])} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.map((s) => s.label).join(" and ") + " by month"}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={t ? "3 3" : undefined} />
            <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px]">
              {fmt(t, format, true)}
            </text>
          </g>
        ))}
        {labels.map((label, i) => {
          const x0 = pad.left + i * group + (group - barW * series.length) / 2;
          return (
            <g key={label + i}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = Math.max(v > 0 ? 2 : 0, plotH - (y(v) - pad.top));
                return (
                  <rect
                    key={s.label}
                    x={x0 + si * barW}
                    y={pad.top + plotH - h}
                    width={barW - 2}
                    height={h}
                    rx={3}
                    className={SERIES_FILL[si % 2]}
                  >
                    <title>{`${label} · ${s.label}: ${fmt(v, format)}`}</title>
                  </rect>
                );
              })}
              <text x={pad.left + i * group + group / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {label}
              </text>
            </g>
          );
        })}
        {empty && (
          <text x={pad.left + plotW / 2} y={pad.top + plotH / 2} textAnchor="middle" className="fill-muted-foreground text-xs">
            Nothing in this period
          </text>
        )}
      </svg>
    </figure>
  );
}

/** Horizontal bars for "top N" lists. */
export function BarList({
  rows,
  format = "number",
  empty = "Nothing in this period.",
  tone = "bg-primary/70",
}: {
  rows: { key: string; value: number; pct: number; note?: string }[];
  format?: ChartFormat;
  empty?: string;
  tone?: string;
}) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
  const top = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{r.key}</span>
            <span className="shrink-0 tabular-nums">
              {r.note ?? fmt(r.value, format)} <span className="text-muted-foreground">· {r.pct}%</span>
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div className={cn("h-full rounded-full", tone)} style={{ width: `${top ? (r.value / top) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
