import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, ChevronRightIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { MemberStateBadge } from "@/components/membership";
import { daysAgo, fmtDate, fmtRelative } from "@/lib/format";
import { formatINR, standing } from "@/lib/membership/rules";
import { membershipCounts } from "@/lib/membership/load";
import type { PermissionKey } from "@/lib/rbac/catalog";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Todo = { label: string; count: number; href: string; tone?: "warn" };

export default async function DashboardPage() {
  const user = await requireUser();
  const now = daysAgo(0);
  const p = (k: PermissionKey) => can(user, k);

  const [members, myTerms, myTasks, pendingTickets, pendingMerch, lowStock, overdueTasks, openIncidents, nextEvent, moneyIn, recent] =
    await Promise.all([
      p("members.view") ? membershipCounts() : null,
      db.membership.findMany({
        where: { userId: user.id },
        select: { status: true, startDate: true, endDate: true, plan: { select: { name: true } } },
      }),
      db.task.count({ where: { assigneeId: user.id, status: { not: "DONE" } } }),
      p("tickets.sell") || p("finance.record_income")
        ? db.ticketOrder.count({ where: { status: "PENDING_PAYMENT", claimedReference: { not: null } } })
        : null,
      p("merchandise.manage_orders") ? db.merchOrder.count({ where: { status: { in: ["PENDING_PAYMENT", "PAID"] } } }) : null,
      p("merchandise.manage_inventory")
        ? db.productVariant.count({
            where: { isActive: true, product: { status: "ACTIVE" }, stock: { lte: db.productVariant.fields.reorderLevel } },
          })
        : null,
      p("fundraisers.manage") || p("volunteers.assign_tasks")
        ? db.task.count({ where: { status: { not: "DONE" }, dueAt: { lt: now } } })
        : null,
      p("events.view") ? db.eventIncident.count({ where: { resolvedAt: null, event: { endsAt: { gte: daysAgo(1) } } } }) : null,
      db.event.findFirst({
        where: { status: "PUBLISHED", endsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true, startsAt: true },
      }),
      p("members.view") || p("finance.view")
        ? db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: daysAgo(30) } }, _sum: { amountPaise: true } })
        : null,
      p("audit.view")
        ? db.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 6,
            select: { id: true, summary: true, actorName: true, createdAt: true },
          })
        : null,
    ]);
  const mine = standing(myTerms);

  // Every item is a link, and only appears if you can act on it.
  const todos = [
    myTasks ? { label: "Your open tasks", count: myTasks, href: "/me/volunteering" } : null,
    members?.pending && (p("members.edit") || p("finance.record_income"))
      ? { label: "Membership payments to confirm", count: members.pending, href: "/members?state=pending" }
      : null,
    pendingTickets ? { label: "Ticket payments to check", count: pendingTickets, href: "/events" } : null,
    pendingMerch ? { label: "Merch orders to handle", count: pendingMerch, href: "/merch/orders" } : null,
    members?.expiringThisWeek
      ? { label: "Memberships expiring this week", count: members.expiringThisWeek, href: "/members?state=expiring", tone: "warn" }
      : null,
    lowStock ? { label: "Merch sizes running low", count: lowStock, href: "/merch/inventory?show=low", tone: "warn" } : null,
    overdueTasks ? { label: "Overdue fundraiser tasks", count: overdueTasks, href: "/fundraisers", tone: "warn" } : null,
    openIncidents ? { label: "Open event incidents", count: openIncidents, href: "/events", tone: "warn" } : null,
  ].filter(Boolean) as Todo[];

  const stats = [
    members && { label: "Active members", value: members.active.toLocaleString("en-IN"), href: "/members?state=active" },
    moneyIn && { label: "Money in (30 days)", value: formatINR(moneyIn._sum.amountPaise ?? 0), href: "/members" },
    nextEvent && { label: "Next event", value: nextEvent.title, sub: fmtDate(nextEvent.startsAt), href: `/events/${nextEvent.id}` },
    {
      label: "Your membership",
      value: mine.term?.plan.name ?? "Not a member",
      badge: true,
      href: mine.state === "NONE" || mine.state === "EXPIRED" ? "/me" : "/me/pass",
    },
  ].filter(Boolean) as { label: string; value: string; sub?: string; badge?: boolean; href: string }[];

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} />

      <div className="bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-card hover:bg-muted/60 min-w-0 p-4 transition-colors sm:p-5">
            <p className="text-muted-foreground text-sm">{s.label}</p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums">{s.value}</p>
            {s.badge ? (
              <MemberStateBadge state={mine.state} className="mt-1.5" />
            ) : (
              s.sub && <p className="text-muted-foreground mt-1 text-xs">{s.sub}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Needs your attention">
          {todos.length ? (
            <ul className="-my-1 divide-y">
              {todos.map((t) => (
                <li key={t.label}>
                  <Link href={t.href} className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors">
                    <span
                      className={
                        t.tone === "warn"
                          ? "bg-warning/15 min-w-8 rounded-md px-1.5 py-0.5 text-center text-sm font-semibold text-amber-700 tabular-nums dark:text-amber-300"
                          : "bg-primary/10 text-primary min-w-8 rounded-md px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums"
                      }
                    >
                      {t.count}
                    </span>
                    <span className="flex-1 text-sm">{t.label}</span>
                    <ChevronRightIcon className="text-muted-foreground size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <CheckCircle2Icon className="text-success size-4" /> You&apos;re all caught up.
            </p>
          )}
        </Section>

        {recent ? (
          <Section
            title="Recent activity"
            actions={
              <Link href="/admin/audit" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
                All <ArrowRightIcon className="size-3.5" />
              </Link>
            }
          >
            <ol className="grid gap-3">
              {recent.map((a) => (
                <li key={a.id} className="grid gap-0.5 text-sm">
                  <span className="line-clamp-1">{a.summary}</span>
                  <span className="text-muted-foreground text-xs">
                    {a.actorName} · {fmtRelative(a.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        ) : (
          <Section title="Quick links">
            <ul className="grid gap-2 text-sm">
              {[
                ["/me/pass", "Show my member pass"],
                ["/events", "Upcoming events"],
                ["/merch", "Shop merch"],
                ["/me/volunteering", "Volunteer"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-primary hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}
