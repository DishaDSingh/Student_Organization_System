"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok, type ActionResult } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth/current-user";
import { fmtDateTime } from "@/lib/format";
import { formatINR, rupeesToPaise, standing } from "@/lib/membership/rules";
import { canCheckIn, eventPhase, priceOrder, salesState } from "@/lib/events/rules";
import { SoldOutError, allocateSeats, holdUntil, newTicketCode, nextOrderNumber, settleOrder, voidOrder } from "@/lib/events/service";
import {
  buyTicketsSchema,
  cancelEventSchema,
  checkInSchema,
  confirmOrderSchema,
  doorSaleSchema,
  eventIdSchema,
  eventSchema,
  incidentSchema,
  PAYMENT_METHOD_LABEL,
  resolveIncidentSchema,
  ticketTypeSchema,
  voidOrderSchema,
} from "@/lib/validation/schemas";

const refresh = (eventId: string) => {
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
};

// ─── Event management ────────────────────────────────────────────────────────

export const saveEvent = guardedAction({ permission: ["events.create", "events.edit"], schema: eventSchema }, async (input, actor) => {
  const { eventId, ...rest } = input;
  if (eventId ? !actor.permissions.has("events.edit") : !actor.permissions.has("events.create")) {
    return fail("You don't have permission to do that.");
  }
  const data = {
    ...rest,
    description: rest.description ?? null,
    salesOpenAt: rest.salesOpenAt ?? null,
    salesCloseAt: rest.salesCloseAt ?? null,
    organizerId: rest.organizerId ?? null,
    committeeId: rest.committeeId ?? null,
  };

  const id = await db
    .$transaction(async (tx) => {
      if (eventId) {
        const before = await tx.event.findUniqueOrThrow({
          where: { id: eventId },
          select: {
            title: true,
            description: true,
            category: true,
            venue: true,
            startsAt: true,
            endsAt: true,
            capacity: true,
            allocated: true,
            salesOpenAt: true,
            salesCloseAt: true,
            organizerId: true,
            committeeId: true,
            status: true,
          },
        });
        if (before.status === "CANCELLED") throw new Error("CANCELLED");
        if (data.capacity < before.allocated) throw new Error(`CAPACITY:${before.allocated}`);
        const { allocated: _a, status: _s, ...fields } = before;
        const changes = diff(fields, data);
        if (!changes.changed) return eventId;
        await tx.event.update({ where: { id: eventId }, data });
        await audit(tx, {
          actor,
          action: "event.update",
          entityType: "Event",
          entityId: eventId,
          summary: `Updated event "${data.title}" (${Object.keys(changes.after).join(", ")})`,
          before: changes.before,
          after: changes.after,
        });
        return eventId;
      }
      const e = await tx.event.create({ data: { ...data, createdById: actor.id, organizerId: data.organizerId ?? actor.id } });
      await audit(tx, {
        actor,
        action: "event.create",
        entityType: "Event",
        entityId: e.id,
        summary: `Created draft event "${e.title}" on ${fmtDateTime(e.startsAt)}`,
        after: data,
      });
      return e.id;
    })
    .catch((e: Error) => {
      if (e.message === "CANCELLED") return { error: "Cancelled events can't be edited." };
      if (e.message.startsWith("CAPACITY:"))
        return { error: `Capacity can't go below the ${e.message.slice(9)} tickets already sold or held.` };
      throw e;
    });
  if (typeof id !== "string") return fail(id.error, id.error.startsWith("Capacity") ? { capacity: ["Too low"] } : undefined);

  refresh(id);
  return ok({ id }, eventId ? "Event saved" : "Draft created — add ticket types, then publish");
});

