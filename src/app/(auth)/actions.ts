"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/action";
import { createSession, destroySession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearFailures, isLocked, recordFailure } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ensurePresetRoles, syncPermissionCatalog } from "@/lib/rbac/sync";
import { loginSchema, setupSchema } from "@/lib/validation/schemas";

// A real hash to compare against when the email is unknown, so response time
// doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-1"));

export async function login(raw: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter a valid email and password.");
  const { email, password } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limitKey = `${email}|${ip}`;
  if (isLocked(limitKey)) return fail("Too many failed attempts. Try again in 15 minutes.");

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true, status: true, sessionVersion: true },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !valid) {
    recordFailure(limitKey);
    return fail("Incorrect email or password.");
  }
  if (user.status === "SUSPENDED") return fail("This account is suspended. Contact your organization admin.");

  clearFailures(limitKey);
  await db.$transaction(async (tx) => {
    // First successful login activates an invited account.
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(user.status === "INVITED" ? { status: "ACTIVE" } : {}) },
    });
    await audit(tx, {
      actor: user,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      summary: `${user.name} signed in`,
    });
  });
  await createSession(user.id, user.sessionVersion);
  return { ok: true, data: undefined };
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) {
    await db.$transaction((tx) =>
      audit(tx, { actor: user, action: "auth.logout", entityType: "User", entityId: user.id, summary: `${user.name} signed out` }),
    );
  }
  await destroySession();
  redirect("/login");
}

/**
 * Phase 1 entry point: creates the organization and its first Master Admin.
 * Only works while the database has no organization — afterwards it refuses.
 */
export async function completeSetup(raw: unknown): Promise<ActionResult> {
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.");
  const { org, admin } = parsed.data;

  if (await db.organization.count()) return fail("CampusBuzz is already set up. Sign in instead.");

  const passwordHash = await hashPassword(admin.password);
  const user = await db.$transaction(
    async (tx) => {
      await syncPermissionCatalog(tx);
      await ensurePresetRoles(tx);
      const organization = await tx.organization.create({ data: org });
      const member = await tx.role.findUniqueOrThrow({ where: { key: "general_member" } });
      const user = await tx.user.create({
        data: {
          name: admin.name,
          email: admin.email,
          phone: admin.phone,
          passwordHash,
          isMasterAdmin: true,
          lastLoginAt: new Date(),
          roles: { create: { roleId: member.id } },
        },
      });
      await audit(tx, {
        actor: user,
        action: "organization.create",
        entityType: "Organization",
        entityId: organization.id,
        summary: `Created organization "${organization.name}" and Master Admin ${user.name}`,
        after: { ...org },
      });
      return user;
    },
    { timeout: 20_000 },
  );

  await createSession(user.id, user.sessionVersion);
  return { ok: true, data: undefined };
}
