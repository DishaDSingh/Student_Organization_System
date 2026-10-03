"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok, type ActionResult } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth/current-user";
import { formatINR, rupeesToPaise, standing } from "@/lib/membership/rules";
import { holdUntil } from "@/lib/events/service";
import { priceMerch, skuFor } from "@/lib/merch/rules";
import { OutOfStockError, moveStock, nextMerchOrderNumber, settleMerchOrder, voidMerchOrder } from "@/lib/merch/service";
import {
  buyMerchSchema,
  confirmMerchSchema,
  deskMerchSaleSchema,
  merchOrderIdSchema,
  newProductSchema,
  PAYMENT_METHOD_LABEL,
  productSchema,
  reorderLevelSchema,
  stockAdjustSchema,
  voidMerchSchema,
} from "@/lib/validation/schemas";

const refresh = (productId?: string) => {
  revalidatePath("/merch");
  revalidatePath("/merch/inventory");
  revalidatePath("/merch/orders");
  if (productId) revalidatePath(`/merch/${productId}`);
};

// ─── Products & stock ────────────────────────────────────────────────────────

export const createProduct = guardedAction(
  { permission: "merchandise.manage_products", schema: newProductSchema },
  async (input, actor) => {
    const product = await db.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          publicPricePaise: rupeesToPaise(input.publicPriceRupees),
          memberPricePaise: rupeesToPaise(input.memberPriceRupees),
          unitCostPaise: rupeesToPaise(input.unitCostRupees),
          status: input.status,
        },
      });
      for (const c of input.colors) {
        for (const size of input.sizes) {
          const v = await tx.productVariant.create({
            data: {
              productId: p.id,
              sku: skuFor(p.name, c.name, size),
              size,
              color: c.name,
              colorHex: c.hex,
              reorderLevel: input.reorderLevel,
            },
          });
          if (input.initialStock > 0) {
            await moveStock(tx, {
              variantId: v.id,
              change: input.initialStock,
              reason: "RESTOCK",
              note: "Initial stock",
              actorId: actor.id,
            });
          }
        }
      }
      await audit(tx, {
        actor,
        action: "product.create",
        entityType: "Product",
        entityId: p.id,
        summary: `Created product "${p.name}" — ${input.sizes.length * input.colors.length} variants, ${formatINR(p.publicPricePaise)} (${formatINR(p.memberPricePaise)} members)`,
        after: { ...input },
      });
      return p;
    });
    refresh(product.id);
    return ok({ id: product.id }, "Product created");
  },
);

export const updateProduct = guardedAction({ permission: "merchandise.manage_products", schema: productSchema }, async (input, actor) => {
  if (!input.productId) return fail("Missing product.");
  const before = await db.product.findUnique({
    where: { id: input.productId },
    select: {
      name: true,
      category: true,
      description: true,
      publicPricePaise: true,
      memberPricePaise: true,
      unitCostPaise: true,
      status: true,
    },
  });
  if (!before) return fail("Product not found.");
  const next = {
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    publicPricePaise: rupeesToPaise(input.publicPriceRupees),
    memberPricePaise: rupeesToPaise(input.memberPriceRupees),
    unitCostPaise: rupeesToPaise(input.unitCostRupees),
    status: input.status,
  };
  const changes = diff(before, next);
  if (!changes.changed) return ok(undefined, "No changes to save");
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: input.productId }, data: next });
    await audit(tx, {
      actor,
      action: "product.update",
      entityType: "Product",
      entityId: input.productId,
      summary: `Updated "${next.name}" (${Object.keys(changes.after).join(", ")})`,
      before: changes.before,
      after: changes.after,
    });
  });
  refresh(input.productId);
  return ok(undefined, "Product saved");
});

