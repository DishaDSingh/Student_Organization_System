import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CctvIcon, ShieldAlertIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { cameraScope, canManageCameras, canWatchLive } from "@/lib/cctv/access";
import { CameraDialog } from "./camera-dialog";
import { PrivacyNotice } from "./privacy";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requirePermission("cctv.view", "cctv.live", "cctv.playback", "cctv.manage");
  const scope = cameraScope(user);
  if (scope === "none") notFound();
  const cameras = await db.camera.findMany({
    where: scope === "all" ? {} : { event: { organizerId: user.id } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { event: { select: { id: true, title: true, startsAt: true, organizerId: true } }, _count: { select: { accesses: true } } },
  });
  const manage = canManageCameras(user);
  const events = manage
    ? await db.event.findMany({
        where: { status: "PUBLISHED", endsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true },
      })
    : [];

  // Group by event; cameras not tied to an event are "Campus".
  const groups = new Map<string, { title: string; sub?: string; cams: typeof cameras }>();
  for (const c of cameras) {
    const key = c.event?.id ?? "campus";
    const g = groups.get(key) ?? {
      title: c.event?.title ?? "Campus (always on)",
      sub: c.event ? fmtDate(c.event.startsAt) : undefined,
      cams: [],
    };
    g.cams.push(c);
    groups.set(key, g);
  }

  return (
    <>
      <PageHeader
        title="Security cameras"
        description={
          scope === "all"
            ? "Every camera, grouped by event. Each feed you open is logged."
            : "Cameras at the events you organize. Each feed you open is logged."
        }
        actions={manage && <CameraDialog events={events} />}
      />
      <PrivacyNotice className="mb-6" />
      {cameras.length === 0 ? (
        <EmptyState icon={CctvIcon} title="No cameras you can see">
          {scope === "own-events" ? "Cameras appear here when they're attached to an event you organize." : "Add a camera to get started."}
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {[...groups.values()].map((g) => (
            <section key={g.title}>
              <h2 className="mb-2 text-sm font-medium">
                {g.title} {g.sub && <span className="text-muted-foreground font-normal">· {g.sub}</span>}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.cams.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/security/${c.id}`}
                      className={cn(
                        "bg-card hover:border-primary/40 block rounded-xl border p-4 transition-colors",
                        !c.isActive && "opacity-60",
                      )}
                    >
                      <div className="flex aspect-video items-center justify-center rounded-lg bg-neutral-900 text-neutral-500">
                        <CctvIcon className="size-8" />
                      </div>
                      <p className="mt-3 font-medium">{c.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {c.location} · keeps footage {c.retentionDays} days
                        {!c.isActive && " · offline"}
                      </p>
                      <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                        <ShieldAlertIcon className="size-3" />
                        {canWatchLive(user, c) ? "Live access" : "No live access"} · opened {c._count.accesses} times
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
