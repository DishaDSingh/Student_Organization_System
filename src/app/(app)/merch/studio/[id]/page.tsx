import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { DESIGN_STATUS as STATUS, type ProductTypeKey } from "@/lib/merch/rules";
import { CreateProductButton, Designer, ReviewPanel } from "../designer";

export const metadata: Metadata = { title: "Design" };

export default async function DesignPage(props: PageProps<"/merch/studio/[id]">) {
  const user = await requirePermission("merchandise.studio", "merchandise.manage_products");
  const { id } = await props.params;
  const d = await db.merchDesign.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      product: { select: { id: true, name: true } },
    },
  });
  if (!d) notFound();

  const editable = can(user, "merchandise.studio") && (d.status === "DRAFT" || d.status === "REJECTED");

  return (
    <>
      <PageHeader
        back={{ href: "/merch/studio", label: "Studio" }}
        title={d.name}
        description={
          <span className="flex flex-wrap gap-x-3">
            <span className={cn("font-medium", STATUS[d.status][1])}>{STATUS[d.status][0]}</span>
            <span>by {d.createdBy?.name ?? "—"}</span>
            {d.reviewedBy && d.reviewedAt && (
              <span>
                reviewed by {d.reviewedBy.name}, {fmtDateTime(d.reviewedAt)}
              </span>
            )}
          </span>
        }
        actions={
          d.product ? (
            <Button variant="outline" asChild>
              <Link href={`/merch/${d.product.id}`}>View product</Link>
            </Button>
          ) : (
            d.status === "APPROVED" && can(user, "merchandise.manage_products") && <CreateProductButton designId={d.id} />
          )
        }
      />

      {d.reviewNote && (
        <p
          className={cn(
            "mb-4 rounded-xl border px-4 py-3 text-sm",
            d.status === "REJECTED" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40",
          )}
        >
          <span className="font-medium">Reviewer note:</span> {d.reviewNote}
        </p>
      )}
      {d.status === "IN_REVIEW" && can(user, "merchandise.manage_products") && (d.createdById !== user.id || user.isMasterAdmin) && (
        <div className="mb-6">
          <ReviewPanel designId={d.id} />
        </div>
      )}

      <Designer
        editable={editable}
        canSubmit={editable}
        initial={{
          id: d.id,
          name: d.name,
          productType: d.productType as ProductTypeKey,
          baseColor: d.baseColor,
          inkColor: d.inkColor,
          frontText: d.frontText ?? "",
          backText: d.backText ?? "",
          artworkSvg: d.artworkSvg,
          artworkSource: d.artworkSource as "ai" | "template" | "upload" | null,
          aiPrompt: d.aiPrompt ?? "",
          logo: d.logoUploadId ? { id: d.logoUploadId, url: `/api/uploads/${d.logoUploadId}` } : null,
          sizes: d.sizes,
          costRupees: d.estimatedCostPaise / 100,
          priceRupees: d.sellingPricePaise / 100,
        }}
      />
    </>
  );
}
