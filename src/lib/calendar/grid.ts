/**
 * Calendar helpers — pure, so the month grid and reminder timing are easy to test.
 */

export type CalItem = {
  id: string;
  date: Date;
  title: string;
  kind: "event" | "sales" | "meeting" | "deadline" | "expiry" | "fundraiser" | "task" | "payment";
  href?: string;
  /** Shown under the title, e.g. "18:00 · Main Auditorium". */
  detail?: string;
};

export const KIND_LABEL: Record<CalItem["kind"], string> = {
  event: "Event",
  sales: "Ticket sales",
  meeting: "Meeting",
  deadline: "Deadline",
  expiry: "Membership",
  fundraiser: "Fundraiser",
  task: "My task",
  payment: "Payment due",
};

/** "2026-10" → { year, month } (month 0-based); falls back to the current month. */
export function parseMonth(v: string | undefined, now = new Date()) {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  return { year: now.getFullYear(), month: now.getMonth() };
}

export const monthKey = (year: number, month: number) => {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Weeks (Monday first) covering the whole month, including spill-over days. */
export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7)); // back to Monday
  const weeks: Date[][] = [];
  for (let d = start; d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)));
  }
  const end = weeks.at(-1)![6];
  return { weeks, from: start, to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) };
}

export function groupByDay(items: CalItem[]) {
  const map = new Map<string, CalItem[]>();
  for (const i of [...items].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const k = dayKey(i.date);
    map.set(k, [...(map.get(k) ?? []), i]);
  }
  return map;
}

/** Smart-reminder windows: is `when` between now and `hours` from now? */
export const within = (when: Date, now: Date, hours: number) => when > now && when.getTime() - now.getTime() <= hours * 3_600_000;
