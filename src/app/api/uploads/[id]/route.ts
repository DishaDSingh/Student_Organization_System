import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { readUpload, UPLOAD_PURPOSES, type UploadPurpose } from "@/lib/uploads";

/** GET /api/uploads/:id — the uploader, or anyone with a viewing permission for that kind of file. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/uploads/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  const u = await db.upload.findUnique({ where: { id } });
  if (!u || !(u.purpose in UPLOAD_PURPOSES)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewAny = UPLOAD_PURPOSES[u.purpose as UploadPurpose].viewAny;
  const allowed = u.uploadedById === user.id || viewAny === null || viewAny.some((p) => user.permissions.has(p));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = await readUpload(u.path);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": u.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${u.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing from storage" }, { status: 410 });
  }
}
