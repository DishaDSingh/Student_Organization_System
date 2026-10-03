"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { activateMembership, newPassToken } from "@/lib/membership/service";
import { runRenewalReminders } from "@/lib/membership/reminders";
import { formatINR, verificationResult, standing } from "@/lib/membership/rules";
import { canCollectDues } from "@/lib/membership/load";
import { fmtDate } from "@/lib/format";
import {
  cancelMembershipSchema,
  confirmPaymentSchema,
  memberProfileSchema,
  PAYMENT_METHOD_LABEL,
  registerMemberSchema,
  staffRenewSchema,
  userIdSchema,
  verifyLookupSchema,
} from "@/lib/validation/schemas";

const COLLECT = ["members.edit", "finance.record_income"] as const;

async function orgShortName() {
  return (await db.organization.findFirst({ select: { shortName: true } }))?.shortName ?? "MEM";
}

export const registerMember = guardedAction({ permission: "members.add", schema: registerMemberSchema }, async (input, actor) => {
  if (input.payNow && !canCollectDues(actor)) return fail("You can register members but not record payments.");

  const plan = await db.membershipPlan.findUnique({
    where: { id: input.planId },
    select: { id: true, name: true, pricePaise: true, isActive: true },
  });
  if (!plan?.isActive) return fail("That plan isn't available.", { planId: ["Pick an active plan"] });

  let tempPassword: string | null = null;
  const passwordHash = input.existingUserId ? null : await hashPassword((tempPassword = generateTempPassword()));
  const prefix = await orgShortName();

  const result = await db.$transaction(
    async (tx) => {
      let userId = input.existingUserId;
      if (userId) {
        const existing = await tx.user.findUnique({
          where: { id: userId },
          select: { status: true, memberships: { select: { status: true, startDate: true, endDate: true } } },
        });
        if (!existing) return { error: "That person no longer exists." };
        if (existing.memberships.some((m) => m.status === "PENDING_PAYMENT"))
          return { error: "They already have a membership awaiting payment." };
        const s = standing(existing.memberships);
        if (s.state === "ACTIVE") return { error: "They're already an active member. Use Renew on their profile." };
        await tx.user.update({ where: { id: userId }, data: { program: input.program, yearOfStudy: input.yearOfStudy } });
      } else {
        const member = await tx.role.findUnique({ where: { key: "general_member" }, select: { id: true } });
        const user = await tx.user.create({
          data: {
            name: input.name!,
            email: input.email!,
            phone: input.phone,
            studentId: input.studentId,
            program: input.program,
            yearOfStudy: input.yearOfStudy,
            passwordHash: passwordHash!,
            status: "INVITED",
            roles: member ? { create: { roleId: member.id, assignedById: actor.id } } : undefined,
          },
        });
        userId = user.id;
      }

      const membership = await tx.membership.create({ data: { userId, planId: plan.id, pricePaise: plan.pricePaise } });
      const activated = input.payNow
        ? await activateMembership(tx, {
            membershipId: membership.id,
            method: input.method!,
            reference: input.reference,
            receivedById: actor.id,
            orgShortName: prefix,
          })
        : null;

      const name = activated?.memberName ?? input.name ?? "member";
      await audit(tx, {
        actor,
        action: "member.register",
        entityType: "Member",
        entityId: userId,
        summary: activated
          ? `Registered ${name} (${activated.memberNumber}) on ${plan.name} — ${formatINR(plan.pricePaise)} received by ${PAYMENT_METHOD_LABEL[input.method!]}, receipt ${activated.payment.receiptNumber}`
          : `Registered ${name} on ${plan.name} — awaiting ${formatINR(plan.pricePaise)}`,
        after: { plan: plan.name, payNow: input.payNow, method: input.method ?? null, reference: input.reference ?? null },
      });
      return { userId, receipt: activated?.payment.receiptNumber ?? null };
    },
    { timeout: 20_000 },
  );
  if ("error" in result) return fail(result.error!);

  revalidatePath("/members");
  return ok({ userId: result.userId, tempPassword, receipt: result.receipt }, "Member registered");
});

