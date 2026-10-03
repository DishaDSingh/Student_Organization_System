import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, MasterBadge, PageHeader, Pagination, RoleBadge, StatusLabel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/form/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRelative, pageParam, param } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };
const PAGE_SIZE = 25;
const STATUSES = ["ACTIVE", "INVITED", "SUSPENDED"] as const;

export default async function UsersPage(props: PageProps<"/admin/users">) {
  const user = await requirePermission("users.view");
  const sp = await props.searchParams;
  const q = param(sp.q)?.trim().slice(0, 80);
  const roleId = param(sp.role);
  const status = STATUSES.find((s) => s === param(sp.status));
  const departmentId = param(sp.dept);
  const page = pageParam(sp.page);

  const where: Prisma.UserWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { studentId: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(roleId && (roleId === "master" ? { isMasterAdmin: true } : { roles: { some: { roleId } } })),
    ...(status && { status }),
    ...(departmentId && { departmentId }),
  };

  const [users, total, roles, departments] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ isMasterAdmin: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        studentId: true,
        status: true,
        isMasterAdmin: true,
        lastLoginAt: true,
        department: { select: { name: true } },
        roles: { orderBy: { role: { rank: "asc" } }, select: { role: { select: { id: true, name: true, color: true } } } },
      },
    }),
    db.user.count({ where }),
    db.role.findMany({ orderBy: { rank: "asc" }, select: { id: true, name: true } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const filtered = !!(q || roleId || status || departmentId);
  const exportQuery = new URLSearchParams(
    Object.entries({ q, role: roleId, status, dept: departmentId }).filter(([, v]) => v) as [string, string][],
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a CampusBuzz account. Access comes from roles plus per-person exceptions."
        actions={
          <>
            {can(user, "users.export") && (
              <Button variant="outline" asChild>
                <a href={`/api/users/export?${exportQuery}`}>
                  <DownloadIcon /> Export CSV
                </a>
              </Button>
            )}
            {can(user, "users.create") && (
              <Button asChild>
                <Link href="/admin/users/new">
                  <PlusIcon /> Add user
                </Link>
              </Button>
            )}
          </>
        }
      />

      <form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_repeat(3,minmax(0,11rem))_auto]" role="search">
        <div className="relative col-span-2 sm:col-span-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input name="q" defaultValue={q} placeholder="Search name, email or roll no." className="pl-8" aria-label="Search users" />
        </div>
        <NativeSelect name="role" defaultValue={roleId ?? ""} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="master">Master Admin</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Filter by status">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="dept" defaultValue={departmentId ?? ""} aria-label="Filter by department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1">
            Filter
          </Button>
          {filtered && (
            <Button variant="ghost" asChild>
              <Link href="/admin/users">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} title={filtered ? "No users match these filters" : "No users yet"}>
          {filtered ? "Try a different search or clear the filters." : "Add your first teammate to get started."}
        </EmptyState>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead className="hidden sm:table-cell">Roles</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden pr-4 text-right lg:table-cell">Last sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const badges = (
                  <>
                    {u.isMasterAdmin && <MasterBadge />}
                    {u.roles
                      .filter(({ role }) => !(u.roles.length > 1 && role.name === "General Member"))
                      .slice(0, 3)
                      .map(({ role }) => (
                        <RoleBadge key={role.id} name={role.name} color={role.color} />
                      ))}
                  </>
                );
                return (
                  <TableRow key={u.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/admin/users/${u.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                        {u.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {u.email}
                        {u.studentId && <span className="hidden sm:inline"> · {u.studentId}</span>}
                      </p>
                      {/* On phones roles and status fold under the name instead of extra columns. */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
                        {badges}
                        <StatusLabel status={u.status} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex max-w-xs flex-wrap gap-1">{badges}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">{u.department?.name ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusLabel status={u.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden pr-4 text-right lg:table-cell">
                      {fmtRelative(u.lastLoginAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} />
    </>
  );
}
