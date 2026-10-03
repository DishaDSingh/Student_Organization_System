import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { MasterBadge, PageHeader, RoleBadge, Section } from "@/components/common";
import { PERMISSION_MODULES } from "@/lib/rbac/catalog";
import { fmtDate } from "@/lib/format";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "My profile & access" };

export default async function ProfilePage() {
  const user = await requireUser();
  const me = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      phone: true,
      studentId: true,
      createdAt: true,
      department: { select: { name: true } },
      roles: { select: { role: { select: { name: true, permissions: { select: { permissionKey: true } } } } } },
      permissionOverrides: { select: { permissionKey: true, effect: true, reason: true } },
      committees: { where: { committee: { isActive: true } }, select: { position: true, committee: { select: { name: true } } } },
    },
  });

  // Where each permission comes from, so people understand their own access.
  const sources: Record<string, string[]> = {};
  for (const { role } of me.roles) for (const p of role.permissions) (sources[p.permissionKey] ??= []).push(role.name);
  const overrides = Object.fromEntries(me.permissionOverrides.map((o) => [o.permissionKey, o]));

  const modules = PERMISSION_MODULES.map((m) => ({
    ...m,
    granted: m.permissions.filter((p) => user.permissions.has(`${m.key}.${p.action}` as never)),
  })).filter((m) => m.granted.length > 0);

  return (
    <>
      <PageHeader title="My profile & access" description="Your account and exactly what you're allowed to do in CampusBuzz." />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="grid content-start gap-6">
          <Section title={user.name}>
            <dl className="grid gap-2 text-sm">
              {[
                ["Email", user.email],
                ["Mobile", me.phone ?? "—"],
                ["Roll no.", me.studentId ?? "—"],
                ["Department", me.department?.name ?? "—"],
                ["Member since", fmtDate(me.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {user.isMasterAdmin && <MasterBadge />}
              {user.roles.map((r) => (
                <RoleBadge key={r.id} name={r.name} color={r.color} />
              ))}
            </div>
            {me.committees.length > 0 && (
              <ul className="mt-4 grid gap-1 border-t pt-3 text-sm">
                {me.committees.map((c) => (
                  <li key={c.committee.name} className="flex justify-between gap-2">
                    <span className="truncate">{c.committee.name}</span>
                    <span className="text-muted-foreground shrink-0">{c.position}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Change password">
            <PasswordForm />
          </Section>
        </div>

        <Section
          title="What I can do"
          description={
            user.isMasterAdmin
              ? "As Master Admin you hold every permission."
              : `${user.permissions.size} permissions from your roles and any exceptions set by an admin.`
          }
        >
          {modules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Your role covers your own membership, tickets and orders. Ask an admin if you need more access.
            </p>
          ) : (
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              {modules.map((m) => (
                <div key={m.key}>
                  <p className="mb-1.5 text-sm font-medium">{m.label}</p>
                  <ul className="grid gap-1">
                    {m.granted.map((p) => {
                      const key = `${m.key}.${p.action}`;
                      const o = overrides[key];
                      return (
                        <li key={key} className="flex items-start gap-2 text-sm">
                          <CheckIcon className="text-success mt-0.5 size-3.5 shrink-0" />
                          <span>
                            {p.label}
                            <span className="text-muted-foreground block text-xs">
                              {user.isMasterAdmin
                                ? "Master Admin"
                                : o?.effect === "GRANT"
                                  ? `Granted to you${o.reason ? ` — ${o.reason}` : ""}`
                                  : `Via ${sources[key]?.join(", ")}`}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
