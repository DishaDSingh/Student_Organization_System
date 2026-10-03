import { addMonths, startOfDay } from "date-fns";

/**
 * Membership rules as plain functions — shared by pages, actions, the seed
 * and tests. Only PENDING_PAYMENT / ACTIVE / CANCELLED are stored; whether a
 * term is expired or expiring is always derived from its dates, so statuses
 * can never go stale.
 */

export const EXPIRING_WITHIN_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type StoredStatus = "PENDING_PAYMENT" | "ACTIVE" | "CANCELLED";
export type Term = { id?: string; status: StoredStatus; startDate: Date | null; endDate: Date | null };

export type MemberState = "ACTIVE" | "EXPIRING" | "EXPIRED" | "PENDING" | "CANCELLED" | "NONE";

export function termState(t: Term, now = new Date()): MemberState | "UPCOMING" {
  if (t.status === "CANCELLED") return "CANCELLED";
  if (t.status === "PENDING_PAYMENT" || !t.startDate || !t.endDate) return "PENDING";
  if (t.startDate > now) return "UPCOMING";
  if (t.endDate < now) return "EXPIRED";
  return t.endDate.getTime() - now.getTime() <= EXPIRING_WITHIN_DAYS * DAY ? "EXPIRING" : "ACTIVE";
}

/**
 * A member's standing across all their terms. A paid renewal that starts
 * after the current term ends counts as continuous membership.
 */
export function standing<T extends Term>(terms: T[], now = new Date()) {
  const active = terms
    .filter((t) => t.status === "ACTIVE" && t.startDate && t.endDate)
    .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime());
  const current = active.find((t) => t.startDate! <= now && t.endDate! >= now) ?? null;
  const upcoming = active.find((t) => t.startDate! > now) ?? null;
  const pending = terms.find((t) => t.status === "PENDING_PAYMENT") ?? null;
  const lastEnded = active.find((t) => t.endDate! < now) ?? null;

  // Covered until: the end of the furthest paid term that chains from today.
  const validUntil = upcoming?.endDate ?? current?.endDate ?? null;

  let state: MemberState;
  let term: T | null;
  if (current) {
    term = current;
    state = upcoming ? "ACTIVE" : (termState(current, now) as MemberState);
  } else if (pending) {
    term = pending;
    state = "PENDING";
  } else if (lastEnded) {
    term = lastEnded;
    state = "EXPIRED";
  } else if (terms.some((t) => t.status === "CANCELLED")) {
    term = terms.find((t) => t.status === "CANCELLED")!;
    state = "CANCELLED";
  } else {
    term = null;
    state = "NONE";
  }

  const daysLeft = validUntil ? Math.ceil((validUntil.getTime() - now.getTime()) / DAY) : null;
  return { state, term, current, upcoming, pending, validUntil, daysLeft };
}

/** A renewal starts the day after the latest paid term ends, or today if lapsed. */
export function nextTermStart(terms: Term[], now = new Date()) {
  const latestEnd = terms
    .filter((t) => t.status === "ACTIVE" && t.endDate)
    .reduce<Date | null>((max, t) => (!max || t.endDate! > max ? t.endDate! : max), null);
  const today = startOfDay(now);
  if (latestEnd && latestEnd >= today) return startOfDay(new Date(latestEnd.getTime() + 1));
  return today;
}

/** Term covers [start, start + months) — endDate is the last valid millisecond. */
export function termDates(start: Date, durationMonths: number) {
  const startDate = startOfDay(start);
  return { startDate, endDate: new Date(addMonths(startDate, durationMonths).getTime() - 1) };
}

export const STATE_LABEL: Record<MemberState | "UPCOMING", string> = {
  ACTIVE: "Active",
  EXPIRING: "Expiring soon",
  EXPIRED: "Expired",
  PENDING: "Payment pending",
  CANCELLED: "Cancelled",
  NONE: "Not a member",
  UPCOMING: "Starts later",
};

/** What a door volunteer's scanner should record for each standing. */
export function verificationResult(state: MemberState) {
  return (
    {
      ACTIVE: "VALID",
      EXPIRING: "VALID",
      EXPIRED: "EXPIRED",
      PENDING: "PENDING",
      CANCELLED: "CANCELLED",
      NONE: "NOT_MEMBER",
    } as const
  )[state];
}

// ─── Money ───────────────────────────────────────────────────────────────────

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatINR = (paise: number) => inr.format(paise / 100);
export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);
