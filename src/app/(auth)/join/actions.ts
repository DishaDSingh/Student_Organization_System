"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/action";
import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { isLocked, recordFailure } from "@/lib/auth/rate-limit";
import { formatINR } from "@/lib/membership/rules";
import { joinSchema } from "@/lib/validation/schemas";

/**
 * Public self-registration. Creates the account and a membership request;
 * nothing activates until staff confirm the dues.
 */
export async function join(raw: unknown): Promise<ActionResult> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limitKey = `join|${ip}`;
  if (isLocked(limitKey)) return fail("Too many sign-ups from this network. Try again later.");

  const parsed = joinSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), [i.message]]));
    // Honeypot filled → a bot. Pretend to fail generically.
    if (fieldErrors.website) {
      recordFailure(limitKey);
      return fail("Something went wrong. Please try again.");
    }
    return fail("Please fix the highlighted fields.", fieldErrors);
  }
  const input = parsed.data;

  const org = await db.organization.findFirst({ select: { allowSelfRegistration: true } });
  if (!org?.allowSelfRegistration) return fail("Online sign-up is closed. Please register at the student council desk.");

  const [plan, existing] = await Promise.all([
    db.membershipPlan.findUnique({ where: { id: input.planId }, select: { id: true, name: true, isActive: true, pricePaise: true } }),
    db.user.findFirst({ where: { OR: [{ email: input.email }, { studentId: input.studentId }] }, select: { email: true } }),
  ]);
  if (!plan?.isActive) return fail("That plan isn't available.", { planId: ["Pick another plan"] });
  if (existing) {
    // Counts toward the rate limit so the form can't be used to probe which students have accounts.
    recordFailure(limitKey);
    return fail("An account already exists for this email or roll number. Sign in instead, or ask the council desk.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    const memberRole = await tx.role.findUnique({ where: { key: "general_member" }, select: { id: true } });
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        studentId: input.studentId,
        program: input.program,
        yearOfStudy: input.yearOfStudy,
        passwordHash,
        status: "ACTIVE",
        lastLoginAt: new Date(),
        roles: memberRole ? { create: { roleId: memberRole.id } } : undefined,
      },
    });
    await tx.membership.create({
      data: { userId: user.id, planId: plan.id, pricePaise: plan.pricePaise, claimedReference: input.reference ?? null },
    });
    await audit(tx, {
      actor: user,
      action: "member.join",
      entityType: "Member",
      entityId: user.id,
      summary: `${user.name} signed up online for ${plan.name} (${formatINR(plan.pricePaise)} pending)${input.reference ? ` — reference ${input.reference}` : ""}`,
      after: { plan: plan.name, reference: input.reference ?? null },
    });
    return user;
  });

  await createSession(user.id, user.sessionVersion);
  return { ok: true, data: undefined };
}
