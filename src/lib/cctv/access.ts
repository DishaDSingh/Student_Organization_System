/**
 * CCTV access rules (Phase 15). Pure, so the matrix is easy to test:
 *
 *   Master Admin / anyone with cctv.view  → every camera (list)
 *   cctv.live                             → live feeds of cameras they can see
 *   cctv.live without cctv.view           → only cameras attached to events they organize
 *   cctv.playback                         → recorded footage (within retention)
 *   cctv.manage                           → add cameras, set retention, see access logs
 *   everyone else                         → nothing (the module isn't shown)
 *
 * No facial recognition or person tracking is implemented or supported.
 */

type Perms = { id: string; isMasterAdmin?: boolean; permissions: ReadonlySet<string> };
type Cam = { event: { organizerId: string | null } | null };

export type CameraScope = "all" | "own-events" | "none";

export function cameraScope(u: Perms): CameraScope {
  if (u.isMasterAdmin || u.permissions.has("cctv.view") || u.permissions.has("cctv.manage")) return "all";
  if (u.permissions.has("cctv.live")) return "own-events";
  return "none";
}

export function canSeeCamera(u: Perms, cam: Cam) {
  const scope = cameraScope(u);
  return scope === "all" || (scope === "own-events" && !!cam.event && cam.event.organizerId === u.id);
}

export const canWatchLive = (u: Perms, cam: Cam) => (u.isMasterAdmin || u.permissions.has("cctv.live")) && canSeeCamera(u, cam);

export const canPlayback = (u: Perms, cam: Cam) =>
  (u.isMasterAdmin || u.permissions.has("cctv.playback")) && cameraScope(u) === "all" && canSeeCamera(u, cam);

export const canManageCameras = (u: Perms) => !!u.isMasterAdmin || u.permissions.has("cctv.manage");

/** How the browser should show a feed URL. */
export function feedKind(url: string | null | undefined): "image" | "video" | "none" {
  if (!url) return "none";
  const path = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|m3u8|mov)$/.test(path)) return "video";
  return "image"; // MJPEG streams and JPEG snapshot URLs render in <img>
}
