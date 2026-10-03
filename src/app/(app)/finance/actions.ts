"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { formatINR, rupeesToPaise } from "@/lib/membership/rules";
import { canReview } from "@/lib/finance/rules";
import { scanReceipt as readReceipt } from "@/lib/finance/scan";
import { id } from "@/lib/validation/common";
import { expenseSchema, reviewExpenseSchema, scanReceiptSchema } from "@/lib/validation/schemas";
import { z } from "zod";

function refresh() {
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

/** The receipt must be one the submitter uploaded themselves. */
async function ownReceipt(uploadId: string, userId: string) {
  const u = await db.upload.findUnique({ where: { id: uploadId }, select: { purpose: true, uploadedById: true } });
  return !!u && u.purpose === "receipt" && u.uploadedById === userId;
}

export const scanReceipt = guardedAction(
  { permission: "finance.create_expense", schema: scanReceiptSchema },
  async ({ uploadId }, actor) => {
    if (!(await ownReceipt(uploadId, actor.id))) return fail("Upload the receipt again.");
    const result = await readReceipt(uploadId);
    if (result.source === "ai") {
      await db.$transaction((tx) =>
        audit(tx, {
          actor,
          action: "receipt.scan",
          entityType: "Upload",
          entityId: uploadId,
          summary: `Scanned a receipt${result.vendor ? ` from ${result.vendor}` : ""}${result.totalRupees ? ` (${formatINR(rupeesToPaise(result.totalRupees))})` : ""}`,
        }),
      );
    }
    return ok(result);
  },
);

export const submitExpense = guardedAction({ permission: "finance.create_expense", schema: expenseSchema }, async (input, actor) => {
  if (input.receiptUploadId && !(await ownReceipt(input.receiptUploadId, actor.id))) return fail("Upload the receipt again.");
  if (input.eventId && !(await db.event.count({ where: { id: input.eventId } }))) return fail("That event no longer exists.");
  if (input.fundraiserId && !(await db.fundraiser.count({ where: { id: input.fundraiserId } })))
    return fail("That fundraiser no longer exists.");

  const amountPaise = rupeesToPaise(input.amountRupees);
  const e = await db.$transaction(async (tx) => {
    const e = await tx.expense.create({
      data: {
        description: input.description,
        category: input.category,
        vendor: input.vendor ?? null,
        amountPaise,
        taxPaise: rupeesToPaise(input.taxRupees),
        spentAt: input.spentAt,
        needsReimbursement: input.needsReimbursement,
        eventId: input.eventId ?? null,
        fundraiserId: input.fundraiserId ?? null,
        receiptUploadId: input.receiptUploadId ?? null,
        source: input.source,
        submittedById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "expense.submit",
      entityType: "Expense",
      entityId: e.id,
      summary: `Submitted ${formatINR(amountPaise)} expense "${e.description}"${input.needsReimbursement ? " (to be paid back)" : ""}`,
    });
    return e;
  });
  refresh();
  return ok({ id: e.id }, "Expense sent to the treasurer");
});

export const reviewExpense = guardedAction(
  { permission: "finance.approve_expense", schema: reviewExpenseSchema },
  async ({ expenseId, decision, amountRupees, category, note }, actor) => {
    const e = await db.expense.findUnique({ where: { id: expenseId } });
    if (!e) return fail("Expense not found.");
    if (e.submittedById === actor.id) return fail("Someone else has to approve your own expense.");
    if (!canReview(e, actor.id)) return fail("This expense was already reviewed.");

    const approve = decision === "APPROVE";
    const amountPaise = approve && amountRupees ? rupeesToPaise(amountRupees) : e.amountPaise;
    const changed = [
      amountPaise !== e.amountPaise && `amount ${formatINR(e.amountPaise)} → ${formatINR(amountPaise)}`,
      approve && category && category !== e.category && `category → ${category}`,
    ].filter(Boolean);

    const done = await db.$transaction(async (tx) => {
      // Only flips a still-pending row, so two treasurers can't both decide.
      const { count } = await tx.expense.updateMany({
        where: { id: expenseId, status: "PENDING" },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          amountPaise,
          category: approve && category ? category : e.category,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        },
      });
      if (!count) return false;
      if (e.submittedById) {
        await tx.notification.create({
          data: {
            userId: e.submittedById,
            type: approve ? "expense.approved" : "expense.rejected",
            title: approve ? `Expense approved: ${e.description}` : `Expense rejected: ${e.description}`,
            body: approve
              ? `${formatINR(amountPaise)} approved${e.needsReimbursement ? " — you'll be paid back soon" : ""}.`
              : (note ?? "See the treasurer for details."),
            link: "/finance",
          },
        });
      }
      await audit(tx, {
        actor,
        action: approve ? "expense.approve" : "expense.reject",
        entityType: "Expense",
        entityId: expenseId,
        summary: `${approve ? "Approved" : "Rejected"} ${formatINR(amountPaise)} expense "${e.description}"${changed.length ? ` (${changed.join(", ")})` : ""}${note ? ` — ${note}` : ""}`,
      });
      return true;
    });
    if (!done) return fail("This expense was already reviewed.");
    refresh();
    return ok(undefined, approve ? "Expense approved" : "Expense rejected");
  },
);

export const markReimbursed = guardedAction(
  { permission: "finance.approve_expense", schema: z.object({ expenseId: id }) },
  async ({ expenseId }, actor) => {
    const e = await db.expense.findUnique({ where: { id: expenseId }, include: { submittedBy: { select: { name: true } } } });
    if (!e) return fail("Expense not found.");
    const done = await db.$transaction(async (tx) => {
      const { count } = await tx.expense.updateMany({
        where: { id: expenseId, status: "APPROVED", needsReimbursement: true },
        data: { status: "REIMBURSED", reimbursedAt: new Date() },
      });
      if (!count) return false;
      if (e.submittedById) {
        await tx.notification.create({
          data: {
            userId: e.submittedById,
            type: "expense.reimbursed",
            title: `Paid back: ${formatINR(e.amountPaise)}`,
            body: `For "${e.description}".`,
            link: "/finance",
          },
        });
      }
      await audit(tx, {
        actor,
        action: "expense.reimburse",
        entityType: "Expense",
        entityId: expenseId,
        summary: `Paid back ${formatINR(e.amountPaise)} to ${e.submittedBy?.name ?? "submitter"} for "${e.description}"`,
      });
      return true;
    });
    if (!done) return fail("Only approved claims can be marked paid back.");
    refresh();
    return ok(undefined, "Marked as paid back");
  },
);
