import { daysAgo, type Db } from "./shared";

/**
 * Phase 15 seed: demo cameras (no real streams — they show "no signal"),
 * grouped by event, plus a short access history.
 * Story: the Event Head sees only the Diwali Gala and Open Mic cameras;
 * the Security Head sees every camera.
 */
const CAMERAS = [
  { name: "Main gate", location: "Campus main gate", retentionDays: 30 },
  { name: "Library entrance", location: "Central library", retentionDays: 30 },
  { name: "Parking lot", location: "North parking", retentionDays: 14 },
  { name: "Gala hall — entry", location: "Lakeside Banquets, entrance", event: "Diwali Gala Night 2026", retentionDays: 30 },
  { name: "Gala hall — stage", location: "Lakeside Banquets, stage", event: "Diwali Gala Night 2026", retentionDays: 30 },
  { name: "Gala hall — food counters", location: "Lakeside Banquets, dining", event: "Diwali Gala Night 2026", retentionDays: 30 },
  { name: "Ground — east gate", location: "Sports ground", event: "Garba Night 2026", retentionDays: 14 },
  { name: "Ground — stage", location: "Sports ground", event: "Garba Night 2026", retentionDays: 14 },
  { name: "Seminar hall", location: "Block C, seminar hall", event: "Open Mic Night 2026", retentionDays: 7 },
];

export async function seedSecurity(db: Db) {
  const [events, security, eventHead] = await Promise.all([
    db.event.findMany({ select: { id: true, title: true } }),
    db.user.findFirst({ where: { roles: { some: { role: { key: "security_head" } } } }, select: { id: true, name: true } }),
    db.user.findFirst({ where: { roles: { some: { role: { key: "event_head" } } } }, select: { id: true, name: true } }),
  ]);
  const cams = [];
  for (const c of CAMERAS) {
    cams.push(
      await db.camera.create({
        data: {
          name: c.name,
          location: c.location,
          retentionDays: c.retentionDays,
          eventId: events.find((e) => e.title === c.event)?.id ?? null,
        },
      }),
    );
  }
  const viewers = [security, eventHead].filter((v): v is { id: string; name: string } => !!v);
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
  await db.cameraAccess.createMany({
    data: cams
      .slice(0, 5)
      .flatMap((c, i) =>
        viewers
          .filter((v) => v === security || c.eventId)
          .map((v, j) => ({
            cameraId: c.id,
            userId: v.id,
            userName: v.name,
            kind: "LIVE",
            ip: `10.0.0.${20 + i + j}`,
            userAgent: ua,
            createdAt: daysAgo(2 + i),
          })),
      ),
  });
  return { cameras: cams.length, eventCameras: cams.filter((c) => c.eventId).length };
}