export const publishEvent = guardedAction({ permission: "events.publish", schema: eventIdSchema }, async ({ eventId }, actor) => {
  const e = await db.event.findUnique({
    where: { id: eventId },
    select: { title: true, status: true, endsAt: true, _count: { select: { ticketTypes: { where: { isActive: true } } } } },
  });
  if (!e) return fail("Event not found.");
  if (e.status !== "DRAFT") return fail("Only drafts can be published.");
  if (e.endsAt < new Date()) return fail("This event is in the past.");
  if (!e._count.ticketTypes) return fail("Add at least one ticket type before publishing.");
  await db.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await audit(tx, {
      actor,
      action: "event.publish",
      entityType: "Event",
      entityId: eventId,
      summary: `Published "${e.title}" — tickets are on sale`,
    });
  });
  refresh(eventId);
  return ok(undefined, "Published — tickets are on sale");
});

export const cancelEvent = guardedAction({ permission: "events.cancel", schema: cancelEventSchema }, async ({ eventId, reason }, actor) => {
  const e = await db.event.findUnique({ where: { id: eventId }, select: { title: true, status: true } });
  if (!e) return fail("Event not found.");
  if (e.status === "CANCELLED") return ok(undefined);

  const { pendingVoided, paidOrders } = await db.$transaction(
    async (tx) => {
      const pending = await tx.ticketOrder.findMany({ where: { eventId, status: "PENDING_PAYMENT" }, select: { id: true } });
      for (const o of pending) await voidOrder(tx, o.id, "CANCELLED");
      const paid = await tx.ticketOrder.findMany({ where: { eventId, status: "PAID" }, select: { buyerId: true, totalPaise: true } });
      await tx.event.update({ where: { id: eventId }, data: { status: "CANCELLED", cancelledReason: reason } });
      await tx.notification.createMany({
        data: [...new Set(paid.map((p) => p.buyerId).filter(Boolean) as string[])].map((userId) => ({
          userId,
          type: "event.cancelled",
          title: `${e.title} is cancelled`,
          body: `${reason} Paid tickets will be refunded by the treasurer.`,
          link: "/me/tickets",
        })),
      });
      await audit(tx, {
        actor,
        action: "event.cancel",
        entityType: "Event",
        entityId: eventId,
        summary: `Cancelled "${e.title}" — ${reason} (${pending.length} unpaid orders voided, ${paid.length} paid orders to refund)`,
        before: { status: e.status },
        after: { status: "CANCELLED", reason },
      });
      return { pendingVoided: pending.length, paidOrders: paid.length };
    },
    { timeout: 30_000 },
  );
  refresh(eventId);
  return ok(undefined, `Event cancelled. ${pendingVoided} unpaid orders voided; ${paidOrders} paid orders need refunds.`);
});

export const saveTicketType = guardedAction({ permission: "tickets.manage", schema: ticketTypeSchema }, async (input, actor) => {
  const { ticketTypeId, eventId, memberPriceRupees, publicPriceRupees, ...rest } = input;
  const data = {
    ...rest,
    description: rest.description ?? null,
    memberPricePaise: rupeesToPaise(memberPriceRupees),
    publicPricePaise: rupeesToPaise(publicPriceRupees),
  };
  const event = await db.event.findUnique({ where: { id: eventId }, select: { title: true, status: true } });
  if (!event || event.status === "CANCELLED") return fail("Event not found or cancelled.");

  const res = await db.$transaction(async (tx) => {
    if (ticketTypeId) {
      const before = await tx.ticketType.findUniqueOrThrow({
        where: { id: ticketTypeId },
        select: {
          name: true,
          description: true,
          memberPricePaise: true,
          publicPricePaise: true,
          quantity: true,
          allocated: true,
          maxPerOrder: true,
          membersOnly: true,
          isActive: true,
        },
      });
      if (data.quantity < before.allocated) return `Quantity can't go below the ${before.allocated} already sold or held.`;
      const { allocated: _a, ...fields } = before;
      const changes = diff(fields, data);
      if (!changes.changed) return null;
      await tx.ticketType.update({ where: { id: ticketTypeId }, data });
      await audit(tx, {
        actor,
        action: "ticket_type.update",
        entityType: "Event",
        entityId: eventId,
        summary: `Updated "${data.name}" tickets for ${event.title}`,
        before: changes.before,
        after: changes.after,
      });
    } else {
      const sortOrder = await tx.ticketType.count({ where: { eventId } });
      await tx.ticketType.create({ data: { ...data, eventId, sortOrder } });
      await audit(tx, {
        actor,
        action: "ticket_type.create",
        entityType: "Event",
        entityId: eventId,
        summary: `Added "${data.name}" tickets (${data.quantity} at ${formatINR(data.memberPricePaise)} member / ${formatINR(data.publicPricePaise)} public) to ${event.title}`,
        after: data,
      });
    }
    return null;
  });
  if (res) return fail(res, { quantity: ["Too low"] });
  refresh(eventId);
  return ok(undefined, ticketTypeId ? "Ticket type saved" : "Ticket type added");
});

