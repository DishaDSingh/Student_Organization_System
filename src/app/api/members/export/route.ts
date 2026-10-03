import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STATE_FILTERS, stateWhere, type StateFilter } from "@/lib/membership/query";
import { STATE_LABEL, standing } from "@/lib/membership/rules";

/** GET /api/members/export — members CSV with current standing. Audited. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.permissions.has("members.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const state = sp.get("state");
  const q = sp.get("q")?.slice(0, 80);
  const plan = sp.get("plan");
  const where: Prisma.UserWhereInput = {
    AND: [
      state && (STATE_FILTERS as string[]).includes(state) ? stateWhere(state as StateFilter) : {},
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { memberNumber: { contains: q, mode: "insensitive" } }] } : {},
      plan ? { memberships: { some: { planId: plan, status: { in: ["ACTIVE", "PENDING_PAYMENT"] } } } } : {},
    ],
  };

  const users = await db.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      name: true,
      email: true,
      phone: true,
      studentId: true,
      memberNumber: true,
      program: true,
      yearOfStudy: true,
      memberships: { select: { status: true, startDate: true, endDate: true, plan: { select: { name: true } } } },
    },
  });

  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Member no.", "Name", "Email", "Phone", "Roll no.", "Programme", "Year", "Plan", "Status", "Valid until"];
  const rows = users.map((u) => {
    const s = standing(u.memberships);
    return [
      u.memberNumber,
      u.name,
      u.email,
      u.phone,
      u.studentId,
      u.program,
      u.yearOfStudy,
      s.term?.plan.name,
      STATE_LABEL[s.state],
      s.validUntil?.toISOString().slice(0, 10),
    ].map(cell);
  });

  await db.$transaction((tx) =>
    audit(tx, {
      actor: user,
      action: "member.export",
      entityType: "Member",
      summary: `Exported ${users.length} members to CSV`,
      after: { filters: Object.fromEntries(sp.entries()), count: users.length },
    }),
  );

  return new NextResponse([header.map(cell), ...rows].map((r) => r.join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campusbuzz-members-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
