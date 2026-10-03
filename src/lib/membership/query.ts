import type { Prisma } from "@/generated/prisma/client";
import { EXPIRING_WITHIN_DAYS } from "./rules";

/**
 * Database filters matching `standing()` so lists can be filtered and counted
 * in SQL instead of loading every member into memory.
 */
export type StateFilter = "active" | "expiring" | "expired" | "pending" | "none";
export const STATE_FILTERS: StateFilter[] = ["active", "expiring", "expired", "pending", "none"];

export function stateWhere(filter: StateFilter, now = new Date()): Prisma.UserWhereInput {
  const soon = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * 24 * 60 * 60 * 1000);
  const covering: Prisma.MembershipWhereInput = { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } };
  const upcoming: Prisma.MembershipWhereInput = { status: "ACTIVE", startDate: { gt: now } };

  switch (filter) {
    case "active":
      return { memberships: { some: covering } };
    case "expiring":
      // Ends within the window and hasn't already renewed.
      return {
        AND: [{ memberships: { some: { ...covering, endDate: { gte: now, lte: soon } } } }, { memberships: { none: upcoming } }],
      };
    case "expired":
      return {
        AND: [
          { memberships: { some: { status: "ACTIVE", endDate: { lt: now } } } },
          { memberships: { none: covering } },
          { memberships: { none: upcoming } },
          { memberships: { none: { status: "PENDING_PAYMENT" } } },
        ],
      };
    case "pending":
      return { memberships: { some: { status: "PENDING_PAYMENT" } } };
    case "none":
      return { memberships: { none: { status: { in: ["ACTIVE", "PENDING_PAYMENT"] } } } };
  }
}
