"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guardedAction, ok } from "@/lib/action";
import { volunteerProfileSchema } from "@/lib/validation/schemas";

/** Anyone can volunteer: this creates or updates your own volunteer profile. */
export const saveMyVolunteerProfile = guardedAction({ schema: volunteerProfileSchema }, async (input, actor) => {
  const existing = await db.volunteerProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
  await db.$transaction(async (tx) => {
    await tx.volunteerProfile.upsert({
      where: { userId: actor.id },
      create: { ...input, bio: input.bio ?? null, userId: actor.id },
      update: { ...input, bio: input.bio ?? null },
    });
    await audit(tx, {
      actor,
      action: existing ? "volunteer.profile.update" : "volunteer.signup",
      entityType: "Volunteer",
      entityId: actor.id,
      summary: existing ? `${actor.name} updated their volunteer profile` : `${actor.name} signed up as a volunteer`,
    });
  });
  revalidatePath("/volunteers");
  revalidatePath("/me/volunteering");
  return ok(undefined, existing ? "Saved" : "Thanks for volunteering!");
});
