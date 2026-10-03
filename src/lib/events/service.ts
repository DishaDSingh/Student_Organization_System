import { randomBytes } from "node:crypto";
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { nextReceiptNumber } from "@/lib/membership/service";
import { HOLD_HOURS } from "./rules";

type Tx = Prisma.TransactionClient;

export const newTicketCode = () => randomBytes(15).toString("base64url");

export class SoldOutError extends Error {}

/**
 * Reserve seats atomically. A single conditional UPDATE both checks and
 * increments, so two buyers racing for the last seat can't both win.
 */
export async function allocateSeats(tx: Tx, eventId: string, ticketTypeId: string, qty: number) {
  const typeRows = await tx.$executeRaw`
    UPDATE "TicketType" SET "allocated" = "allocated" + ${qty}
    WHERE "id" = ${ticketTypeId} AND "isActive" = true AND "allocated" + ${qty} <= "quantity"`;
  if (typeRows !== 1) throw new SoldOutError("Not enough tickets of that type left.");
  const eventRows = await tx.$executeRaw`
    UPDATE "Event" SET "allocated" = "allocated" + ${qty}
    WHERE "id" = ${eventId} AND "allocated" + ${qty} <= "capacity"`;
  if (eventRows !== 1) throw new SoldOutError("The event is at capacity.");
}

export async function releaseSeats(tx: Tx, eventId: string, byType: Map<string, number>) {
  let total = 0;
  for (const [typeId, n] of byType) {
    total += n;
    await tx.$executeRaw`UPDATE "TicketType" SET "allocated" = GREATEST(0, "allocated" - ${n}) WHERE "id" = ${typeId}`;
  }
  if (total) await tx.$executeRaw`UPDATE "Event" SET "allocated" = GREATEST(0, "allocated" - ${total}) WHERE "id" = ${eventId}`;
}

export async function nextOrderNumber(tx: Tx, at = new Date()) {
  const prefix = `TKT-${at.getFullYear()}-`;
  const last = await tx.ticketOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const n = last ? Number.parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

export const holdUntil = (from = new Date()) => new Date(from.getTime() + HOLD_HOURS * 3600_000);

/** Mark an order paid: payment row with receipt, tickets become valid. */
export async function settleOrder(
  tx: Tx,
  opts: { orderId: string; method: PaymentMethod; reference?: string | null; receivedById: string | null; paidAt?: Date },
) {
  const order = await tx.ticketOrder.findUniqueOrThrow({ where: { id: opts.orderId } });
  if (order.status !== "PENDING_PAYMENT") throw new Error("Order is not awaiting payment");
  const paidAt = opts.paidAt ?? new Date();
  const payment =
    order.totalPaise > 0
      ? await tx.payment.create({
          data: {
            receiptNumber: await nextReceiptNumber(tx, paidAt),
            purpose: "TICKET",
            payerId: order.buyerId,
            ticketOrderId: order.id,
            amountPaise: order.totalPaise,
            method: opts.method,
            reference: opts.reference ?? order.claimedReference,
            receivedById: opts.receivedById,
            paidAt,
          },
        })
      : null;
  await tx.ticketOrder.update({ where: { id: order.id }, data: { status: "PAID", holdUntil: null } });
  await tx.ticket.updateMany({ where: { orderId: order.id, status: "RESERVED" }, data: { status: "VALID" } });
  return { order, payment };
}

/** Cancel or refund an order and give its seats back. */
export async function voidOrder(tx: Tx, orderId: string, to: "CANCELLED" | "REFUNDED") {
  const order = await tx.ticketOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { tickets: { select: { ticketTypeId: true, status: true } }, payment: { select: { id: true } } },
  });
  const live = order.tickets.filter((t) => t.status === "RESERVED" || t.status === "VALID");
  const byType = new Map<string, number>();
  for (const t of live) byType.set(t.ticketTypeId, (byType.get(t.ticketTypeId) ?? 0) + 1);
  await releaseSeats(tx, order.eventId, byType);
  await tx.ticket.updateMany({
    where: { orderId, status: { in: ["RESERVED", "VALID"] } },
    data: { status: to === "REFUNDED" ? "REFUNDED" : "CANCELLED" },
  });
  await tx.ticketOrder.update({ where: { id: orderId }, data: { status: to, holdUntil: null } });
  if (to === "REFUNDED" && order.payment) await tx.payment.update({ where: { id: order.payment.id }, data: { status: "REFUNDED" } });
  return { order, released: live.length };
}

/** Background job: release seats held by unpaid online orders past their hold. */
export async function releaseExpiredHolds(
  db: { $transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>; ticketOrder: Tx["ticketOrder"] },
  now = new Date(),
) {
  const expired = await db.ticketOrder.findMany({
    where: { status: "PENDING_PAYMENT", holdUntil: { lt: now }, claimedReference: null },
    select: { id: true },
  });
  for (const o of expired) await db.$transaction((tx) => voidOrder(tx, o.id, "CANCELLED"));
  return expired.length;
}
