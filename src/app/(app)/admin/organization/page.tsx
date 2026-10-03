import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { OrganizationForm } from "./org-form";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const user = await requirePermission("organization.view");
  const org = await db.organization.findFirst();
  if (!org) notFound();

  return (
    <>
      <PageHeader title="Organization" description={`Profile and global settings. Currency ${org.currency} · Time zone ${org.timezone}.`} />
      <OrganizationForm
        editable={can(user, "organization.manage")}
        org={{
          name: org.name,
          shortName: org.shortName,
          institution: org.institution ?? "",
          description: org.description ?? "",
          email: org.email ?? "",
          phone: org.phone?.replace(/^\+91/, "") ?? "",
          website: org.website ?? "",
          address: org.address ?? "",
          academicYearStart: org.academicYearStart,
        }}
      />
    </>
  );
}
