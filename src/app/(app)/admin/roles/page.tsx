import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, RoleBadge } from "@/components/common";
import { ALL_PERMISSION_KEYS, ALL_PERMISSIONS } from "@/lib/rbac/catalog";
import { CreateRoleDialog } from "./role-forms";
import { people, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Roles & permissions" };

const SENSITIVE = new Set(ALL_PERMISSIONS.filter((p) => p.sensitive).map((p) => p.key as string));

export default async function RolesPage() {
  const user = await requirePermission("roles.view");
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { rank: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      isSystem: true,
      permissions: { select: { permissionKey: true } },
      _count: { select: { users: true } },
    },
  });
  const masterCount = await db.user.count({ where: { isMasterAdmin: true } });

  const groups = [
    {
      title: "Built-in roles",
      hint: "Created with the organization. Re-permission freely; they can't be renamed or deleted.",
      items: roles.filter((r) => r.isSystem),
    },
    { title: "Custom roles", hint: "Roles your organization created for its own structure.", items: roles.filter((r) => !r.isSystem) },
  ];

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Roles bundle permissions. Nobody sees everything by default — only Master Admins have unrestricted access."
        actions={can(user, "roles.manage") && <CreateRoleDialog roles={roles.map((r) => ({ id: r.id, name: r.name }))} />}
      />

      <Link
        href="/admin/users?role=master"
        className="border-primary/25 bg-primary/5 hover:bg-primary/10 mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 text-sm transition-colors"
      >
        <span className="font-medium">Master Admin</span>
        <span className="text-muted-foreground">All {ALL_PERMISSION_KEYS.length} permissions · not a role, a protected account flag</span>
        <span className="text-muted-foreground ml-auto tabular-nums">{people(masterCount)}</span>
      </Link>

      <div className="grid gap-8">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="font-medium">{g.title}</h2>
            <p className="text-muted-foreground mb-3 text-sm">{g.hint}</p>
            {g.items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-sm">No custom roles yet.</p>
            ) : (
              <ul className="bg-card divide-y overflow-hidden rounded-xl border">
                {g.items.map((r) => {
                  const sensitive = r.permissions.filter((p) => SENSITIVE.has(p.permissionKey)).length;
                  const pct = (r.permissions.length / ALL_PERMISSION_KEYS.length) * 100;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/admin/roles/${r.id}`}
                        className="hover:bg-muted/40 grid gap-2 px-4 py-3 transition-colors sm:grid-cols-[1fr_10rem_6rem] sm:items-center"
                      >
                        <div className="min-w-0">
                          <RoleBadge name={r.name} color={r.color} />
                          {r.description && <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">{r.description}</p>}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          <div className="bg-muted mb-1 h-1.5 overflow-hidden rounded-full">
                            <div className="bg-primary/70 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          {plural(r.permissions.length, "permission")}
                          {sensitive > 0 && <span className="text-destructive"> · {sensitive} sensitive</span>}
                        </div>
                        <p className="text-muted-foreground text-sm tabular-nums sm:text-right">{people(r._count.users)}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
