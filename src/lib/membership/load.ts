import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { stateWhere } from "./query";
import { standing } from "./rules";

export const termSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  pricePaise: true,
  claimedReference: true,
  isRenewal: true,
  cancelledReason: true,
  createdAt: true,
  plan: { select: { id: true, name: true, durationMonths: true } },
} as const;

/** Recording money needs either membership-edit or finance-income rights. */
export const canCollectDues = (u: CurrentUser) => u.permissions.has("members.edit") || u.permissions.has("finance.record_income");

/** Everything the member profile, "My membership" and the pass need about one person. */
export async function loadMember(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      studentId: true,
      program: true,
      yearOfStudy: true,
      memberNumber: true,
      passToken: true,
      status: true,
      createdAt: true,
      department: { select: { name: true } },
      memberships: { orderBy: { createdAt: "desc" }, select: termSelect },
      paymentsMade: {
        where: { purpose: "MEMBERSHIP" },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          receiptNumber: true,
          amountPaise: true,
          method: true,
          reference: true,
          status: true,
          paidAt: true,
          receivedBy: { select: { name: true } },
        },
      },
      committees: { select: { position: true, committee: { select: { id: true, name: true, isActive: true } } } },
    },
  });
  if (!user) return null;

  const s = standing(user.memberships);
  // Benefits come from the plan the member is currently covered by.
  const planId = (s.current ?? s.upcoming)?.plan.id;
  const benefits = planId
    ? await db.membershipBenefit.findMany({
        where: { isActive: true, plans: { some: { planId } } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true, description: true },
      })
    : [];
  return { ...user, standing: s, benefits };
}
export type LoadedMember = NonNullable<Awaited<ReturnType<typeof loadMember>>>;

/** Counts for the members page tabs and dashboard KPIs, all computed in SQL. */
export async function membershipCounts(now = new Date()) {
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [active, expiring, expiringThisWeek, expired, pending, none] = await Promise.all([
    db.user.count({ where: stateWhere("active", now) }),
    db.user.count({ where: stateWhere("expiring", now) }),
    db.user.count({
      where: {
        AND: [
          { memberships: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now, lte: week } } } },
          { memberships: { none: { status: "ACTIVE", startDate: { gt: now } } } },
        ],
      },
    }),
    db.user.count({ where: stateWhere("expired", now) }),
    db.user.count({ where: stateWhere("pending", now) }),
    db.user.count({ where: stateWhere("none", now) }),
  ]);
  return { active, expiring, expiringThisWeek, expired, pending, none };
}