// ─── Buying tickets ──────────────────────────────────────────────────────────

async function memberContext(userId: string, eventId: string) {
  const [terms, used] = await Promise.all([
    db.membership.findMany({ where: { userId }, select: { status: true, startDate: true, endDate: true } }),
    db.ticket.count({ where: { eventId, isMemberPrice: true, status: { in: ["RESERVED", "VALID"] }, order: { buyerId: userId } } }),
  ]);
  const state = standing(terms).state;
  return { isActiveMember: state === "ACTIVE" || state === "EXPIRING", memberTicketAlreadyUsed: used > 0 };
}

/** Shared by online purchase and door sale: price, reserve seats, create order + tickets. */
async function createOrder(opts: {
  eventId: string;
  lines: { ticketTypeId: string; quantity: number }[];
  buyer: { id: string | null; name: string; email?: string | null; phone?: string | null };
  channel: "ONLINE" | "DOOR";
  reference?: string | null;
  actor: CurrentUser;
}): Promise<ActionResult<{ orderId: string; orderNumber: string; totalPaise: number; status: string }>> {
  const event = await db.event.findUnique({
    where: { id: opts.eventId },
    include: { ticketTypes: { where: { isActive: true } } },
  });
  if (!event) return fail("Event not found.");
  const sales = salesState(event);
  // Door sales continue during the event; online sales follow the sales window.
  if (opts.channel === "ONLINE" && sales !== "OPEN") return fail(sales === "SOLD_OUT" ? "Sold out." : "Tickets aren't on sale right now.");
  if (opts.channel === "DOOR" && (event.status !== "PUBLISHED" || eventPhase(event) === "ENDED"))
    return fail("This event isn't taking door sales.");

  const types = new Map(event.ticketTypes.map((t) => [t.id, t]));
  for (const l of opts.lines) {
    const t = types.get(l.ticketTypeId);
    if (!t) return fail("One of those ticket types isn't available.");
    if (l.quantity > t.maxPerOrder) return fail(`At most ${t.maxPerOrder} "${t.name}" tickets per order.`);
  }

  const ctx = opts.buyer.id ? await memberContext(opts.buyer.id, event.id) : { isActiveMember: false, memberTicketAlreadyUsed: false };
  const priced = priceOrder(
    opts.lines.map((l) => ({ type: types.get(l.ticketTypeId)!, quantity: l.quantity })),
    ctx,
  );
  if (!priced.ok) return fail(priced.error);

  try {
    const order = await db.$transaction(async (tx) => {
      for (const l of opts.lines) await allocateSeats(tx, event.id, l.ticketTypeId, l.quantity);
      const free = priced.totalPaise === 0;
      const order = await tx.ticketOrder.create({
        data: {
          orderNumber: await nextOrderNumber(tx),
          eventId: event.id,
          buyerId: opts.buyer.id,
          buyerName: opts.buyer.name,
          buyerEmail: opts.buyer.email ?? null,
          buyerPhone: opts.buyer.phone ?? null,
          channel: opts.channel,
          totalPaise: priced.totalPaise,
          claimedReference: opts.channel === "ONLINE" ? (opts.reference ?? null) : null,
          holdUntil: opts.channel === "ONLINE" && !free ? holdUntil() : null,
        },
      });
      await tx.ticket.createMany({
        data: priced.tickets.map((t, i) => ({
          code: newTicketCode(),
          orderId: order.id,
          eventId: event.id,
          ticketTypeId: t.typeId,
          holderName: i === 0 ? opts.buyer.name : `Guest of ${opts.buyer.name}`,
          pricePaise: t.pricePaise,
          isMemberPrice: t.isMemberPrice,
        })),
      });
      const settled =
        opts.channel === "DOOR" || free
          ? await settleOrder(tx, { orderId: order.id, method: opts.channel === "DOOR" ? "CASH" : "ONLINE", receivedById: opts.actor.id })
          : null;
      return { order, settled };
    });
    return ok({
      orderId: order.order.id,
      orderNumber: order.order.orderNumber,
      totalPaise: priced.totalPaise,
      status: order.settled ? "PAID" : "PENDING_PAYMENT",
    });
  } catch (e) {
    if (e instanceof SoldOutError) return fail(e.message);
    throw e;
  }
}

