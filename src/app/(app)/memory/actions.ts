"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guardedAction, ok } from "@/lib/action";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/memory/rank";
import { memoryItemSchema } from "@/lib/validation/schemas";

export const addMemory = guardedAction({ permission: "reports.generate", schema: memoryItemSchema }, async (input, actor) => {
  const m = await db.$transaction(async (tx) => {
    const m = await tx.memoryItem.create({
      data: {
        ...input,
        happenedAt: input.happenedAt ?? null,
        eventId: input.eventId ?? null,
        url: input.url ?? null,
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "memory.add",
      entityType: "MemoryItem",
      entityId: m.id,
      summary: `Added a ${MEMORY_KINDS[input.kind as MemoryKind].toLowerCase()} to memory: "${m.title}"`,
    });
    return m;
  });
  revalidatePath("/memory");
  return ok({ id: m.id }, "Saved to memory");
});
