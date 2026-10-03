import type { PrismaClient } from "@/generated/prisma/client";
import { format } from "date-fns";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Renewal reminders, sent as in-app notifications at 30, 7 and 1 day(s) before
 * expiry and once just after it lapses. Idempotent: each reminder has a
 * dedupe key, so running this every few hours never double-sends.
 */
const BUCKETS = [
  { key: "d30", maxDays: 30, minDays: 7 },
  { key: "d7", maxDays: 7, minDays: 1 },
  { key: "d1", maxDays: 1, minDays: 0 },
  { key: "lapsed", maxDays: 0, minDays: -7 },
] as const;

export async function runRenewalReminders(db: Pick<PrismaClient, "membership" | "notification">, now = new Date()) {
  const terms = await db.membership.findMany({
    where: {
      status: "ACTIVE",
      endDate: { gte: new Date(now.getTime() - 7 * DAY), lte: new Date(now.getTime() + 30 * DAY) },
      // Skip anyone who has already renewed or has a renewal waiting for payment.
      user: {
        status: { not: "SUSPENDED" },
        memberships: { none: { OR: [{ status: "PENDING_PAYMENT" }, { status: "ACTIVE", startDate: { gt: now } }] } },
      },
    },
    select: { id: true, userId: true, endDate: true, plan: { select: { name: true } } },
  });

  const rows = terms.flatMap((t) => {
    const days = (t.endDate!.getTime() - now.getTime()) / DAY;
    const bucket = BUCKETS.find((b) => days <= b.maxDays && days > b.minDays);
    if (!bucket) return [];
    const until = format(t.endDate!, "d MMM yyyy");
    const lapsed = bucket.key === "lapsed";
    const left = Math.max(1, Math.ceil(days));
    return [
      {
        userId: t.userId,
        type: lapsed ? "membership.expired" : "membership.expiring",
        title: lapsed ? "Your membership has expired" : `Membership expires in ${left} day${left === 1 ? "" : "s"}`,
        body: lapsed
          ? `Your ${t.plan.name} membership ended on ${until}. Renew to keep your member benefits and pricing.`
          : `Your ${t.plan.name} membership is valid until ${until}. Renew now to keep your benefits without a gap.`,
        link: "/me",
        dedupeKey: `renewal:${t.id}:${bucket.key}`,
      },
    ];
  });

  if (!rows.length) return 0;
  const res = await db.notification.createMany({ data: rows, skipDuplicates: true });
  return res.count;
}