export const buyTickets = guardedAction({ schema: buyTicketsSchema }, async ({ eventId, lines, reference }, actor) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true, email: true, phone: true } });
  const res = await createOrder({ eventId, lines, buyer: { id: actor.id, ...user }, channel: "ONLINE", reference, actor });
  if (!res.ok) return res;
  await db.$transaction((tx) =>
    audit(tx, {
      actor,
      action: "ticket.order",
      entityType: "Event",
      entityId: eventId,
      summary: `${actor.name} ordered ${lines.reduce((s, l) => s + l.quantity, 0)} ticket(s), ${formatINR(res.data.totalPaise)} (${res.data.orderNumber})${reference ? ` — reference ${reference}` : ""}`,
    }),
  );
  revalidatePath("/me/tickets");
  refresh(eventId);
  return ok(res.data, res.data.status === "PAID" ? "You're in! Tickets are in My tickets." : "Order placed — pay to confirm your seats");
});

export const doorSale = guardedAction({ permission: "tickets.sell", schema: doorSaleSchema }, async (input, actor) => {
  let buyer: { id: string | null; name: string; email?: string | null; phone?: string | null };
  if (input.memberId) {
    const m = await db.user.findUnique({ where: { id: input.memberId }, select: { id: true, name: true, email: true, phone: true } });
    if (!m) return fail("Member not found.");
    buyer = m;
  } else {
    buyer = { id: null, name: input.buyerName!, phone: input.buyerPhone ?? null };
  }
  const res = await createOrder({ eventId: input.eventId, lines: input.lines, buyer, channel: "DOOR", actor });
  if (!res.ok) return res;

  // Record the real payment method on the receipt (createOrder settles door sales as cash by default).
  await db.$transaction(async (tx) => {
    if (res.data.totalPaise > 0) {
      await tx.payment.update({
        where: { ticketOrderId: res.data.orderId },
        data: { method: input.method, reference: input.reference ?? null },
      });
    }
    await audit(tx, {
      actor,
      action: "ticket.door_sale",
      entityType: "Event",
      entityId: input.eventId,
      summary: `Door sale to ${buyer.name}: ${input.lines.reduce((s, l) => s + l.quantity, 0)} ticket(s), ${formatINR(res.data.totalPaise)} by ${PAYMENT_METHOD_LABEL[input.method]} (${res.data.orderNumber})`,
    });
  });
  refresh(input.eventId);
  return ok(res.data, `Sold — ${res.data.orderNumber}, ${formatINR(res.data.totalPaise)}`);
});

