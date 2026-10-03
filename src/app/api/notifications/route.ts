import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";

/** GET /api/notifications — the signed-in user's unread count and latest items. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const [unread, items] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({ unread, items }, { headers: { "Cache-Control": "no-store" } });
}

const markSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(50) })]);

/** POST /api/notifications — mark some or all as read. Only ever touches your own. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const parsed = markSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { count } = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...("ids" in parsed.data ? { id: { in: parsed.data.ids } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ marked: count });
}
