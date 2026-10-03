import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PermissionKey } from "@/lib/rbac/catalog";

/**
 * GET /api/users/search?q=… — typeahead for people pickers (department head,
 * committee chair, committee members). Returns at most 10 active users.
 */
const ALLOWED: PermissionKey[] = ["users.view", "departments.manage", "committees.manage"];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ALLOWED.some((p) => user.permissions.has(p))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ users: [] });

  const users = await db.user.findMany({
    where: {
      status: { not: "SUSPENDED" },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { studentId: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, email: true },
  });
  return NextResponse.json({ users });
}
