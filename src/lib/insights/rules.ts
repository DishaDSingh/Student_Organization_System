/**
 * Insight rules — pure thresholds, so every insight can say exactly why it
 * appeared. The engine (engine.ts) fetches data and applies these.
 */

export type Severity = "critical" | "warning" | "opportunity" | "info";
export type Area = "members" | "events" | "finance" | "volunteers" | "merch" | "fundraisers";

export const AREA_LABEL: Record<Area, string> = {
  members: "Membership",
  events: "Events",
  finance: "Finance",
  volunteers: "Volunteers",
  merch: "Merchandise",
  fundraisers: "Fundraisers",
};

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };

export type Insight = {
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  /** Plain-language reason, including the threshold that triggered it. */
  why: string;
  evidence: { columns: string[]; rows: string[][]; more?: number };
  action?: { label: string; href: string };
  /** A suggested announcement — opens a draft for a person to review; never sent automatically. */
  draft?: { label: string; brief: string; audience: "MEMBERS" | "EXPIRING" | "VOLUNTEERS" | "ALL" };
};

/**
 * Ticket sales slowing: recent sales vs the same length of time before.
 * Only flagged for a real drop (≥ 30%, at least 5 sales before) while seats are still left.
 */
export function salesSlowdown(recent: number, before: number, soldPct: number) {
  if (before < 5 || soldPct >= 90) return null;
  const drop = Math.round(((before - recent) / before) * 100);
  return drop >= 30 ? drop : null;
}

/** Fundraiser pace: behind when raised % trails time-elapsed % by 20 points or more. */
export function fundraiserPace(raised: number, goal: number, startsAt: Date, endsAt: Date, now = new Date()) {
  const total = endsAt.getTime() - startsAt.getTime();
  const elapsedPct = total > 0 ? Math.min(100, Math.max(0, Math.round(((now.getTime() - startsAt.getTime()) / total) * 100))) : 100;
  const raisedPct = goal > 0 ? Math.round((raised / goal) * 100) : 100;
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
  const perDay = daysLeft > 0 ? Math.ceil(Math.max(0, goal - raised) / daysLeft) : Math.max(0, goal - raised);
  return { elapsedPct, raisedPct, daysLeft, perDay, behind: raisedPct < 100 && elapsedPct - raisedPct >= 20 };
}

export type PulseStatus = "green" | "orange" | "red";

/** Pulse is derived only from insights: red if anything critical, orange if any warning. */
export function pulseStatus(insights: Pick<Insight, "severity">[]): PulseStatus {
  if (insights.some((i) => i.severity === "critical")) return "red";
  if (insights.some((i) => i.severity === "warning")) return "orange";
  return "green";
}

export const sortInsights = <T extends Pick<Insight, "severity" | "title">>(list: T[]) =>
  [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
