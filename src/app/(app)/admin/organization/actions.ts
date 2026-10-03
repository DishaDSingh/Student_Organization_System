"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { organizationSchema } from "@/lib/validation/schemas";

export const updateOrganization = guardedAction({ permission: "organization.manage", schema: organizationSchema }, async (input, actor) => {
  const org = await db.organization.findFirst();
  if (!org) return fail("Organization not found.");

  const next = {
    ...input,
    institution: input.institution ?? null,
    description: input.description ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    address: input.address ?? null,
    upiId: input.upiId ?? null,
  };
  const { id: _id, createdAt: _c, updatedAt: _u, currency: _cur, timezone: _tz, ...before } = org;
  const changes = diff(before, next);
  if (!changes.changed) return ok(undefined, "No changes to save");

  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: org.id }, data: next });
    await audit(tx, {
      actor,
      action: "organization.update",
      entityType: "Organization",
      entityId: org.id,
      summary: `Updated organization settings (${Object.keys(changes.after).join(", ")})`,
      before: changes.before,
      after: changes.after,
    });
  });
  revalidatePath("/", "layout");
  return ok(undefined, "Settings saved");
});
