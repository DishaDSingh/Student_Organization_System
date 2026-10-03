import type { PermissionKey } from "@/lib/rbac/catalog";

/**
 * Report types (Phase 13), organization summaries (Phase 12) and the
 * committee handover (Phase 20) all share one shape: titled sections of text,
 * built from live data, edited by a person, then saved and exported.
 */

export type Section = { heading: string; body: string };

export const REPORT_TYPES = {
  EVENT: { label: "Event report", subject: "event", needs: "events.view" },
  FINANCE: { label: "Finance report", subject: "period", needs: "finance.view" },
  MEMBERSHIP: { label: "Membership report", subject: "period", needs: "members.view" },
  FUNDRAISER: { label: "Fundraiser report", subject: "fundraiser", needs: "fundraisers.view" },
  MERCH: { label: "Merchandise report", subject: "period", needs: "merchandise.view" },
  VOLUNTEER: { label: "Volunteer report", subject: "period", needs: "volunteers.view" },
  SUMMARY: { label: "Organization summary", subject: "period", needs: "analytics.view" },
  HANDOVER: { label: "Committee handover", subject: "none", needs: "analytics.view" },
} as const satisfies Record<string, { label: string; subject: "event" | "fundraiser" | "period" | "none"; needs: PermissionKey }>;

export type ReportType = keyof typeof REPORT_TYPES;
export const REPORT_TYPE_KEYS = Object.keys(REPORT_TYPES) as ReportType[];

export const PERIODS = {
  week: "Last 7 days",
  month: "This month",
  last_month: "Last month",
  semester: "This semester",
  year: "Last 12 months",
} as const;
export type PeriodKey = keyof typeof PERIODS;
export const PERIOD_KEYS = Object.keys(PERIODS) as PeriodKey[];

/**
 * Turn a period choice into dates. Semesters run Jul–Dec and Jan–Jun.
 * `prevFrom`/`prevTo` is the same-length period just before, for comparisons.
 */
export function periodRange(p: PeriodKey, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  let from: Date;
  let to = now;
  switch (p) {
    case "week":
      from = new Date(now.getTime() - 7 * 86_400_000);
      break;
    case "month":
      from = new Date(y, m, 1);
      break;
    case "last_month":
      from = new Date(y, m - 1, 1);
      to = new Date(y, m, 1);
      break;
    case "semester":
      from = m >= 6 ? new Date(y, 6, 1) : new Date(y, 0, 1);
      break;
    case "year":
      from = new Date(y - 1, m, now.getDate());
      break;
  }
  const length = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - length), prevTo: from };
}

export const pctChange = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

/** "up 12% on the previous period" / "down 5% …" / "" */
export function vsPrevious(cur: number, prev: number) {
  const c = pctChange(cur, prev);
  if (c === null) return "";
  if (Math.abs(c) <= 3) return " (about the same as the previous period)";
  return ` (${c > 0 ? "up" : "down"} ${Math.abs(c)}% on the previous period)`;
}

/** Bullet list from lines, skipping empty ones. */
export const bullets = (lines: (string | false | 0 | null | undefined)[]) =>
  lines
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");

/** A report is valid to save if it has at least one section with a heading. */
export function cleanSections(sections: Section[]): Section[] {
  return sections.map((s) => ({ heading: s.heading.trim(), body: s.body.replace(/\r\n/g, "\n").trim() })).filter((s) => s.heading);
}

/** Markdown export. */
export function toMarkdown(title: string, meta: string, sections: Section[]) {
  return [`# ${title}`, `_${meta}_`, ...sections.map((s) => `## ${s.heading}\n\n${s.body}`)].join("\n\n") + "\n";
}

/** Every number in the text (₹1,23,456 → 123456, 45% → 45, 3.5 → 3.5). */
export const numbersIn = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

/** True if the rewrite kept every number from the original section. */
export function keepsNumbers(original: Section, rewritten: Section) {
  const have = new Set(numbersIn(rewritten.body));
  return numbersIn(original.body).every((n) => have.has(n));
}
