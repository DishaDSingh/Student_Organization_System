import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { Meter } from "@/components/events";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysAgo, fmtDateTime, param } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { sizeRank, stockState } from "@/lib/merch/rules";
import { ReorderLevelInput, StockDialog } from "../merch-forms";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage(props: PageProps<"/merch/inventory">) {
  const user = await requirePermission("merchandise.view");
  const onlyLow = param((await props.searchParams).show) === "low";
  const manage = can(user, "merchandise.manage_inventory");

  const [variants, movements, sales] = await Promise.all([
    db.productVariant.findMany({
      where: { isActive: true, product: { status: { not: "ARCHIVED" } } },
      include: { product: { select: { id: true, name: true, unitCostPaise: true, status: true } } },
    }),
    db.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { variant: { select: { size: true, color: true, product: { select: { name: true } } } }, actor: { select: { name: true } } },
    }),
    // Units sold per variant in the last 30 days: drives "weeks of cover".
    db.merchOrderItem.groupBy({
      by: ["variantId"],
      where: { order: { status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: daysAgo(30) } } },
      _sum: { quantity: true },
    }),
  ]);
  const sold30 = new Map(sales.map((s) => [s.variantId, s._sum.quantity ?? 0]));

  const rows = variants
    .map((v) => ({ ...v, state: stockState(v), sold30: sold30.get(v.id) ?? 0 }))
    .filter((v) => !onlyLow || v.state !== "OK")
    .sort(
      (a, b) =>
        ({ OUT: 0, LOW: 1, OK: 2 })[a.state] - { OUT: 0, LOW: 1, OK: 2 }[b.state] ||
        a.product.name.localeCompare(b.product.name) ||
        sizeRank(a.size) - sizeRank(b.size),
    );

  const units = variants.reduce((s, v) => s + v.stock, 0);
  const value = variants.reduce((s, v) => s + v.stock * v.product.unitCostPaise, 0);
  const low = variants.filter((v) => stockState(v) !== "OK").length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Every size and colour, lowest stock first. Each change is logged below."
        back={{ href: "/merch", label: "Merch" }}
      />

      <div className="bg-border mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border">
        {[
          ["Units in stock", units.toLocaleString("en-IN")],
          ["Stock value (at cost)", formatINR(value)],
          ["Need reorder", String(low)],
        ].map(([label, v]) => (
          <div key={label} className="bg-card p-4 sm:p-5">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                label === "Need reorder" && low && "text-amber-600 dark:text-amber-400",
              )}
            >
              {v}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Section
          title="Stock levels"
          className="min-w-0"
          actions={
            <Link href={onlyLow ? "/merch/inventory" : "/merch/inventory?show=low"} className="text-primary text-sm hover:underline">
              {onlyLow ? "Show all" : `Only low stock (${low})`}
            </Link>
          }
        >
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-5">Item</TableHead>
                  <TableHead className="w-40">Stock</TableHead>
                  <TableHead className="text-right">Sold 30d</TableHead>
                  <TableHead className="text-right">Reorder at</TableHead>
                  <TableHead className="w-10 pr-4 sm:pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-4 sm:pl-5">
                      <Link href={`/merch/${v.product.id}`} className="font-medium hover:underline">
                        {v.product.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        {v.color} · {v.size}
                        {v.product.status === "DRAFT" && " · draft"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-8 text-right font-medium tabular-nums",
                            v.state === "OUT" ? "text-destructive" : v.state === "LOW" ? "text-amber-600 dark:text-amber-400" : "",
                          )}
                        >
                          {v.stock}
                        </span>
                        <Meter
                          value={v.stock}
                          max={Math.max(v.reorderLevel * 4, v.stock, 1)}
                          className="flex-1"
                          tone={v.state === "OUT" ? "bg-destructive" : v.state === "LOW" ? "bg-warning" : "bg-primary/70"}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.sold30}</TableCell>
                    <TableCell className="text-right">
                      {manage ? <ReorderLevelInput variantId={v.id} value={v.reorderLevel} /> : v.reorderLevel}
                    </TableCell>
                    <TableCell className="pr-4 sm:pr-5">
                      {manage && <StockDialog variant={{ id: v.id, label: `${v.product.name} ${v.color} ${v.size}`, stock: v.stock }} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section title="Recent stock changes">
          <ol className="grid gap-2.5 text-sm">
            {movements.map((m) => (
              <li key={m.id}>
                <p>
                  <span className={cn("font-medium tabular-nums", m.change > 0 ? "text-success" : "")}>
                    {m.change > 0 ? "+" : ""}
                    {m.change}
                  </span>{" "}
                  {m.variant.product.name} {m.variant.color} {m.variant.size} → {m.stockAfter}
                </p>
                <p className="text-muted-foreground text-xs">
                  {m.reason.toLowerCase()}
                  {m.note && ` · ${m.note}`} · {m.actor?.name ?? "System"} · {fmtDateTime(m.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
