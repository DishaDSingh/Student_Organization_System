"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { formatINR, rupeesToPaise } from "@/lib/membership/rules";
import { benefitSchema, planSchema } from "@/lib/validation/schemas";

export const savePlan = guardedAction({ permission: "members.manage_plans", schema: planSchema }, async (input, actor) => {
  const { planId, priceRupees, benefitIds, ...rest } = input;
  const data = { ...rest, description: rest.description ?? null, pricePaise: rupeesToPaise(priceRupees) };

  await db.$transaction(async (tx) => {
    if (planId) {
      const before = await tx.membershipPlan.findUniqueOrThrow({
        where: { id: planId },
        select: {
          code: true,
          name: true,
          description: true,
          durationMonths: true,
          pricePaise: true,
          isActive: true,
          benefits: { select: { benefitId: true } },
        },
      });
      const { benefits, ...beforeFields } = before;
      const changes = diff(
        { ...beforeFields, benefitIds: benefits.map((b) => b.benefitId).sort() },
        { ...data, benefitIds: [...benefitIds].sort() },
      );
      if (!changes.changed) return;
      await tx.membershipPlan.update({ where: { id: planId }, data });
      await tx.planBenefit.deleteMany({ where: { planId } });
      await tx.planBenefit.createMany({ data: benefitIds.map((benefitId) => ({ planId, benefitId })) });
      const priceNote =
        before.pricePaise !== data.pricePaise
          ? ` (price ${formatINR(before.pricePaise)} → ${formatINR(data.pricePaise)}; existing members keep what they paid)`
          : "";
      await audit(tx, {
        actor,
        action: "plan.update",
        entityType: "MembershipPlan",
        entityId: planId,
        summary: `Updated plan ${data.name}${priceNote}`,
        before: changes.before,
        after: changes.after,
      });
    } else {
      const sortOrder = await tx.membershipPlan.count();
      const p = await tx.membershipPlan.create({
        data: { ...data, sortOrder, benefits: { create: benefitIds.map((benefitId) => ({ benefitId })) } },
      });
      await audit(tx, {
        actor,
        action: "plan.create",
        entityType: "MembershipPlan",
        entityId: p.id,
        summary: `Created plan ${p.name} — ${formatINR(p.pricePaise)} for ${p.durationMonths} months`,
        after: { ...data, benefitIds },
      });
    }
  });
  revalidatePath("/members/plans");
  return ok(undefined, planId ? "Plan saved" : "Plan created");
});

export const saveBenefit = guardedAction({ permission: "members.manage_plans", schema: benefitSchema }, async (input, actor) => {
  const { benefitId, ...rest } = input;
  const data = { ...rest, description: rest.description ?? null };
  if (!benefitId && (await db.membershipBenefit.findUnique({ where: { title: data.title } }))) {
    return fail("A benefit with that title already exists.", { title: ["Already exists"] });
  }

  await db.$transaction(async (tx) => {
    if (benefitId) {
      const before = await tx.membershipBenefit.findUniqueOrThrow({
        where: { id: benefitId },
        select: { title: true, description: true, isActive: true },
      });
      const changes = diff(before, data);
      if (!changes.changed) return;
      await tx.membershipBenefit.update({ where: { id: benefitId }, data });
      await audit(tx, {
        actor,
        action: "benefit.update",
        entityType: "MembershipBenefit",
        entityId: benefitId,
        summary: `Updated benefit "${data.title}"`,
        before: changes.before,
        after: changes.after,
      });
    } else {
      const sortOrder = await tx.membershipBenefit.count();
      const b = await tx.membershipBenefit.create({ data: { ...data, sortOrder } });
      await audit(tx, {
        actor,
        action: "benefit.create",
        entityType: "MembershipBenefit",
        entityId: b.id,
        summary: `Created benefit "${b.title}"`,
        after: data,
      });
    }
  });
  revalidatePath("/members/plans");
  return ok(undefined, benefitId ? "Benefit saved" : "Benefit added");
});
