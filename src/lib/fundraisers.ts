import "server-only";
import { db } from "@/lib/db";

/** Money raised per fundraiser = paid donations recorded against it. */
export async function raisedByFundraiser(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db.payment.groupBy({
    by: ["fundraiserId"],
    where: { fundraiserId: { in: ids }, status: "PAID" },
    _sum: { amountPaise: true },
  });
  return new Map(rows.map((r) => [r.fundraiserId!, r._sum.amountPaise ?? 0]));
}
