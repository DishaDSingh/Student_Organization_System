import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { formatINR } from "@/lib/membership/rules";
import { cn } from "@/lib/utils";
import { BenefitDialog, PlanDialog } from "./plan-forms";

export const metadata: Metadata = { title: "Plans & benefits" };

export default async function PlansPage() {
  const user = await requirePermission("members.view");
  const manage = can(user, "members.manage_plans");
  const now = new Date();

  const [plans, benefits] = await Promise.all([
    db.membershipPlan.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        benefits: { select: { benefitId: true } },
        _count: { select: { memberships: { where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } } } } },
      },
    }),
    db.membershipBenefit.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Plans & benefits"
        description="What membership costs and what it gives. Members see their benefits on their digital pass."
        back={{ href: "/members", label: "Members" }}
        actions={manage && <PlanDialog benefits={benefits} />}
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const ids = new Set(p.benefits.map((b) => b.benefitId));
          return (
            <section key={p.id} className={cn("bg-card flex flex-col rounded-xl border p-5", !p.isActive && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {p.name}
                    {!p.isActive && <span className="text-muted-foreground ml-2 text-xs font-normal">Unavailable</span>}
                  </p>
                  <p className="text-muted-foreground font-mono text-xs">{p.code}</p>
                </div>
                {manage && <PlanDialog benefits={benefits} plan={{ ...p, benefitIds: [...ids] }} />}
              </div>
              <p className="mt-3">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatINR(p.pricePaise)}</span>
                <span className="text-muted-foreground text-sm"> / {p.durationMonths} months</span>
              </p>
              {p.description && <p className="text-muted-foreground mt-1 text-sm">{p.description}</p>}
              <ul className="mt-4 grid gap-1.5 text-sm">
                {benefits
                  .filter((b) => ids.has(b.id) && b.isActive)
                  .map((b) => (
                    <li key={b.id} className="flex gap-2">
                      <CheckIcon className="text-success mt-0.5 size-4 shrink-0" />
                      {b.title}
                    </li>
                  ))}
              </ul>
              <p className="text-muted-foreground mt-auto border-t pt-3 text-xs">{p._count.memberships} members currently on this plan</p>
            </section>
          );
        })}
      </div>

      <Section title="Benefits catalogue" actions={manage && <BenefitDialog />}>
        <ul className="divide-y">
          {benefits.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 text-sm">
                <p className={cn("font-medium", !b.isActive && "text-muted-foreground line-through")}>{b.title}</p>
                {b.description && <p className="text-muted-foreground text-xs">{b.description}</p>}
              </div>
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {plans.filter((p) => p.benefits.some((x) => x.benefitId === b.id)).length} plans
              </span>
              {manage && <BenefitDialog benefit={b} />}
            </li>
          ))}
          {benefits.length === 0 && <li className="text-muted-foreground text-sm">No benefits yet.</li>}
        </ul>
      </Section>
    </>
  );
}
