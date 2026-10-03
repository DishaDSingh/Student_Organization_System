import type { Metadata } from "next";
import Link from "next/link";
import { PaletteIcon, PlusIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { MockupFace } from "@/components/merch/mockup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { svgDataUri } from "@/lib/merch/artwork";
import { DESIGN_STATUS as STATUS, type ProductTypeKey } from "@/lib/merch/rules";

export const metadata: Metadata = { title: "Merch Studio" };

export default async function StudioPage() {
  await requirePermission("merchandise.studio", "merchandise.manage_products");
  const designs = await db.merchDesign.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: { createdBy: { select: { name: true } }, product: { select: { id: true } } },
  });

  return (
    <>
      <PageHeader
        title="Merch Studio"
        description="Design next year's merch before ordering it: generate artwork with AI or the offline templates, preview it in 3D, get it approved, then turn it into a product."
        back={{ href: "/merch", label: "Merch" }}
        actions={
          <Button asChild>
            <Link href="/merch/studio/new">
              <PlusIcon /> New design
            </Link>
          </Button>
        }
      />
      {designs.length === 0 ? (
        <EmptyState icon={PaletteIcon} title="No designs yet">
          Start a concept — it only becomes a product once it&apos;s approved.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {designs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/merch/studio/${d.id}`}
                className="bg-card hover:border-primary/40 block overflow-hidden rounded-xl border transition-colors"
              >
                <div className="from-muted/60 to-background aspect-square bg-gradient-to-b p-6">
                  <MockupFace
                    type={d.productType as ProductTypeKey}
                    side="front"
                    color={d.baseColor}
                    artwork={d.artworkSvg ? svgDataUri(d.artworkSvg) : d.logoUploadId ? `/api/uploads/${d.logoUploadId}` : null}
                    text={d.frontText}
                    ink={d.inkColor}
                  />
                </div>
                <div className="border-t p-4">
                  <p className="font-medium">{d.name}</p>
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className={cn("font-medium", STATUS[d.status][1])}>{d.product ? "Product created" : STATUS[d.status][0]}</span>
                    <span className="text-muted-foreground">
                      {d.sellingPricePaise ? formatINR(d.sellingPricePaise) : "—"} · {fmtRelative(d.updatedAt)}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">by {d.createdBy?.name ?? "—"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
