/**
 * Event & ticket rules as plain functions (shared by pages, actions, seed, tests).
 */

export const EVENT_CATEGORIES = ["Gala", "Cultural", "Workshop", "Tech", "Sports", "Social", "Talk", "Fundraiser"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Unpaid online orders keep their seats this long, then release them. */
export const HOLD_HOURS = 48;
/** Doors open (check-in allowed) this long before the start. */
export const CHECKIN_OPENS_MINUTES = 120;

type EventLike = {
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
  salesOpenAt?: Date | null;
  salesCloseAt?: Date | null;
  capacity: number;
  allocated: number;
};

export type EventPhase = "DRAFT" | "CANCELLED" | "UPCOMING" | "LIVE" | "ENDED";

export function eventPhase(e: Pick<EventLike, "status" | "startsAt" | "endsAt">, now = new Date()): EventPhase {
  if (e.status === "DRAFT") return "DRAFT";
  if (e.status === "CANCELLED") return "CANCELLED";
  if (now < e.startsAt) return "UPCOMING";
  if (now <= e.endsAt) return "LIVE";
  return "ENDED";
}

export const PHASE_LABEL: Record<EventPhase, string> = {
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
  UPCOMING: "Upcoming",
  LIVE: "Live now",
  ENDED: "Ended",
};

export type SalesState = "OPEN" | "NOT_YET" | "CLOSED" | "SOLD_OUT" | "UNAVAILABLE";

/** Whether tickets can be bought right now, and why not. */
export function salesState(e: EventLike, now = new Date()): SalesState {
  if (e.status !== "PUBLISHED") return "UNAVAILABLE";
  if (e.salesOpenAt && now < e.salesOpenAt) return "NOT_YET";
  const close = e.salesCloseAt ?? e.endsAt;
  if (now > close) return "CLOSED";
  if (e.allocated >= e.capacity) return "SOLD_OUT";
  return "OPEN";
}

export const SALES_LABEL: Record<SalesState, string> = {
  OPEN: "On sale",
  NOT_YET: "Sales open soon",
  CLOSED: "Sales closed",
  SOLD_OUT: "Sold out",
  UNAVAILABLE: "Not on sale",
};

export function canCheckIn(e: Pick<EventLike, "status" | "startsAt" | "endsAt">, now = new Date()) {
  return e.status === "PUBLISHED" && now.getTime() >= e.startsAt.getTime() - CHECKIN_OPENS_MINUTES * 60_000 && now <= e.endsAt;
}

export type PricedType = { id: string; name: string; memberPricePaise: number; publicPricePaise: number; membersOnly: boolean };

/**
 * Price an order. An active member gets member pricing on ONE ticket per
 * event (their own); extra tickets are charged at the public price.
 */
export function priceOrder(
  lines: { type: PricedType; quantity: number }[],
  opts: { isActiveMember: boolean; memberTicketAlreadyUsed: boolean },
): { ok: true; tickets: { typeId: string; pricePaise: number; isMemberPrice: boolean }[]; totalPaise: number } | { ok: false; error: string } {
  let memberSlot = opts.isActiveMember && !opts.memberTicketAlreadyUsed;
  const tickets: { typeId: string; pricePaise: number; isMemberPrice: boolean }[] = [];

  // Apply the member discount where it saves the most.
  const sorted = [...lines].sort((a, b) => b.type.publicPricePaise - b.type.memberPricePaise - (a.type.publicPricePaise - a.type.memberPricePaise));
  for (const { type, quantity } of sorted) {
    if (type.membersOnly) {
      if (!opts.isActiveMember) return { ok: false, error: `${type.name} tickets are for active members only.` };
      if (quantity > 1 || !memberSlot) return { ok: false, error: `${type.name} is limited to one ticket per member.` };
    }
    for (let i = 0; i < quantity; i++) {
      if (memberSlot) {
        tickets.push({ typeId: type.id, pricePaise: type.memberPricePaise, isMemberPrice: true });
        memberSlot = false;
      } else {
        tickets.push({ typeId: type.id, pricePaise: type.publicPricePaise, isMemberPrice: false });
      }
    }
  }
  if (!tickets.length) return { ok: false, error: "Choose at least one ticket." };
  return { ok: true, tickets, totalPaise: tickets.reduce((s, t) => s + t.pricePaise, 0) };
}

/** Attendance rate among tickets that were valid for entry. */
export function attendanceRate(checkedIn: number, issued: number) {
  return issued ? Math.round((checkedIn / issued) * 100) : 0;
}
