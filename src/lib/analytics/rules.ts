/**
 * Analytics engine — the pure maths. Loaders fetch rows; these functions turn
 * them into series, period-over-period changes and plain-language highlights.
 * No randomness and no hidden weights, so every number can be traced back.
 */

export const RANGES = [3, 6, 12] as const;
export type RangeMonths = (typeof RANGES)[number];

export const parseRange = (v: string | undefined): RangeMonths =>
  (RANGES as readonly number[]).includes(Number(v)) ? (Number(v) as RangeMonths) : 6;

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/**
 * The current window is the last `months` calendar months including this one;
 * the previous window is the same length immediately before it.
 */
export function windows(months: number, now = new Date()) {
  const end = addMonths(startOfMonth(now), 1);
  const start = addMonths(end, -months);
  const prevStart = addMonths(start, -months);
  // Compare like with like: the previous window is cut at the same point we've reached now,
  // so a half-finished month isn't measured against a full one.
  const prevEnd = new Date(prevStart.getTime() + (now.getTime() - start.getTime()));
  return { start, end, prevStart, prevEnd, now };
}

export type Window = ReturnType<typeof windows>;

export const inWindow = (d: Date | null | undefined, from: Date, to: Date) => !!d && d >= from && d < to;

/** Month buckets for the current window, oldest first. */
export function monthBuckets(w: Window) {
  const out: { key: string; label: string; start: Date }[] = [];
  for (let m = w.start; m < w.end; m = addMonths(m, 1)) {
    out.push({
      key: `${m.getFullYear()}-${m.getMonth()}`,
      label: m.toLocaleString("en-IN", { month: "short" }),
      start: m,
    });
  }
  return out;
}

/** Sum `value` per month (count when value is omitted). Rows outside the window are ignored. */
export function seriesByMonth<T>(rows: T[], at: (r: T) => Date | null | undefined, w: Window, value: (r: T) => number = () => 1) {
  const buckets = monthBuckets(w);
  const sums = new Map(buckets.map((b) => [b.key, 0]));
  for (const r of rows) {
    const d = at(r);
    if (!inWindow(d, w.start, w.end)) continue;
    const key = `${d!.getFullYear()}-${d!.getMonth()}`;
    sums.set(key, (sums.get(key) ?? 0) + value(r));
  }
  return buckets.map((b) => ({ label: b.label, value: sums.get(b.key) ?? 0 }));
}

/** Total so far in the current window, and in the previous window up to the same point. */
export function periodTotals<T>(rows: T[], at: (r: T) => Date | null | undefined, w: Window, value: (r: T) => number = () => 1) {
  let current = 0;
  let previous = 0;
  for (const r of rows) {
    const d = at(r);
    if (inWindow(d, w.start, w.end)) current += value(r);
    else if (inWindow(d, w.prevStart, w.prevEnd)) previous += value(r);
  }
  return { current, previous };
}

export type Change = { pct: number | null; direction: "up" | "down" | "flat" };

/** Percentage change; null when there's nothing to compare against. Within ±3% counts as flat. */
export function change(current: number, previous: number): Change {
  if (previous === 0) return { pct: null, direction: current > 0 ? "up" : "flat" };
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return { pct, direction: Math.abs(pct) <= 3 ? "flat" : pct > 0 ? "up" : "down" };
}

export const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Least-squares trend across the whole series. Only reported when the line
 * actually fits (R² ≥ 0.5) — one big month in a noisy series isn't a trend.
 * Pass complete months only: a half-finished month always looks like a drop.
 */
export function trend(values: number[]): "rising" | "falling" | "steady" {
  const n = values.length;
  if (n < 3) return "steady";
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return "steady";
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  let total = 0;
  values.forEach((v, i) => {
    num += (i - xMean) * (v - mean);
    den += (i - xMean) ** 2;
    total += (v - mean) ** 2;
  });
  const slope = num / den;
  const r2 = total ? (slope * slope * den) / total : 0;
  const relSlope = slope / mean; // share of the average gained/lost per month
  if (r2 < 0.5) return "steady";
  return relSlope > 0.05 ? "rising" : relSlope < -0.05 ? "falling" : "steady";
}

/** Drop the current, still-running month before looking for a trend. */
export const completeMonths = (series: { value: number }[]) => series.slice(0, -1).map((s) => s.value);

/** Rank keys by total, biggest first, with each one's share. */
export function rank<K extends string>(rows: { key: K; value: number }[], limit = 10) {
  const totals = new Map<K, number>();
  for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.value);
  const total = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value, pct: ratio(value, total) }));
}

// ─── Highlights ──────────────────────────────────────────────────────────────

export type Highlight = { text: string; tone: "good" | "bad" | "neutral" };

/**
 * One sentence about how a number moved. `goodWhen` says which direction is
 * good news (more expenses is not).
 */
export function describe(label: string, c: Change, opts: { goodWhen?: "up" | "down"; months: number }): Highlight {
  const period = `the previous ${opts.months} months`;
  if (c.pct === null) return { text: `${label}: no data for ${period} to compare with.`, tone: "neutral" };
  if (c.direction === "flat") return { text: `${label} held steady compared with ${period}.`, tone: "neutral" };
  const good = (opts.goodWhen ?? "up") === c.direction;
  return {
    text: `${label} ${c.direction === "up" ? "rose" : "fell"} ${Math.abs(c.pct)}% compared with ${period}.`,
    tone: good ? "good" : "bad",
  };
}
