import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth/current-user";
import { PageHeader, RoleBadge, Section, MasterBadge } from "@/components/common";
import { fmtDate, fmtRelative, people } from "@/lib/format";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/catalog";
import { MemberStateBadge } from "@/components/membership";
import { membershipCounts } from "@/lib/membership/load";
import { formatINR, standing } from "@/lib/membership/rules";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const showUsers = can(user, "users.view");
  const showRoles = can(user, "roles.view");
  const showAudit = can(user, "audit.view");

  const showMembers = can(user, "members.view");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    statusCounts,
    roleCount,
    customRoleCount,
    activeCommittees,
    departments,
    roleDistribution,
    recent,
    members,
    duesThisMonth,
    myTerms,
  ] = await Promise.all([
    showUsers ? db.user.groupBy({ by: ["status"], _count: true }) : null,
    showRoles ? db.role.count() : null,
    showRoles ? db.role.count({ where: { isSystem: false } }) : null,
    can(user, "committees.view") ? db.committee.count({ where: { isActive: true } }) : null,
    can(user, "departments.view") ? db.department.count() : null,
    showRoles
      ? db.role.findMany({
          orderBy: { rank: "asc" },
          select: { id: true, key: true, name: true, color: true, _count: { select: { users: true } } },
        })
      : null,
    showAudit
      ? db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, summary: true, actorName: true, createdAt: true, action: true },
        })
      : null,
    showMembers ? membershipCounts() : null,
    showMembers
      ? db.payment.aggregate({
          where: { purpose: "MEMBERSHIP", status: "PAID", paidAt: { gte: monthStart } },
          _sum: { amountPaise: true },
          _count: true,
        })
      : null,
    db.membership.findMany({
      where: { userId: user.id },
      select: { id: true, status: true, startDate: true, endDate: true, pricePaise: true, plan: { select: { name: true } } },
    }),
  ]);
  const mine = standing(myTerms);

  const status = Object.fromEntries((statusCounts ?? []).map((s) => [s.status, s._count])) as Record<string, number>;
  const stats = [
    showUsers && {
      label: "Active users",
      value: status.ACTIVE ?? 0,
      sub: `${status.INVITED ?? 0} invited · ${status.SUSPENDED ?? 0} suspended`,
      href: "/admin/users",
    },
    roleCount !== null && { label: "Roles", value: roleCount, sub: `${customRoleCount} custom`, href: "/admin/roles" },
    activeCommittees !== null && { label: "Active committees", value: activeCommittees, sub: "this term", href: "/admin/committees" },
    departments !== null && { label: "Departments", value: departments, sub: "functional areas", href: "/admin/departments" },
  ].filter(Boolean) as { label: string; value: number | string; sub: string; href: string }[];

  // Membership is the daily heartbeat of the org, so it leads when you can see it.
  const memberStats = members && [
    { label: "Active members", value: members.active, sub: `${members.expiring} expiring within 30 days`, href: "/members?state=active" },
    {
      label: "Expire within 7 days",
      value: members.expiringThisWeek,
      sub: "renewal reminders sent automatically",
      href: "/members?state=expiring",
    },
    { label: "Awaiting payment", value: members.pending, sub: "confirm to activate", href: "/members?state=pending" },
    {
      label: "Dues this month",
      value: formatINR(duesThisMonth?._sum.amountPaise ?? 0),
      sub: `${duesThisMonth?._count ?? 0} payments`,
      href: "/members",
    },
  ];
  const headline = memberStats ?? stats;

  // Everyone holds General Member, so chart it separately — otherwise it dwarfs every other bar.
  const baseRole = roleDistribution?.find((r) => r.key === "general_member");
  const chartRoles = roleDistribution?.filter((r) => r !== baseRole) ?? [];
  const maxRole = Math.max(1, ...chartRoles.map((r) => r._count.users));

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} description="Here's what's happening across your organization." />

      {headline.length > 0 && (
        <div className="bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
          {headline.map((s) => (
            <Link key={s.label} href={s.href} className="bg-card hover:bg-muted/60 p-4 transition-colors sm:p-5">
              <p className="text-muted-foreground text-sm">{s.label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                {typeof s.value === "number" ? s.value.toLocaleString("en-IN") : s.value}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{s.sub}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {roleDistribution && (
          <Section
            title="People by role"
            description="People can hold several roles at once."
            className="lg:col-span-3"
            actions={
              <Link href="/admin/roles" className="text-primary text-sm hover:underline">
                Manage roles
              </Link>
            }
          >
            <ul className="grid gap-2.5">
              {chartRoles.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/roles/${r.id}`}
                    className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 text-sm hover:opacity-80"
                  >
                    <RoleBadge name={r.name} color={r.color} className="justify-self-start" />
                    <span className="bg-muted h-2 overflow-hidden rounded-full">
                      <span className="bg-primary/70 block h-full rounded-full" style={{ width: `${(r._count.users / maxRole) * 100}%` }} />
                    </span>
                    <span className="text-muted-foreground text-right tabular-nums">{r._count.users}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {baseRole && (
              <p className="text-muted-foreground mt-4 border-t pt-3 text-sm">
                Plus <span className="text-foreground font-medium tabular-nums">{people(baseRole._count.users)}</span> with the baseline{" "}
                {baseRole.name} role.
              </p>
            )}
          </Section>
        )}

        <div className={roleDistribution ? "grid content-start gap-6 lg:col-span-2" : "grid content-start gap-6 lg:col-span-5"}>
          <Section
            title="Your membership"
            actions={
              <Link
                href={mine.state === "NONE" || mine.state === "EXPIRED" ? "/me" : "/me/pass"}
                className="text-primary text-sm hover:underline"
              >
                {mine.state === "NONE" ? "Join" : mine.state === "EXPIRED" ? "Renew" : "Show pass"}
              </Link>
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <MemberStateBadge state={mine.state} />
              {mine.term && <span>{mine.term.plan.name}</span>}
              {mine.validUntil && <span className="text-muted-foreground">until {fmtDate(mine.validUntil)}</span>}
            </div>
          </Section>
          <Section title="Your access">
            <div className="flex flex-wrap gap-1.5">
              {user.isMasterAdmin && <MasterBadge />}
              {user.roles.map((r) => (
                <RoleBadge key={r.id} name={r.name} color={r.color} />
              ))}
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              {user.permissions.size} of {ALL_PERMISSION_KEYS.length} permissions.{" "}
              <Link href="/profile" className="text-primary hover:underline">
                See exactly what you can do
              </Link>
            </p>
          </Section>

          {recent && (
            <Section
              title="Recent activity"
              actions={
                <Link href="/admin/audit" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
                  Audit log <ArrowRightIcon className="size-3.5" />
                </Link>
              }
            >
              <ol className="grid gap-3">
                {recent.map((a) => (
                  <li key={a.id} className="grid gap-0.5 text-sm">
                    <span className="line-clamp-2">{a.summary}</span>
                    <span className="text-muted-foreground text-xs">
                      {a.actorName} · {fmtRelative(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