export const adjustStock = guardedAction(
  { permission: "merchandise.manage_inventory", schema: stockAdjustSchema },
  async (input, actor) => {
    const v = await db.productVariant.findUnique({
      where: { id: input.variantId },
      select: { stock: true, size: true, color: true, productId: true, product: { select: { name: true } } },
    });
    if (!v) return fail("Variant not found.");
    try {
      const after = await db.$transaction(async (tx) => {
        const stockAfter = await moveStock(tx, {
          variantId: input.variantId,
          change: input.change,
          reason: input.reason,
          note: input.note,
          actorId: actor.id,
        });
        await audit(tx, {
          actor,
          action: "stock.adjust",
          entityType: "Product",
          entityId: v.productId,
          summary: `Inventory ${v.product.name} ${v.color}/${v.size}: ${v.stock} → ${stockAfter} (${input.reason.toLowerCase()}${input.note ? ` — ${input.note}` : ""})`,
          before: { stock: v.stock },
          after: { stock: stockAfter },
        });
        return stockAfter;
      });
      refresh(v.productId);
      return ok({ stock: after }, `Stock is now ${after}`);
    } catch (e) {
      if (e instanceof OutOfStockError) return fail(`Only ${v.stock} in stock — can't remove ${-input.change}.`, { change: ["Too many"] });
      throw e;
    }
  },
);

export const setReorderLevel = guardedAction(
  { permission: "merchandise.manage_inventory", schema: reorderLevelSchema },
  async ({ variantId, reorderLevel }, actor) => {
    const v = await db.productVariant.findUnique({
      where: { id: variantId },
      select: { reorderLevel: true, productId: true, size: true, color: true },
    });
    if (!v) return fail("Variant not found.");
    if (v.reorderLevel === reorderLevel) return ok(undefined);
    await db.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: variantId }, data: { reorderLevel } });
      await audit(tx, {
        actor,
        action: "stock.reorder_level",
        entityType: "Product",
        entityId: v.productId,
        summary: `Reorder level for ${v.color}/${v.size}: ${v.reorderLevel} → ${reorderLevel}`,
      });
    });
    refresh(v.productId);
    return ok(undefined, "Reorder level saved");
  },
);

// ─── Orders ──────────────────────────────────────────────────────────────────

async function isActiveMember(userId: string) {
  const terms = await db.membership.findMany({ where: { userId }, select: { status: true, startDate: true, endDate: true } });
  const s = standing(terms).state;
  return s === "ACTIVE" || s === "EXPIRING";
}

async function createMerchOrder(opts: {
  lines: { variantId: string; quantity: number }[];
  buyer: { id: string | null; name: string; phone?: string | null };
  channel: "ONLINE" | "DOOR";
  reference?: string | null;
  actor: CurrentUser;
}): Promise<ActionResult<{ orderId: string; orderNumber: string; totalPaise: number }>> {
  const variants = await db.productVariant.findMany({
    where: { id: { in: opts.lines.map((l) => l.variantId) }, isActive: true, product: { status: "ACTIVE" } },
    include: { product: { select: { publicPricePaise: true, memberPricePaise: true, name: true } } },
  });
  if (variants.length !== new Set(opts.lines.map((l) => l.variantId)).size) return fail("One of those items isn't available any more.");
  const byId = new Map(variants.map((v) => [v.id, v]));
  const member = opts.buyer.id ? await isActiveMember(opts.buyer.id) : false;
  const priced = priceMerch(
    opts.lines.map((l) => ({
      quantity: l.quantity,
      publicPricePaise: byId.get(l.variantId)!.product.publicPricePaise,
      memberPricePaise: byId.get(l.variantId)!.product.memberPricePaise,
    })),
    member,
  );

  try {
    const order = await db.$transaction(async (tx) => {
      const orderNumber = await nextMerchOrderNumber(tx);
      const order = await tx.merchOrder.create({
        data: {
          orderNumber,
          buyerId: opts.buyer.id,
          buyerName: opts.buyer.name,
          buyerPhone: opts.buyer.phone ?? null,
          channel: opts.channel,
          totalPaise: priced.totalPaise,
          claimedReference: opts.channel === "ONLINE" ? (opts.reference ?? null) : null,
          holdUntil: opts.channel === "ONLINE" ? holdUntil() : null,
          items: { create: opts.lines.map((l, i) => ({ variantId: l.variantId, quantity: l.quantity, ...priced.items[i] })) },
        },
      });
      // Stock is taken when the order is placed so nobody else can buy it; released if it's cancelled.
      for (const l of opts.lines) {
        await moveStock(tx, {
          variantId: l.variantId,
          change: -l.quantity,
          reason: "SALE",
          note: orderNumber,
          orderId: order.id,
          actorId: opts.actor.id,
        });
      }
      return order;
    });
    return ok({ orderId: order.id, orderNumber: order.orderNumber, totalPaise: priced.totalPaise });
  } catch (e) {
    if (e instanceof OutOfStockError) return fail("Sorry — one of those sizes just sold out. Refresh to see what's left.");
    throw e;
  }
}

