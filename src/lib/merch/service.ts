import type { PaymentMethod, Prisma, StockReason } from "@/generated/prisma/client";
import { nextReceiptNumber } from "@/lib/membership/service";

type Tx = Prisma.TransactionClient;

export class OutOfStockError extends Error {}

/**
 * Change stock atomically and log the movement. Decrements only succeed when
 * enough stock exists, so two buyers can't take the last M hoodie.
 */
export async function moveStock(
  tx: Tx,
  opts: { variantId: string; change: number; reason: StockReason; note?: string | null; orderId?: string | null; actorId?: string | null },
) {
  const rows =
    opts.change < 0
      ? await tx.$queryRaw<{ stock: number }[]>`
          UPDATE "ProductVariant" SET "stock" = "stock" + ${opts.change}
          WHERE "id" = ${opts.variantId} AND "stock" + ${opts.change} >= 0 RETURNING "stock"`
      : await tx.$queryRaw<{ stock: number }[]>`
          UPDATE "ProductVariant" SET "stock" = "stock" + ${opts.change}
          WHERE "id" = ${opts.variantId} RETURNING "stock"`;
  if (!rows.length) throw new OutOfStockError("Not enough stock left.");
  await tx.stockMovement.create({
    data: {
      variantId: opts.variantId,
      change: opts.change,
      stockAfter: rows[0].stock,
      reason: opts.reason,
      note: opts.note ?? null,
      orderId: opts.orderId ?? null,
      actorId: opts.actorId ?? null,
    },
  });
  return rows[0].stock;
}

export async function nextMerchOrderNumber(tx: Tx, at = new Date()) {
  const prefix = `MRC-${at.getFullYear()}-`;
  const last = await tx.merchOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const n = last ? Number.parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

export async function settleMerchOrder(
  tx: Tx,
  opts: { orderId: string; method: PaymentMethod; reference?: string | null; receivedById: string | null; paidAt?: Date },
) {
  const order = await tx.merchOrder.findUniqueOrThrow({ where: { id: opts.orderId } });
  if (order.status !== "PENDING_PAYMENT") throw new Error("Order is not awaiting payment");
  const paidAt = opts.paidAt ?? new Date();
  const payment = await tx.payment.create({
    data: {
      receiptNumber: await nextReceiptNumber(tx, paidAt),
      purpose: "MERCH",
      payerId: order.buyerId,
      merchOrderId: order.id,
      amountPaise: order.totalPaise,
      method: opts.method,
      reference: opts.reference ?? order.claimedReference,
      receivedById: opts.receivedById,
      paidAt,
    },
  });
  await tx.merchOrder.update({ where: { id: order.id }, data: { status: "PAID", holdUntil: null } });
  return { order, payment };
}

/** Cancel (unpaid) or refund (paid, not yet handed over) and put the stock back. */
export async function voidMerchOrder(tx: Tx, orderId: string, to: "CANCELLED" | "REFUNDED", actorId: string | null) {
  const order = await tx.merchOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, payment: { select: { id: true } } },
  });
  for (const item of order.items) {
    await moveStock(tx, {
      variantId: item.variantId,
      change: item.quantity,
      reason: "RELEASE",
      note: `${to === "REFUNDED" ? "Refund" : "Cancelled"} ${order.orderNumber}`,
      orderId,
      actorId,
    });
  }
  await tx.merchOrder.update({ where: { id: orderId }, data: { status: to, holdUntil: null } });
  if (to === "REFUNDED" && order.payment) await tx.payment.update({ where: { id: order.payment.id }, data: { status: "REFUNDED" } });
  return order;
}

/** Background job: unpaid online merch orders release their stock after the hold. */
export async function releaseExpiredMerchHolds(
  db: { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>; merchOrder: Tx["merchOrder"] },
  now = new Date(),
) {
  const expired = await db.merchOrder.findMany({
    where: { status: "PENDING_PAYMENT", holdUntil: { lt: now }, claimedReference: null },
    select: { id: true },
  });
  for (const o of expired) await db.$transaction((tx) => voidMerchOrder(tx, o.id, "CANCELLED", null));
  return expired.length;
}
