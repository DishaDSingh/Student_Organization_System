import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { NewProductForm } from "../merch-forms";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePermission("merchandise.manage_products");
  return (
    <>
      <PageHeader
        title="New product"
        description={
          <>
            Creates one variant per size and colour. Designing something new?{" "}
            <Link href="/merch/studio/new" className="text-primary hover:underline">
              Start in the Merch Studio
            </Link>
            .
          </>
        }
        back={{ href: "/merch", label: "Merch" }}
      />
      <NewProductForm />
    </>
  );
}
