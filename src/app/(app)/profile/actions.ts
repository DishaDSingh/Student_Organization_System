"use server";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { createSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validation/schemas";

export const changePassword = guardedAction({ schema: changePasswordSchema }, async ({ currentPassword, newPassword }, actor) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return fail("Current password is incorrect.", { currentPassword: ["Incorrect password"] });
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await db.$transaction(async (tx) => {
    // New session version signs out every other device; this one gets a fresh cookie below.
    const u = await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    await audit(tx, {
      actor,
      action: "user.password.change",
      entityType: "User",
      entityId: actor.id,
      summary: `${actor.name} changed their password`,
    });
    return u;
  });
  await createSession(actor.id, updated.sessionVersion);
  return ok(undefined, "Password changed. Other devices were signed out.");
});
