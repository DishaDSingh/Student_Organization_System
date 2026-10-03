import type { Metadata } from "next";
import Link from "next/link";
import { HandHeartIcon, PlusIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { Meter } from "@/components/events";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/membership/rules";
import { fundraiserProgress } from "@/lib/volunteers/rules";
import { raisedByFundraiser } from "@/lib/fundraisers";
import { daysAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Fundraisers" };

export default async function FundraisersPage() {
  const user = await requirePermission("fundraisers.view");
  const fundraisers = await db.fundraiser.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { endsAt: "desc" }],
    include: { _count: { select: { tasks: true } }, tasks: { where: { status: "DONE" }, select: { id: true } } },
  });
  const raised = await raisedByFundraiser(fundraisers.map((f) => f.id));
  const today = daysAgo(0);

  return (
    <>
      <PageHeader
        title="Fundraisers"
        actions={
          can(user, "fundraisers.manage") && (
            <Button asChild>
              <Link href="/fundraisers/new">
                <PlusIcon /> New fundraiser
              </Link>
            </Button>
          )
        }
      />
      {fundraisers.length === 0 ? (
        <EmptyState icon={HandHeartIcon} title="No fundraisers yet" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fundraisers.map((f) => {
            const r = raised.get(f.id) ?? 0;
            const pct = fundraiserProgress(r, f.goalPaise);
            const daysLeft = Math.ceil((f.endsAt.getTime() - today.getTime()) / 86_400_000);
            return (
              <li key={f.id}>
                <Link
                  href={`/fundraisers/${f.id}`}
                  className="bg-card hover:border-primary/40 block rounded-xl border p-5 transition-colors"
                >
                  <p className="font-medium">{f.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {f.status === "COMPLETED" ? "Completed" : daysLeft >= 0 ? `${daysLeft} days left` : "Ended"} · {f.tasks.length}/
                    {f._count.tasks} tasks done
                  </p>
                  <p className="mt-4 text-sm">
                    <span className="text-lg font-semibold tabular-nums">{formatINR(r)}</span>
                    <span className="text-muted-foreground"> of {formatINR(f.goalPaise)}</span>
                  </p>
                  <Meter value={pct} max={100} className="mt-2 h-2" tone={pct >= 100 ? "bg-success" : "bg-primary/70"} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