export const buyMerch = guardedAction({ schema: buyMerchSchema }, async ({ lines, reference }, actor) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true, phone: true } });
  const res = await createMerchOrder({ lines, buyer: { id: actor.id, ...user }, channel: "ONLINE", reference, actor });
  if (!res.ok) return res;
  await db.$transaction((tx) =>
    audit(tx, {
      actor,
      action: "merch.order",
      entityType: "MerchOrder",
      entityId: res.data.orderId,
      summary: `${actor.name} ordered merch ${res.data.orderNumber} — ${formatINR(res.data.totalPaise)}`,
    }),
  );
  refresh();
  revalidatePath("/me/orders");
  return ok(res.data, "Order placed — pay to confirm. We've set the items aside for 48 hours.");
});

export const deskMerchSale = guardedAction(
  { permission: "merchandise.manage_orders", schema: deskMerchSaleSchema },
  async (input, actor) => {
    const buyer = input.memberId
      ? await db.user.findUnique({ where: { id: input.memberId }, select: { id: true, name: true, phone: true } })
      : { id: null, name: input.buyerName!, phone: input.buyerPhone ?? null };
    if (!buyer) return fail("Member not found.");
    const res = await createMerchOrder({ lines: input.lines, buyer, channel: "DOOR", actor });
    if (!res.ok) return res;
    const settled = await db.$transaction(async (tx) => {
      const s = await settleMerchOrder(tx, {
        orderId: res.data.orderId,
        method: input.method,
        reference: input.reference,
        receivedById: actor.id,
      });
      // Desk sales are handed over on the spot.
      await tx.merchOrder.update({
        where: { id: res.data.orderId },
        data: { status: "FULFILLED", fulfilledAt: new Date(), fulfilledById: actor.id },
      });
      await audit(tx, {
        actor,
        action: "merch.desk_sale",
        entityType: "MerchOrder",
        entityId: res.data.orderId,
        summary: `Desk sale to ${buyer.name}: ${res.data.orderNumber}, ${formatINR(res.data.totalPaise)} by ${PAYMENT_METHOD_LABEL[input.method]} (receipt ${s.payment.receiptNumber})`,
      });
      return s;
    });
    refresh();
    return ok(res.data, `Sold — receipt ${settled.payment.receiptNumber}`);
  },
);

export const confirmMerchPayment = guardedAction(
  { permission: ["merchandise.manage_orders", "finance.record_income"], schema: confirmMerchSchema },
  async (input, actor) => {
    const o = await db.merchOrder.findUnique({
      where: { id: input.orderId },
      select: { status: true, orderNumber: true, buyerName: true, buyerId: true, totalPaise: true },
    });
    if (!o) return fail("Order not found.");
    if (o.status !== "PENDING_PAYMENT") return fail("This order isn't awaiting payment.");
    const s = await db.$transaction(async (tx) => {
      const s = await settleMerchOrder(tx, {
        orderId: input.orderId,
        method: input.method,
        reference: input.reference,
        receivedById: actor.id,
      });
      await audit(tx, {
        actor,
        action: "merch.order.confirm",
        entityType: "MerchOrder",
        entityId: input.orderId,
        summary: `Confirmed ${formatINR(o.totalPaise)} from ${o.buyerName} for ${o.orderNumber} (receipt ${s.payment.receiptNumber})`,
      });
      if (o.buyerId) {
        await tx.notification.create({
          data: {
            userId: o.buyerId,
            type: "merch.paid",
            title: "Merch order confirmed",
            body: `${o.orderNumber} is paid. Collect it from the merch desk.`,
            link: "/me/orders",
          },
        });
      }
      return s;
    });
    refresh();
    return ok(undefined, `Confirmed — receipt ${s.payment.receiptNumber}`);
  },
);