export const confirmPayment = guardedAction({ permission: [...COLLECT], schema: confirmPaymentSchema }, async (input, actor) => {
  const m = await db.membership.findUnique({
    where: { id: input.membershipId },
    select: { status: true, userId: true, pricePaise: true, plan: { select: { name: true } } },
  });
  if (!m) return fail("Membership not found.");
  if (m.status !== "PENDING_PAYMENT") return fail("This membership isn't awaiting payment.");
  const prefix = await orgShortName();

  const res = await db.$transaction(async (tx) => {
    const a = await activateMembership(tx, {
      membershipId: input.membershipId,
      method: input.method,
      reference: input.reference,
      receivedById: actor.id,
      orgShortName: prefix,
      notes: input.notes,
    });
    await audit(tx, {
      actor,
      action: "member.payment.confirm",
      entityType: "Member",
      entityId: m.userId,
      summary: `Confirmed ${formatINR(m.pricePaise)} ${a.planName} dues from ${a.memberName} (${PAYMENT_METHOD_LABEL[input.method]}, receipt ${a.payment.receiptNumber}) — valid ${fmtDate(a.membership.startDate)} to ${fmtDate(a.membership.endDate)}`,
      after: { receipt: a.payment.receiptNumber, method: input.method, reference: input.reference ?? null, endDate: a.membership.endDate },
    });
    await tx.notification.create({
      data: {
        userId: m.userId,
        type: "membership.activated",
        title: "Membership confirmed",
        body: `We received your ${formatINR(m.pricePaise)} dues. Your ${a.planName} membership is valid until ${fmtDate(a.membership.endDate)}.`,
        link: "/me/pass",
      },
    });
    return a;
  });

  revalidatePath(`/members/${m.userId}`);
  revalidatePath("/members");
  return ok({ receipt: res.payment.receiptNumber }, `Payment confirmed — receipt ${res.payment.receiptNumber}`);
});

export const renewMember = guardedAction({ permission: [...COLLECT], schema: staffRenewSchema }, async (input, actor) => {
  const plan = await db.membershipPlan.findUnique({ where: { id: input.planId }, select: { id: true, isActive: true, pricePaise: true } });
  if (!plan?.isActive) return fail("That plan isn't available.");
  if (await db.membership.count({ where: { userId: input.userId, status: "PENDING_PAYMENT" } })) {
    return fail("There's already a renewal awaiting payment — confirm or cancel it instead.");
  }
  const prefix = await orgShortName();

  const res = await db.$transaction(async (tx) => {
    const pending = await tx.membership.create({ data: { userId: input.userId, planId: plan.id, pricePaise: plan.pricePaise } });
    const a = await activateMembership(tx, {
      membershipId: pending.id,
      method: input.method,
      reference: input.reference,
      receivedById: actor.id,
      orgShortName: prefix,
    });
    await audit(tx, {
      actor,
      action: "member.renew",
      entityType: "Member",
      entityId: input.userId,
      summary: `Renewed ${a.memberName} on ${a.planName} — ${formatINR(plan.pricePaise)} by ${PAYMENT_METHOD_LABEL[input.method]}, receipt ${a.payment.receiptNumber}, valid until ${fmtDate(a.membership.endDate)}`,
      after: { receipt: a.payment.receiptNumber, startDate: a.membership.startDate, endDate: a.membership.endDate },
    });
    return a;
  });

  revalidatePath(`/members/${input.userId}`);
  return ok({ receipt: res.payment.receiptNumber }, `Renewed until ${fmtDate(res.membership.endDate)}`);
});

export const cancelMembership = guardedAction(
  { permission: "members.edit", schema: cancelMembershipSchema },
  async ({ membershipId, reason }, actor) => {
    const m = await db.membership.findUnique({
      where: { id: membershipId },
      select: { status: true, userId: true, endDate: true, plan: { select: { name: true } }, user: { select: { name: true } } },
    });
    if (!m) return fail("Membership not found.");
    if (m.status === "CANCELLED") return ok(undefined);

    await db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: membershipId }, data: { status: "CANCELLED", cancelledReason: reason } });
      await audit(tx, {
        actor,
        action: "member.cancel",
        entityType: "Member",
        entityId: m.userId,
        summary: `Cancelled ${m.user.name}'s ${m.status === "PENDING_PAYMENT" ? "pending" : "active"} ${m.plan.name} membership — ${reason}`,
        before: { status: m.status },
        after: { status: "CANCELLED", reason },
      });
    });
    revalidatePath(`/members/${m.userId}`);
    return ok(undefined, "Membership cancelled");
  },
);

