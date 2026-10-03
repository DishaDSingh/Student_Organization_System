import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { fmtDateTime } from "@/lib/format";
import { canManageCameras, canPlayback, canSeeCamera, canWatchLive } from "@/lib/cctv/access";
import { deviceLabel } from "@/lib/device";
import { PrivacyNotice } from "../privacy";
import { CameraDialog } from "../camera-dialog";
import { CameraViewer } from "./viewer";

export const metadata: Metadata = { title: "Camera" };

export default async function CameraPage(props: PageProps<"/security/[id]">) {
  const user = await requirePermission("cctv.view", "cctv.live", "cctv.playback", "cctv.manage");
  const { id } = await props.params;
  const cam = await db.camera.findUnique({ where: { id }, include: { event: { select: { id: true, title: true, organizerId: true } } } });
  // Cameras you can't see don't exist as far as you're concerned.
  if (!cam || !canSeeCamera(user, cam)) notFound();
  const manage = canManageCameras(user);
  const [log, events] = await Promise.all([
    manage || user.permissions.has("cctv.view")
      ? db.cameraAccess.findMany({ where: { cameraId: id }, orderBy: { createdAt: "desc" }, take: 25 })
      : [],
    manage
      ? db.event.findMany({
          where: { status: "PUBLISHED", endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          select: { id: true, title: true },
        })
      : [],
  ]);

  return (
    <>
      <PageHeader
        title={cam.name}
        description={[cam.location, cam.event?.title, `footage kept ${cam.retentionDays} days`, !cam.isActive && "offline"]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/security", label: "Security" }}
        actions={
          manage && (
            <CameraDialog
              events={events}
              camera={{
                cameraId: cam.id,
                name: cam.name,
                location: cam.location,
                streamUrl: cam.streamUrl ?? "",
                playbackUrl: cam.playbackUrl ?? "",
                eventId: cam.eventId ?? "",
                retentionDays: cam.retentionDays,
                isActive: cam.isActive,
              }}
            />
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="grid content-start gap-4 lg:col-span-3">
          <PrivacyNotice />
          <CameraViewer
            cameraId={cam.id}
            name={cam.name}
            live={cam.isActive && canWatchLive(user, cam)}
            playback={canPlayback(user, cam) && !!cam.playbackUrl}
            canMark={!!cam.event && (canWatchLive(user, cam) || canPlayback(user, cam))}
            eventTitle={cam.event?.title}
          />
        </div>
        {log.length > 0 || manage ? (
          <Section title="Access log" description="Who opened this camera, and from where." className="lg:col-span-2">
            {log.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nobody has opened this camera yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {log.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>
                      {a.userName} <span className="text-muted-foreground">· {a.kind === "LIVE" ? "live" : "playback"}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {fmtDateTime(a.createdAt)} · {deviceLabel(a.userAgent)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
      </div>
    </>
  );
}