export const confirmOrder = guardedAction(
  { permission: ["tickets.sell", "finance.record_income"], schema: confirmOrderSchema },
  async (input, actor) => {
    const order = await db.ticketOrder.findUnique({
      where: { id: input.orderId },
      select: {
        status: true,
        eventId: true,
        buyerId: true,
        buyerName: true,
        totalPaise: true,
        orderNumber: true,
        event: { select: { title: true } },
      },
    });
    if (!order) return fail("Order not found.");
    if (order.status !== "PENDING_PAYMENT") return fail("This order isn't awaiting payment.");
    const res = await db.$transaction(async (tx) => {
      const s = await settleOrder(tx, { orderId: input.orderId, method: input.method, reference: input.reference, receivedById: actor.id });
      await audit(tx, {
        actor,
        action: "ticket.order.confirm",
        entityType: "Event",
        entityId: order.eventId,
        summary: `Confirmed ${formatINR(order.totalPaise)} from ${order.buyerName} for ${order.orderNumber} (${PAYMENT_METHOD_LABEL[input.method]}, receipt ${s.payment?.receiptNumber ?? "—"})`,
      });
      if (order.buyerId) {
        await tx.notification.create({
          data: {
            userId: order.buyerId,
            type: "ticket.confirmed",
            title: "Tickets confirmed",
            body: `Your tickets for ${order.event.title} are confirmed. Show the QR at the door.`,
            link: "/me/tickets",
          },
        });
      }
      return s;
    });
    refresh(order.eventId);
    return ok(undefined, `Confirmed — receipt ${res.payment?.receiptNumber ?? "(free)"}`);
  },
);

export const voidTicketOrder = guardedAction(
  { permission: ["tickets.sell", "tickets.refund"], schema: voidOrderSchema },
  async ({ orderId, reason }, actor) => {
    const order = await db.ticketOrder.findUnique({
      where: { id: orderId },
      select: { status: true, eventId: true, buyerName: true, totalPaise: true, orderNumber: true, buyerId: true },
    });
    if (!order) return fail("Order not found.");
    const to = order.status === "PAID" ? "REFUNDED" : "CANCELLED";
    if (order.status !== "PAID" && order.status !== "PENDING_PAYMENT") return fail("This order is already closed.");
    if (to === "REFUNDED" && !actor.permissions.has("tickets.refund")) return fail("Refunds need the Refund permission.");

    const { released } = await db.$transaction(async (tx) => {
      const r = await voidOrder(tx, orderId, to);
      await audit(tx, {
        actor,
        action: to === "REFUNDED" ? "ticket.refund" : "ticket.order.cancel",
        entityType: "Event",
        entityId: order.eventId,
        summary: `${to === "REFUNDED" ? `Refunded ${formatINR(order.totalPaise)} to` : "Cancelled unpaid order for"} ${order.buyerName} (${order.orderNumber}) — ${reason}`,
        before: { status: order.status },
        after: { status: to, reason },
      });
      return r;
    });
    refresh(order.eventId);
    return ok(undefined, `${to === "REFUNDED" ? "Refunded" : "Cancelled"} — ${released} seat(s) released`);
  },
);

export const cancelMyOrder = guardedAction({ schema: voidOrderSchema.pick({ orderId: true }) }, async ({ orderId }, actor) => {
  const order = await db.ticketOrder.findUnique({
    where: { id: orderId },
    select: { buyerId: true, status: true, eventId: true, orderNumber: true },
  });
  if (!order || order.buyerId !== actor.id) return fail("Order not found.");
  if (order.status !== "PENDING_PAYMENT") return fail("Only unpaid orders can be cancelled here. Ask the treasurer about refunds.");
  await db.$transaction(async (tx) => {
    await voidOrder(tx, orderId, "CANCELLED");
    await audit(tx, {
      actor,
      action: "ticket.order.cancel",
      entityType: "Event",
      entityId: order.eventId,
      summary: `${actor.name} cancelled their unpaid order ${order.orderNumber}`,
    });
  });
  revalidatePath("/me/tickets");
  refresh(order.eventId);
  return ok(undefined, "Order cancelled");
});

// ─── Door: check-in & incidents ──────────────────────────────────────────────

