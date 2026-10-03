"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { fmtDateTime } from "@/lib/format";
import { canManageCameras, canPlayback, canWatchLive } from "@/lib/cctv/access";
import { cameraIncidentSchema, cameraSchema, cameraViewSchema } from "@/lib/validation/schemas";

const ANY_CCTV = ["cctv.view", "cctv.live", "cctv.playback", "cctv.manage"] as const;

const loadCamera = (cameraId: string) =>
  db.camera.findUnique({ where: { id: cameraId }, include: { event: { select: { id: true, title: true, organizerId: true } } } });

/**
 * Opening a feed is an explicit step (after the privacy notice) and is always
 * logged: who, which camera, live or playback, when, from which IP/device.
 */
export const openCameraFeed = guardedAction({ permission: [...ANY_CCTV], schema: cameraViewSchema }, async ({ cameraId, kind }, actor) => {
  const cam = await loadCamera(cameraId);
  if (!cam || !cam.isActive) return fail("Camera not found.");
  const allowed = kind === "LIVE" ? canWatchLive(actor, cam) : canPlayback(actor, cam);
  if (!allowed) return fail(kind === "LIVE" ? "You can't watch this camera live." : "You don't have playback access.");
  const url = kind === "LIVE" ? cam.streamUrl : cam.playbackUrl;

  const h = await headers();
  await db.$transaction(async (tx) => {
    await tx.cameraAccess.create({
      data: {
        cameraId,
        userId: actor.id,
        userName: actor.name,
        kind,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
        userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      },
    });
    await audit(tx, {
      actor,
      action: kind === "LIVE" ? "cctv.live_view" : "cctv.playback_view",
      entityType: "Camera",
      entityId: cameraId,
      summary: `Opened ${kind === "LIVE" ? "the live feed" : "recorded footage"} of "${cam.name}" (${cam.location})`,
    });
  });
  return ok({ url });
});

export const markCameraIncident = guardedAction({ permission: [...ANY_CCTV], schema: cameraIncidentSchema }, async (input, actor) => {
  const cam = await loadCamera(input.cameraId);
  if (!cam) return fail("Camera not found.");
  if (!canWatchLive(actor, cam) && !canPlayback(actor, cam)) return fail("You can't mark incidents on this camera.");
  if (!cam.event) return fail("This camera isn't attached to an event, so there's no event log to add the incident to.");

  await db.$transaction(async (tx) => {
    const inc = await tx.eventIncident.create({
      data: {
        eventId: cam.event!.id,
        title: input.title,
        severity: input.severity,
        location: cam.location,
        details: `Marked from camera "${cam.name}" at ${fmtDateTime(input.seenAt)}.`,
        reportedById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "cctv.incident",
      entityType: "EventIncident",
      entityId: inc.id,
      summary: `Marked incident "${input.title}" (${input.severity.toLowerCase()}) on camera "${cam.name}" at ${fmtDateTime(input.seenAt)}`,
    });
  });
  revalidatePath(`/security/${cam.id}`);
  revalidatePath(`/events/${cam.event.id}`);
  return ok(undefined, "Incident logged with a timestamp");
});

export const saveCamera = guardedAction({ permission: [...ANY_CCTV], schema: cameraSchema }, async (input, actor) => {
  if (!canManageCameras(actor)) return fail("Only camera managers can add or change cameras.");
  const { cameraId, ...data } = input;
  const row = { ...data, streamUrl: data.streamUrl ?? null, playbackUrl: data.playbackUrl ?? null, eventId: data.eventId ?? null };
  const cam = await db.$transaction(async (tx) => {
    const before = cameraId ? await tx.camera.findUnique({ where: { id: cameraId } }) : null;
    const c = cameraId ? await tx.camera.update({ where: { id: cameraId }, data: row }) : await tx.camera.create({ data: row });
    await audit(tx, {
      actor,
      action: cameraId ? "cctv.camera_update" : "cctv.camera_add",
      entityType: "Camera",
      entityId: c.id,
      summary: cameraId
        ? `Updated camera "${c.name}"${before && before.retentionDays !== c.retentionDays ? ` (retention ${before.retentionDays} → ${c.retentionDays} days)` : ""}`
        : `Added camera "${c.name}" at ${c.location}`,
      before: before ? { retentionDays: before.retentionDays, isActive: before.isActive, eventId: before.eventId } : null,
      after: { retentionDays: c.retentionDays, isActive: c.isActive, eventId: c.eventId },
    });
    return c;
  });
  revalidatePath("/security");
  revalidatePath(`/security/${cam.id}`);
  return ok({ id: cam.id }, cameraId ? "Camera saved" : "Camera added");
});
