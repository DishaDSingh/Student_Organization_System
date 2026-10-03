"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guardedAction, ok } from "@/lib/action";
import { formatINR } from "@/lib/membership/rules";
import { budgetSchema } from "@/lib/validation/schemas";

export const setBudget = guardedAction(
  { permission: "finance.manage_budget", schema: budgetSchema },
  async ({ category, monthlyRupees }, actor) => {
    const monthlyPaise = monthlyRupees * 100;
    await db.$transaction(async (tx) => {
      const before = await tx.budget.findUnique({ where: { category } });
      if (monthlyPaise === 0) {
        if (before) await tx.budget.delete({ where: { category } });
      } else {
        await tx.budget.upsert({
          where: { category },
          create: { category, monthlyPaise, updatedById: actor.id },
          update: { monthlyPaise, updatedById: actor.id },
        });
      }
      await audit(tx, {
        actor,
        action: "budget.set",
        entityType: "Budget",
        entityId: category,
        summary:
          monthlyPaise === 0
            ? `Removed the ${category} budget`
            : `Set ${category} budget to ${formatINR(monthlyPaise)}/month${before ? ` (was ${formatINR(before.monthlyPaise)})` : ""}`,
      });
    });
    revalidatePath("/analytics");
    return ok(undefined, monthlyPaise === 0 ? "Budget removed" : "Budget saved");
  },
);