export type CheckInResult =
  | { result: "ADMITTED"; holderName: string; ticketType: string; isMemberPrice: boolean; eventTitle: string }
  | { result: "ALREADY_IN"; holderName: string; ticketType: string; at: string; by: string | null; eventTitle: string }
  | { result: "REJECTED"; reason: string; holderName?: string; eventTitle?: string };

export const checkInTicket = guardedAction({ permission: "tickets.checkin", schema: checkInSchema }, async ({ code }, actor) => {
  const t = await db.ticket.findUnique({
    where: { code },
    select: {
      id: true,
      status: true,
      holderName: true,
      isMemberPrice: true,
      checkedInAt: true,
      eventId: true,
      ticketType: { select: { name: true } },
      checkedInBy: { select: { name: true } },
      event: { select: { title: true, status: true, startsAt: true, endsAt: true } },
    },
  });
  if (!t) return ok<CheckInResult>({ result: "REJECTED", reason: "Unknown ticket — not issued by us." });
  const base = { holderName: t.holderName, eventTitle: t.event.title };
  if (t.status === "RESERVED") return ok<CheckInResult>({ result: "REJECTED", reason: "Unpaid — send them to the desk to pay.", ...base });
  if (t.status !== "VALID") return ok<CheckInResult>({ result: "REJECTED", reason: `Ticket was ${t.status.toLowerCase()}.`, ...base });
  if (!canCheckIn(t.event))
    return ok<CheckInResult>({ result: "REJECTED", reason: "Check-in isn't open for this event right now.", ...base });
  if (t.checkedInAt) {
    return ok<CheckInResult>({
      result: "ALREADY_IN",
      ticketType: t.ticketType.name,
      at: t.checkedInAt.toISOString(),
      by: t.checkedInBy?.name ?? null,
      ...base,
    });
  }

  // Conditional update: if two volunteers scan the same ticket at once, only one admits it.
  const updated = await db.ticket.updateMany({
    where: { id: t.id, checkedInAt: null },
    data: { checkedInAt: new Date(), checkedInById: actor.id },
  });
  if (updated.count === 0)
    return ok<CheckInResult>({ result: "ALREADY_IN", ticketType: t.ticketType.name, at: new Date().toISOString(), by: null, ...base });
  return ok<CheckInResult>({ result: "ADMITTED", ticketType: t.ticketType.name, isMemberPrice: t.isMemberPrice, ...base });
});

export const reportIncident = guardedAction(
  { permission: ["events.edit", "tickets.checkin", "cctv.view"], schema: incidentSchema },
  async (input, actor) => {
    const e = await db.event.findUnique({ where: { id: input.eventId }, select: { title: true } });
    if (!e) return fail("Event not found.");
    await db.$transaction(async (tx) => {
      const i = await tx.eventIncident.create({
        data: { ...input, details: input.details ?? null, location: input.location ?? null, reportedById: actor.id },
      });
      await audit(tx, {
        actor,
        action: "incident.report",
        entityType: "Event",
        entityId: input.eventId,
        summary: `Reported ${input.severity.toLowerCase()} incident at ${e.title}: ${input.title}`,
        after: { incidentId: i.id },
      });
    });
    refresh(input.eventId);
    return ok(undefined, "Incident logged");
  },
);

export const resolveIncident = guardedAction(
  { permission: ["events.edit", "cctv.view"], schema: resolveIncidentSchema },
  async ({ incidentId, resolution }, actor) => {
    const i = await db.eventIncident.findUnique({ where: { id: incidentId }, select: { eventId: true, title: true, resolvedAt: true } });
    if (!i) return fail("Incident not found.");
    if (i.resolvedAt) return ok(undefined);
    await db.$transaction(async (tx) => {
      await tx.eventIncident.update({ where: { id: incidentId }, data: { resolvedAt: new Date(), resolution } });
      await audit(tx, {
        actor,
        action: "incident.resolve",
        entityType: "Event",
        entityId: i.eventId,
        summary: `Resolved incident "${i.title}" — ${resolution}`,
      });
    });
    refresh(i.eventId);
    return ok(undefined, "Marked resolved");
  },
);
