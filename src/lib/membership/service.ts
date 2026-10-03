import { randomBytes } from "node:crypto";
import type { Prisma, PaymentMethod } from "@/generated/prisma/client";
import { nextTermStart, termDates, type Term } from "./rules";

type Tx = Prisma.TransactionClient;

/** Unguessable token for the pass QR code (144 bits). */
export const newPassToken = () => randomBytes(18).toString("base64url");

/**
 * Next number in a prefixed series, e.g. HSA-00042 or RCP-2026-00117.
 * Callers run inside a transaction; the unique index is the final guard.
 */
async function nextInSeries(prefix: string, latest: () => Promise<string | null | undefined>, width = 5) {
  const last = await latest();
  const n = last ? Number.parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(width, "0")}`;
}

export async function nextMemberNumber(tx: Tx, orgPrefix: string) {
  const prefix = `${orgPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "")}-`;
  return nextInSeries(prefix, async () => {
    const row = await tx.user.findFirst({
      where: { memberNumber: { startsWith: prefix } },
      orderBy: { memberNumber: "desc" },
      select: { memberNumber: true },
    });
    return row?.memberNumber;
  });
}

export async function nextReceiptNumber(tx: Tx, at = new Date()) {
  const prefix = `RCP-${at.getFullYear()}-`;
  return nextInSeries(prefix, async () => {
    const row = await tx.payment.findFirst({
      where: { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: "desc" },
      select: { receiptNumber: true },
    });
    return row?.receiptNumber;
  });
}

/**
 * Confirm dues for a membership term: record the payment, activate the term
 * (stacked after any existing paid term), and give first-time members a
 * member number and pass token.
 */
export async function activateMembership(
  tx: Tx,
  opts: {
    membershipId: string;
    method: PaymentMethod;
    reference?: string | null;
    receivedById: string | null;
    orgShortName: string;
    paidAt?: Date;
    notes?: string | null;
  },
) {
  const m = await tx.membership.findUniqueOrThrow({
    where: { id: opts.membershipId },
    include: {
      plan: { select: { durationMonths: true, name: true } },
      user: {
        select: {
          id: true,
          name: true,
          memberNumber: true,
          passToken: true,
          memberships: { select: { id: true, status: true, startDate: true, endDate: true } },
        },
      },
    },
  });
  if (m.status !== "PENDING_PAYMENT") throw new Error("Membership is not awaiting payment");

  const paidAt = opts.paidAt ?? new Date();
  const others = m.user.memberships.filter((t) => t.id !== m.id) as Term[];
  const { startDate, endDate } = termDates(nextTermStart(others, paidAt), m.plan.durationMonths);

  const payment = await tx.payment.create({
    data: {
      receiptNumber: await nextReceiptNumber(tx, paidAt),
      purpose: "MEMBERSHIP",
      payerId: m.userId,
      membershipId: m.id,
      amountPaise: m.pricePaise,
      method: opts.method,
      reference: opts.reference ?? m.claimedReference,
      receivedById: opts.receivedById,
      paidAt,
      notes: opts.notes,
    },
  });

  const membership = await tx.membership.update({
    where: { id: m.id },
    data: { status: "ACTIVE", startDate, endDate, isRenewal: others.some((t) => t.status === "ACTIVE") },
  });

  const memberNumber = m.user.memberNumber ?? (await nextMemberNumber(tx, opts.orgShortName));
  await tx.user.update({
    where: { id: m.userId },
    data: { memberNumber, passToken: m.user.passToken ?? newPassToken() },
  });

  return { membership, payment, memberNumber, planName: m.plan.name, memberName: m.user.name };
}
