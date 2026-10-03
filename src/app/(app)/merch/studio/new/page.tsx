import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { Designer } from "../designer";

export const metadata: Metadata = { title: "New design" };

export default async function NewDesignPage() {
  await requirePermission("merchandise.studio");
  const org = await db.organization.findFirst({ select: { shortName: true } });
  return (
    <>
      <PageHeader
        title="New design"
        description="Upload a logo or generate artwork, pick colours, and preview it from every side."
        back={{ href: "/merch/studio", label: "Studio" }}
      />
      <Designer
        editable
        canSubmit
        initial={{
          name: "",
          productType: "hoodie",
          baseColor: "#111827",
          inkColor: "#ffffff",
          frontText: org?.shortName ?? "",
          backText: "",
          artworkSvg: null,
          artworkSource: null,
          aiPrompt: "",
          logo: null,
          sizes: ["S", "M", "L", "XL", "XXL"],
          costRupees: 0,
          priceRupees: 999,
        }}
      />
    </>
  );
}
