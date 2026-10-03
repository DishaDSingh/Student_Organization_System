import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { toDateInput } from "@/lib/format";
import { FundraiserForm } from "../fundraiser-forms";

export const metadata: Metadata = { title: "New fundraiser" };

export default async function NewFundraiserPage() {
  await requirePermission("fundraisers.manage");
  const today = new Date();
  return (
    <>
      <PageHeader title="New fundraiser" back={{ href: "/fundraisers", label: "Fundraisers" }} />
      <FundraiserForm
        defaults={{
          title: "",
          cause: "Charity",
          goalRupees: 10000,
          startsAt: toDateInput(today),
          endsAt: toDateInput(new Date(today.getTime() + 30 * 86_400_000)),
          description: "",
          status: "ACTIVE",
        }}
      />
    </>
  );
}
