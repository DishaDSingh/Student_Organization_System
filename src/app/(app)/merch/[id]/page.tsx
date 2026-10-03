import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth/current-user";
import { PageHeader, PageTabs, Section, activeTab } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR, standing } from "@/lib/membership/rules";
import { marginPct, sizeRank, stockState } from "@/lib/merch/rules";
import { mockupProps } from "@/lib/merch/art";
import { EditProductDialog, ReorderLevelInput, StockDialog } from "../merch-forms";
import { ProductView } from "./product-view";

export const metadata: Metadata = { title: "Product" };

const STOCK_TONE = { OUT: "text-destructive", LOW: "text-amber-600 dark:text-amber-400", OK: "text-muted-foreground" } as const;

export default async function ProductPage(props: PageProps<"/merch/[id]">) {
  const user = await requireUser();
  const staff = can(user, "merchandise.view");
  const { id } = await props.params;
  const tab = staff ? activeTab(["product", "stock"] as const, (await props.searchParams).tab) : "product";

  const p = await db.product.findUnique({
    where: { id },
    include: {
      design: {
        select: {
          id: true,
          name: true,
          productType: true,
          baseColor: true,
          inkColor: true,
          artworkSvg: true,
          logoUploadId: true,
          frontText: true,
          backText: true,
        },
      },
      variants: {
        orderBy: [{ color: "asc" }],
        select: { id: true, sku: true, size: true, color: true, colorHex: true, stock: true, reorderLevel: true, isActive: true },
      },
    },
  });
  if (!p || (p.status !== "ACTIVE" && !staff)) notFound();

  const [terms, movements, sold] = await Promise.all([
    db.membership.findMany({ where: { userId: user.id }, select: { status: true, startDate: true, endDate: true } }),
    staff
      ? db.stockMovement.findMany({
          where: { variant: { productId: id } },
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { variant: { select: { size: true, color: true } }, actor: { select: { name: true } } },
        })
      : null,
    staff
      ? db.merchOrderItem.groupBy({
          by: ["variantId"],
          where: { variant: { productId: id }, order: { status: { in: ["PAID", "FULFILLED"] } } },
          _sum: { quantity: true },
        })
      : null,
  ]);
  const state = standing(terms).state;
  const isMember = state === "ACTIVE" || state === "EXPIRING";
  const variants = [...p.variants].sort((a, b) => a.color.localeCompare(b.color) || sizeRank(a.size) - sizeRank(b.size));
  const soldBy = new Map(sold?.map((s) => [s.variantId, s._sum.quantity ?? 0]));
  const totalSold = [...soldBy.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/merch", label: "Merch" }}
        title={p.name}
        description={
          <>
            {p.category}
            {p.status !== "ACTIVE" && ` · ${p.status.toLowerCase()}`}
            {p.design && staff && (
              <>
                {" · "}
                <Link href={`/merch/studio/${p.design.id}`} className="text-primary hover:underline">
                  Studio design
                </Link>
              </>
            )}
          </>
        }
        actions={can(user, "merchandise.manage_products") && <EditProductDialog product={p} />}
      />

      {staff && (
        <PageTabs
          basePath={`/merch/${p.id}`}
          current={tab}
          tabs={[
            { key: "product", label: "Product" },
            { key: "stock", label: "Stock", count: variants.reduce((n, v) => n + v.stock, 0) },
          ]}
        />
      )}

      {tab === "product" && (
        <section className="bg-card mb-6 rounded-xl border p-4 sm:p-6">
          <ProductView
            art={mockupProps(p)}
            variants={variants.filter((v) => v.isActive)}
            pricePaise={isMember ? p.memberPricePaise : p.publicPricePaise}
            publicPricePaise={p.publicPricePaise}
            isMember={isMember}
            buyable={p.status === "ACTIVE"}
          />
          {p.description && <p className="text-muted-foreground mt-6 max-w-2xl text-sm">{p.description}</p>}
          <p className="text-muted-foreground mt-3 text-xs">Preview is a visual mockup; final print may differ slightly.</p>
        </section>
      )}

      {staff && tab === "stock" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Section
            title="Stock by size"
            description={`${totalSold} sold · price ${formatINR(p.publicPricePaise)} / ${formatINR(p.memberPricePaise)} member · cost ${formatINR(p.unitCostPaise)} (${marginPct(p.publicPricePaise, p.unitCostPaise)}% margin)`}
            className="min-w-0"
          >
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-5">Variant</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Reorder at</TableHead>
                    <TableHead className="w-10 pr-4 sm:pr-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((v) => {
                    const st = stockState(v);
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="pl-4 sm:pl-5">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-3 rounded-full border" style={{ background: v.colorHex }} />
                            {v.color} · {v.size}
                          </span>
                          <span className="text-muted-foreground block font-mono text-[11px]">{v.sku}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{soldBy.get(v.id) ?? 0}</TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", STOCK_TONE[st])}>
                          {v.stock}
                          {st !== "OK" && <span className="block text-[11px] font-normal">{st === "OUT" ? "sold out" : "reorder"}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {can(user, "merchandise.manage_inventory") ? (
                            <ReorderLevelInput variantId={v.id} value={v.reorderLevel} />
                          ) : (
                            v.reorderLevel
                          )}
                        </TableCell>
                        <TableCell className="pr-4 sm:pr-5">
                          {can(user, "merchandise.manage_inventory") && (
                            <StockDialog variant={{ id: v.id, label: `${v.color} · ${v.size}`, stock: v.stock }} />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section title="Stock history">
            {movements?.length ? (
              <ol className="grid gap-2.5 text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="grid gap-0.5">
                    <span>
                      <span className={cn("font-medium tabular-nums", m.change > 0 ? "text-success" : "text-foreground")}>
                        {m.change > 0 ? "+" : ""}
                        {m.change}
                      </span>{" "}
                      {m.variant.color} {m.variant.size} → {m.stockAfter}
                      <span className="text-muted-foreground"> · {m.reason.toLowerCase()}</span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {m.note && `${m.note} · `}
                      {m.actor?.name ?? "System"} · {fmtDateTime(m.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">No stock changes yet.</p>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