export const updateMemberProfile = guardedAction(
  { permission: "members.edit", schema: memberProfileSchema },
  async ({ userId, ...data }, actor) => {
    const before = await db.user.findUnique({ where: { id: userId }, select: { name: true, program: true, yearOfStudy: true } });
    if (!before) return fail("Member not found.");
    const next = { program: data.program ?? null, yearOfStudy: data.yearOfStudy ?? null };
    if (before.program === next.program && before.yearOfStudy === next.yearOfStudy) return ok(undefined, "No changes to save");

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: next });
      await audit(tx, {
        actor,
        action: "member.update",
        entityType: "Member",
        entityId: userId,
        summary: `Updated ${before.name}'s programme details`,
        before: { program: before.program, yearOfStudy: before.yearOfStudy },
        after: next,
      });
    });
    revalidatePath(`/members/${userId}`);
    return ok(undefined, "Saved");
  },
);

export const rotatePass = guardedAction({ schema: userIdSchema }, async ({ userId }, actor) => {
  // Members may rotate their own pass; staff need members.edit.
  if (userId !== actor.id && !actor.permissions.has("members.edit")) return fail("You don't have permission to do that.");
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true, passToken: true } });
  if (!u?.passToken) return fail("This person doesn't have a pass yet.");

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passToken: newPassToken() } });
    await audit(tx, {
      actor,
      action: "member.pass.rotate",
      entityType: "Member",
      entityId: userId,
      summary: `Issued a new pass QR for ${u.name} (old QR codes and screenshots stop working)`,
    });
  });
  revalidatePath("/me/pass");
  revalidatePath(`/members/${userId}`);
  return ok(undefined, "New pass issued — old QR codes no longer work");
});

export const sendRemindersNow = guardedAction({ permission: "members.edit", schema: z.object({}) }, async (_input, actor) => {
  const sent = await runRenewalReminders(db);
  await db.$transaction((tx) =>
    audit(tx, {
      actor,
      action: "member.reminders.run",
      entityType: "Member",
      summary: `Ran renewal reminders manually — ${sent} new reminder(s) sent`,
    }),
  );
  return ok({ sent }, sent ? `Sent ${sent} reminder${sent === 1 ? "" : "s"}` : "Everyone due has already been reminded");
});

/** Door lookup by member no., roll no., email or name. Records the check. */
export const lookupMembers = guardedAction({ permission: "members.verify", schema: verifyLookupSchema }, async ({ query }) => {
  const q = query.trim();
  const users = await db.user.findMany({
    where: {
      OR: [
        { memberNumber: { equals: q, mode: "insensitive" } },
        { studentId: { equals: q, mode: "insensitive" } },
        { email: { equals: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 8,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      memberNumber: true,
      studentId: true,
      memberships: { select: { status: true, startDate: true, endDate: true } },
    },
  });
  return ok(
    users.map((u) => {
      const s = standing(u.memberships);
      return {
        id: u.id,
        name: u.name,
        memberNumber: u.memberNumber,
        studentId: u.studentId,
        state: s.state,
        validUntil: s.validUntil?.toISOString() ?? null,
      };
    }),
  );
});

export const recordManualVerification = guardedAction({ permission: "members.verify", schema: userIdSchema }, async ({ userId }, actor) => {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { memberships: { select: { status: true, startDate: true, endDate: true } } },
  });
  if (!u) return fail("Member not found.");
  const result = verificationResult(standing(u.memberships).state);
  await db.passVerification.create({ data: { memberId: userId, verifiedById: actor.id, result, method: "manual" } });
  return ok({ result });
});
