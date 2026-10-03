import type { Metadata } from "next";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { ungrantable } from "@/lib/rbac/resolve";
import { CreateUserForm } from "../user-form";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  const user = await requirePermission("users.create");
  const [departments, roles] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    can(user, "roles.assign")
      ? db.role.findMany({
          orderBy: { rank: "asc" },
          select: { id: true, name: true, color: true, description: true, permissions: { select: { permissionKey: true } } },
        })
      : null,
  ]);

  return (
    <>
      <PageHeader
        title="Add user"
        description="Create an account for a new teammate or member."
        back={{ href: "/admin/users", label: "Users" }}
      />
      <CreateUserForm
        departments={departments}
        roles={
          roles?.map(({ permissions, ...r }) => ({
            ...r,
            grantable:
              ungrantable(
                user,
                permissions.map((p) => p.permissionKey),
              ).length === 0,
          })) ?? null
        }
      />
    </>
  );
}
