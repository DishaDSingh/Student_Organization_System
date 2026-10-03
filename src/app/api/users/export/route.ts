import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";

/** GET /api/users/export — CSV of users matching the list filters. Audited. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.permissions.has("users.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.slice(0, 80);
  const role = sp.get("role");
  const status = sp.get("status");
  const where: Prisma.UserWhereInput = {
    ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }),
    ...(role && (role === "master" ? { isMasterAdmin: true } : { roles: { some: { roleId: role } } })),
    ...(status === "ACTIVE" || status === "INVITED" || status === "SUSPENDED" ? { status } : {}),
    ...(sp.get("dept") && { departmentId: sp.get("dept")! }),
  };

  const users = await db.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      name: true,
      email: true,
      phone: true,
      studentId: true,
      status: true,
      isMasterAdmin: true,
      createdAt: true,
      department: { select: { name: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  // Quote every cell and neutralise spreadsheet formula injection (=, +, -, @).
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Name", "Email", "Phone", "Roll no.", "Department", "Roles", "Status", "Created"];
  const rows = users.map((u) =>
    [
      u.name,
      u.email,
      u.phone,
      u.studentId,
      u.department?.name,
      [u.isMasterAdmin ? "Master Admin" : null, ...u.roles.map((r) => r.role.name)].filter(Boolean).join("; "),
      u.status,
      u.createdAt.toISOString().slice(0, 10),
    ].map(cell),
  );
  const csv = [header.map(cell), ...rows].map((r) => r.join(",")).join("\r\n");

  await db.$transaction((tx) =>
    audit(tx, {
      actor: user,
      action: "user.export",
      entityType: "User",
      summary: `Exported ${users.length} users to CSV`,
      after: { filters: Object.fromEntries(sp.entries()), count: users.length },
    }),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campusbuzz-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
