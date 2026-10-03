import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { canCollectDues } from "@/lib/membership/load";
import { IdCardIcon } from "lucide-react";
import { RegisterMemberForm } from "../member-forms";

export const metadata: Metadata = { title: "Register member" };

export default async function RegisterMemberPage() {
  const user = await requirePermission("members.add");
  const plans = await db.membershipPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, pricePaise: true, durationMonths: true, description: true },
  });

  return (
    <>
      <PageHeader
        title="Register member"
        description="For walk-ins at the desk. Students can also sign themselves up at /join."
        back={{ href: "/members", label: "Members" }}
      />
      {plans.length === 0 ? (
        <EmptyState icon={IdCardIcon} title="No active membership plans">
          <Link href="/members/plans" className="text-primary hover:underline">
            Create a plan
          </Link>{" "}
          before registering members.
        </EmptyState>
      ) : (
        <RegisterMemberForm plans={plans} canCollect={canCollectDues(user)} />
      )}
    </>
  );
}
