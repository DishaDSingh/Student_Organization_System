import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { toDateInput } from "@/lib/format";
import { FundraiserForm } from "../../fundraiser-forms";

export const metadata: Metadata = { title: "Edit fundraiser" };

export default async function EditFundraiserPage(props: PageProps<"/fundraisers/[id]/edit">) {
  await requirePermission("fundraisers.manage");
  const { id } = await props.params;
  const f = await db.fundraiser.findUnique({ where: { id } });
  if (!f) notFound();
  return (
    <>
      <PageHeader title={`Edit ${f.title}`} back={{ href: `/fundraisers/${id}`, label: f.title }} />
      <FundraiserForm
        defaults={{
          fundraiserId: f.id,
          title: f.title,
          cause: f.cause as "Charity",
          goalRupees: f.goalPaise / 100,
          startsAt: toDateInput(f.startsAt),
          endsAt: toDateInput(f.endsAt),
          description: f.description ?? "",
          status: f.status,
        }}
      />
    </>
  );
}
