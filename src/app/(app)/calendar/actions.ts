"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guardedAction, ok } from "@/lib/action";
import { fmtDateTime } from "@/lib/format";
import { calendarEntrySchema } from "@/lib/validation/schemas";

export const addCalendarEntry = guardedAction({ permission: "calendar.manage", schema: calendarEntrySchema }, async (input, actor) => {
  const entry = await db.$transaction(async (tx) => {
    const e = await tx.calendarEntry.create({ data: { ...input, notes: input.notes ?? null, createdById: actor.id } });
    await audit(tx, {
      actor,
      action: "calendar.add",
      entityType: "CalendarEntry",
      entityId: e.id,
      summary: `Added "${e.title}" to the calendar for ${fmtDateTime(e.startsAt)}`,
    });
    return e;
  });
  revalidatePath("/calendar");
  return ok({ id: entry.id }, "Added to the calendar");
});
