import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import type { MerchOrderStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, Pagination } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRelative, pageParam, param } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { DeskSaleDialog, MerchOrderActions } from "../merch-forms";

export const metadata: Metadata = { title: "Merch orders" };
const PAGE_SIZE = 30;

const TABS = [
  { key: "open", label: "To handle", statuses: ["PENDING_PAYMENT", "PAID"] },
  { key: "pending", label: "Unpaid", statuses: ["PENDING_PAYMENT"] },
  { key: "paid", label: "Ready to collect", statuses: ["PAID"] },
  { key: "done", label: "Collected", statuses: ["FULFILLED"] },
  { key: "closed", label: "Cancelled / refunded", statuses: ["CANCELLED", "REFUNDED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly MerchOrderStatus[] }[];

const TONE: Record<string, string> = {
  PENDING_PAYMENT: "text-info",
  PAID: "text-amber-600 dark:text-amber-400",
  FULFILLED: "text-success",
  CANCELLED: "text-muted-foreground",
  REFUNDED: "text-destructive",
};
const LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Unpaid",
  PAID: "Paid — to collect",
  FULFILLED: "Collected",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default async function MerchOrdersPage(props: PageProps<"/merch/orders">) {
  const user = await requirePermission("merchandise.view");
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === param(sp.tab)) ?? TABS[0];
  const page = pageParam(sp.page);
  const manage = can(user, "merchandise.manage_orders");
  const where: Prisma.MerchOrderWhereInput = { status: { in: [...tab.statuses] } };

  const [orders, total, counts, variants] = await Promise.all([
    db.merchOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { items: { include: { variant: { select: { size: true, color: true, product: { select: { name: true } } } } } } },
    }),
    db.merchOrder.count({ where }),
    db.merchOrder.groupBy({ by: ["status"], _count: true }),
    manage
      ? db.productVariant.findMany({
          where: { isActive: true, product: { status: "ACTIVE" } },
          orderBy: [{ product: { name: "asc" } }, { color: "asc" }],
          select: { id: true, size: true, color: true, stock: true, product: { select: { name: true } } },
        })
      : [],
  ]);
  const count = (statuses: readonly string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);

  return (
    <>
      <PageHeader
        title="Merch orders"
        description="Online orders hold stock for 48 hours until paid. Paid orders are collected from the merch desk."
        back={{ href: "/merch", label: "Merch" }}
        actions={
          manage && (
            <DeskSaleDialog
              variants={variants.map((v) => ({ id: v.id, label: `${v.product.name} — ${v.color} ${v.size}`, stock: v.stock }))}
            />
          )
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b" aria-label="Order status">
        {TABS.map((t) => {
          return (
            <Link
              key={t.key}
              href={`/merch/orders?tab=${t.key}`}
              aria-current={tab.key === t.key ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                tab.key === t.key
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label} <span className="text-muted-foreground tabular-nums">{count(t.statuses)}</span>
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title="Nothing here" />
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Order</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-4 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4">
                    <span className="font-medium">{o.buyerName}</span>
                    <span className="text-muted-foreground block text-xs">
                      <span className="font-mono">{o.orderNumber}</span> · {o.channel === "DOOR" ? "desk" : "online"} ·{" "}
                      {fmtRelative(o.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {o.items.map((i) => `${i.quantity}× ${i.variant.product.name} (${i.variant.color} ${i.variant.size})`).join(", ")}
                    {o.claimedReference && <span className="text-muted-foreground block text-xs">ref {o.claimedReference}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(o.totalPaise)}</TableCell>
                  <TableCell className="pr-4 text-right whitespace-nowrap">
                    <span className={cn("text-xs font-medium", TONE[o.status])}>{LABEL[o.status]}</span>
                    {manage && <MerchOrderActions order={o} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} />
    </>
  );
}