export const fulfilMerchOrder = guardedAction(
  { permission: "merchandise.manage_orders", schema: merchOrderIdSchema },
  async ({ orderId }, actor) => {
    const o = await db.merchOrder.findUnique({ where: { id: orderId }, select: { status: true, orderNumber: true, buyerName: true } });
    if (!o) return fail("Order not found.");
    if (o.status !== "PAID")
      return fail(o.status === "PENDING_PAYMENT" ? "Confirm the payment before handing it over." : "This order is already closed.");
    await db.$transaction(async (tx) => {
      await tx.merchOrder.update({
        where: { id: orderId },
        data: { status: "FULFILLED", fulfilledAt: new Date(), fulfilledById: actor.id },
      });
      await audit(tx, {
        actor,
        action: "merch.order.fulfil",
        entityType: "MerchOrder",
        entityId: orderId,
        summary: `Handed over ${o.orderNumber} to ${o.buyerName}`,
      });
    });
    refresh();
    return ok(undefined, "Marked as collected");
  },
);

export const voidMerch = guardedAction(
  { permission: "merchandise.manage_orders", schema: voidMerchSchema },
  async ({ orderId, reason }, actor) => {
    const o = await db.merchOrder.findUnique({
      where: { id: orderId },
      select: { status: true, orderNumber: true, buyerName: true, totalPaise: true },
    });
    if (!o) return fail("Order not found.");
    if (o.status !== "PENDING_PAYMENT" && o.status !== "PAID")
      return fail(
        o.status === "FULFILLED" ? "Already handed over — record a return as a stock adjustment instead." : "This order is already closed.",
      );
    const to = o.status === "PAID" ? "REFUNDED" : "CANCELLED";
    await db.$transaction(async (tx) => {
      await voidMerchOrder(tx, orderId, to, actor.id);
      await audit(tx, {
        actor,
        action: to === "REFUNDED" ? "merch.order.refund" : "merch.order.cancel",
        entityType: "MerchOrder",
        entityId: orderId,
        summary: `${to === "REFUNDED" ? `Refunded ${formatINR(o.totalPaise)} to` : "Cancelled unpaid order for"} ${o.buyerName} (${o.orderNumber}) — ${reason}; stock returned`,
      });
    });
    refresh();
    return ok(undefined, to === "REFUNDED" ? "Refunded — stock returned" : "Cancelled — stock returned");
  },
);

export const cancelMyMerchOrder = guardedAction({ schema: merchOrderIdSchema }, async ({ orderId }, actor) => {
  const o = await db.merchOrder.findUnique({ where: { id: orderId }, select: { buyerId: true, status: true, orderNumber: true } });
  if (!o || o.buyerId !== actor.id) return fail("Order not found.");
  if (o.status !== "PENDING_PAYMENT") return fail("Only unpaid orders can be cancelled here.");
  await db.$transaction(async (tx) => {
    await voidMerchOrder(tx, orderId, "CANCELLED", actor.id);
    await audit(tx, {
      actor,
      action: "merch.order.cancel",
      entityType: "MerchOrder",
      entityId: orderId,
      summary: `${actor.name} cancelled their unpaid order ${o.orderNumber}`,
    });
  });
  refresh();
  revalidatePath("/me/orders");
  return ok(undefined, "Order cancelled");
});
