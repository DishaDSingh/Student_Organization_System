import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { MasterBadge, PageHeader, Section, StatusLabel } from "@/components/common";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import { PERMISSION_MODULES, ALL_PERMISSIONS } from "@/lib/rbac/catalog";
import { ungrantable } from "@/lib/rbac/resolve";
import { EditProfileForm } from "../user-form";
import { AccessMatrix, AccountActions, RolesEditor } from "./user-access";

export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage(props: PageProps<"/admin/users/[id]">) {
  const actor = await requirePermission("users.view");
  const { id } = await props.params;

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      studentId: true,
      departmentId: true,
      status: true,
      isMasterAdmin: true,
      lastLoginAt: true,
      createdAt: true,
      roles: { select: { roleId: true, assignedAt: true, assignedBy: { select: { name: true } } } },
      permissionOverrides: { select: { permissionKey: true, effect: true, reason: true } },
      committees: { select: { position: true, committee: { select: { id: true, name: true, isActive: true } } } },
      headOfDepartments: { select: { name: true } },
    },
  });
  if (!user) notFound();

  const [departments, roles, activity] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.role.findMany({
      orderBy: { rank: "asc" },
      select: { id: true, name: true, color: true, description: true, permissions: { select: { permissionKey: true } } },
    }),
    can(actor, "audit.view")
      ? db.auditLog.findMany({
          where: { OR: [{ entityType: "User", entityId: id }, { actorId: id }] },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, summary: true, actorName: true, createdAt: true },
        })
      : null,
  ]);

  const isSelf = actor.id === user.id;
  const protectedTarget = user.isMasterAdmin && !actor.isMasterAdmin;
  const canAssign = can(actor, "roles.assign") && !protectedTarget && (!isSelf || actor.isMasterAdmin);

  const assigned = user.roles.map((r) => r.roleId);
  const roleSources: Record<string, string[]> = {};
  for (const r of roles.filter((r) => assigned.includes(r.id))) {
    for (const p of r.permissions) (roleSources[p.permissionKey] ??= []).push(r.name);
  }
  const permRows = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, p]));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "Users" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {user.name}
            {user.isMasterAdmin && <MasterBadge />}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusLabel status={user.status} />
            <span>{user.email}</span>
            <span>Joined {fmtDate(user.createdAt)}</span>
            <span>Last sign-in {fmtRelative(user.lastLoginAt)}</span>
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Section title="Roles" description={canAssign ? "A person's access is the combination of all their roles." : undefined}>
            <RolesEditor
              userId={user.id}
              assigned={assigned}
              editable={canAssign}
              roles={roles.map(({ permissions, ...r }) => ({
                ...r,
                permissions: permissions.map((p) => p.permissionKey),
                grantable:
                  ungrantable(
                    actor,
                    permissions.map((p) => p.permissionKey),
                  ).length === 0,
              }))}
            />
          </Section>

          <Section
            title="Permissions"
            description="Effective access, where it comes from, and per-person exceptions. Deny always wins over roles."
          >
            <AccessMatrix
              userId={user.id}
              isMasterAdmin={user.isMasterAdmin}
              editable={canAssign}
              roleSources={roleSources}
              overrides={user.permissionOverrides.map((o) => ({ ...o, reason: o.reason ?? undefined }))}
              grantable={ALL_PERMISSIONS.filter((p) => actor.permissions.has(p.key)).map((p) => p.key)}
              modules={PERMISSION_MODULES.map((m) => ({
                key: m.key,
                label: m.label,
                permissions: m.permissions.map((p) => {
                  const row = permRows[`${m.key}.${p.action}`];
                  return { key: row.key, label: row.label, description: row.description, isSensitive: !!row.sensitive };
                }),
              }))}
            />
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Profile">
            <EditProfileForm user={user} departments={departments} disabled={!can(actor, "users.edit") || protectedTarget} />
          </Section>

          <Section title="Account">
            <AccountActions
              user={user}
              isSelf={isSelf}
              isActorMaster={actor.isMasterAdmin}
              canSuspend={can(actor, "users.suspend") && !protectedTarget}
              canReset={can(actor, "users.reset_password") && !protectedTarget}
            />
          </Section>

          {(user.committees.length > 0 || user.headOfDepartments.length > 0) && (
            <Section title="Responsibilities">
              <ul className="grid gap-2 text-sm">
                {user.headOfDepartments.map((d) => (
                  <li key={d.name} className="flex justify-between gap-2">
                    <span>{d.name} department</span>
                    <span className="text-muted-foreground">Head</span>
                  </li>
                ))}
                {user.committees.map((c) => (
                  <li key={c.committee.id} className="flex justify-between gap-2">
                    <Link href={`/admin/committees/${c.committee.id}`} className="hover:underline">
                      {c.committee.name}
                      {!c.committee.isActive && <span className="text-muted-foreground"> (past)</span>}
                    </Link>
                    <span className="text-muted-foreground shrink-0">{c.position}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {activity && (
            <Section
              title="Activity"
              actions={
                <Link href={`/admin/audit?entity=${user.id}`} className="text-primary text-sm hover:underline">
                  All
                </Link>
              }
            >
              {activity.length ? (
                <ol className="grid gap-3 text-sm">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <p>{a.summary}</p>
                      <p className="text-muted-foreground text-xs">
                        {a.actorName} · {fmtDateTime(a.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">No recorded activity.</p>
              )}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
