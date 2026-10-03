"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { formatINR, standing } from "@/lib/membership/rules";
import { selfRenewSchema } from "@/lib/validation/schemas";
import { id } from "@/lib/validation/common";

/** A member asks to join/renew. Staff confirm the payment before it activates. */
export const requestMembership = guardedAction({ schema: selfRenewSchema }, async ({ planId, reference }, actor) => {
  const plan = await db.membershipPlan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, isActive: true, pricePaise: true },
  });
  if (!plan?.isActive) return fail("That plan isn't available.");
  const terms = await db.membership.findMany({ where: { userId: actor.id }, select: { status: true, startDate: true, endDate: true } });
  if (terms.some((t) => t.status === "PENDING_PAYMENT")) return fail("You already have a request waiting for payment confirmation.");
  if (standing(terms).upcoming) return fail("You've already renewed for the next term.");

  await db.$transaction(async (tx) => {
    const m = await tx.membership.create({
      data: { userId: actor.id, planId: plan.id, pricePaise: plan.pricePaise, claimedReference: reference ?? null },
    });
    await audit(tx, {
      actor,
      action: "member.request",
      entityType: "Member",
      entityId: actor.id,
      summary: `${actor.name} requested ${plan.name} membership (${formatINR(plan.pricePaise)})${reference ? ` with payment reference ${reference}` : ""}`,
      after: { membershipId: m.id, plan: plan.name, reference: reference ?? null },
    });
  });
  revalidatePath("/me");
  return ok(undefined, reference ? "Request sent — we'll confirm once the payment is checked" : "Request created — pay to activate");
});

/** Add or correct the UPI/bank reference on your own pending request. */
export const submitReference = guardedAction(
  { schema: z.object({ membershipId: id }).and(selfRenewSchema.pick({ reference: true })) },
  async ({ membershipId, reference }, actor) => {
    if (!reference) return fail("Enter the transaction reference.", { reference: ["Required"] });
    const m = await db.membership.findUnique({ where: { id: membershipId }, select: { userId: true, status: true } });
    if (!m || m.userId !== actor.id || m.status !== "PENDING_PAYMENT") return fail("Request not found.");
    await db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: membershipId }, data: { claimedReference: reference } });
      await audit(tx, {
        actor,
        action: "member.reference.submit",
        entityType: "Member",
        entityId: actor.id,
        summary: `${actor.name} submitted payment reference ${reference}`,
        after: { reference },
      });
    });
    revalidatePath("/me");
    return ok(undefined, "Reference saved — the treasurer will confirm it");
  },
);

export const withdrawRequest = guardedAction({ schema: z.object({ membershipId: id }) }, async ({ membershipId }, actor) => {
  const m = await db.membership.findUnique({ where: { id: membershipId }, select: { userId: true, status: true } });
  if (!m || m.userId !== actor.id || m.status !== "PENDING_PAYMENT") return fail("Request not found.");
  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membershipId }, data: { status: "CANCELLED", cancelledReason: "Withdrawn by member" } });
    await audit(tx, {
      actor,
      action: "member.request.withdraw",
      entityType: "Member",
      entityId: actor.id,
      summary: `${actor.name} withdrew their membership request`,
    });
  });
  revalidatePath("/me");
  return ok(undefined, "Request withdrawn");
});
