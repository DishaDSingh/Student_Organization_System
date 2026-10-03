import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, RoleBadge, Section, StatusLabel } from "@/components/common";
import { PERMISSION_MODULES } from "@/lib/rbac/catalog";
import { DeleteRoleButton, PermissionEditor, RoleDetailsForm } from "../role-forms";

export const metadata: Metadata = { title: "Role" };

export default async function RoleDetailPage(props: PageProps<"/admin/roles/[id]">) {
  const user = await requirePermission("roles.view");
  const { id } = await props.params;

  const role = await db.role.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      isSystem: true,
      permissions: { select: { permissionKey: true } },
      _count: { select: { users: true } },
      users: {
        take: 12,
        orderBy: { assignedAt: "desc" },
        select: { user: { select: { id: true, name: true, email: true, status: true } } },
      },
    },
  });
  if (!role) notFound();

  const editable = can(user, "roles.manage");
  const modules = PERMISSION_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    permissions: m.permissions.map((p) => ({
      key: `${m.key}.${p.action}`,
      label: p.label,
      description: p.description,
      isSensitive: "sensitive" in p && !!p.sensitive,
    })),
  }));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/roles", label: "Roles" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {role.name}
            <RoleBadge name={role.isSystem ? "Built-in" : "Custom"} color={role.isSystem ? "slate" : role.color} />
          </span>
        }
        description={role.description}
        actions={editable && !role.isSystem && <DeleteRoleButton roleId={role.id} name={role.name} holders={role._count.users} />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Section
          title="Permissions"
          description={
            editable
              ? "Changes apply to everyone with this role as soon as you save. Locked boxes are permissions you don't hold yourself."
              : "Read-only — you need “Create / edit roles” to change these."
          }
          className="min-w-0"
        >
          <PermissionEditor
            roleId={role.id}
            modules={modules}
            initial={role.permissions.map((p) => p.permissionKey)}
            editable={editable}
            grantable={[...user.permissions]}
            holders={role._count.users}
          />
        </Section>

        <div className="grid content-start gap-6">
          <Section title="Details">
            <RoleDetailsForm role={role} editable={editable} />
          </Section>
          <Section
            title={`People (${role._count.users})`}
            actions={
              can(user, "users.view") && (
                <Link href={`/admin/users?role=${role.id}`} className="text-primary text-sm hover:underline">
                  View all
                </Link>
              )
            }
          >
            {role.users.length ? (
              <ul className="grid gap-2.5 text-sm">
                {role.users.map(({ user: u }) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      {can(user, "users.view") ? (
                        <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                          {u.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{u.name}</span>
                      )}
                      <span className="text-muted-foreground block truncate text-xs">{u.email}</span>
                    </span>
                    <StatusLabel status={u.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nobody has this role yet.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
