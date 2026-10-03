import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, ChevronRightIcon, RadioIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requireUser, type CurrentUser } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { MemberStateBadge } from "@/components/membership";
import { Meter } from "@/components/events";
import { cn } from "@/lib/utils";
import { daysAgo, fmtDate, fmtRelative } from "@/lib/format";
import { formatINR, standing } from "@/lib/membership/rules";
import { membershipCounts } from "@/lib/membership/load";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import { loadInsights, pulse } from "@/lib/insights/engine";
import { loadCalendar } from "@/lib/calendar/load";
import { KIND_LABEL } from "@/lib/calendar/grid";
import type { PermissionKey } from "@/lib/rbac/catalog";
import { audiencesFor } from "@/lib/announcements";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Todo = { label: string; count: number; href: string; tone?: "warn" };
type Stat = { label: string; value: string; sub?: string; badge?: boolean; href: string };

/**
 * One dashboard that adapts to the person (Phase 22): headline numbers and
 * the to-do list are permission-scoped, and the right column shows the three
 * panels most relevant to their role — pulse for leaders, their events for
 * organizers, what's coming up and announcements for members.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const now = daysAgo(0);
  const p = (k: PermissionKey) => can(user, k);

  const [
    members,
    myTerms,
    myTasks,
    pendingTickets,
    pendingMerch,
    lowStock,
    overdueTasks,
    openIncidents,
    nextEvent,
    money,
    expensesToReview,
    toPayBack,
    draftMeetings,
  ] = await Promise.all([
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
    p("finance.view")
      ? Promise.all([
          db.payment.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true } }),
          db.expense.aggregate({ where: { status: { in: [...SPENT_STATUSES] } }, _sum: { amountPaise: true } }),
        ])
      : null,
    p("finance.approve_expense") ? db.expense.count({ where: { status: "PENDING", submittedById: { not: user.id } } }) : null,
    p("finance.approve_expense") ? db.expense.count({ where: { status: "APPROVED", needsReimbursement: true } }) : null,
    p("calendar.manage") ? db.meeting.count({ where: { status: "DRAFT" } }) : null,
  ]);
  const mine = standing(myTerms);

  // Every item is a link, and only appears if you can act on it.
  const todos = [
    myTasks ? { label: "Your open tasks", count: myTasks, href: "/me/volunteering" } : null,
    members?.pending && (p("members.edit") || p("finance.record_income"))
      ? { label: "Membership payments to confirm", count: members.pending, href: "/members?state=pending" }
      : null,
    expensesToReview ? { label: "Expenses to approve", count: expensesToReview, href: "/finance?tab=expenses" } : null,
    toPayBack ? { label: "People to pay back", count: toPayBack, href: "/finance?tab=expenses&status=OWED" } : null,
    pendingTickets ? { label: "Ticket payments to check", count: pendingTickets, href: "/events" } : null,
    pendingMerch ? { label: "Merch orders to handle", count: pendingMerch, href: "/merch/orders" } : null,
    draftMeetings ? { label: "Meeting notes to review", count: draftMeetings, href: "/meetings" } : null,
    members?.expiringThisWeek
      ? { label: "Memberships expiring this week", count: members.expiringThisWeek, href: "/members?state=expiring", tone: "warn" }
      : null,
    lowStock ? { label: "Merch sizes running low", count: lowStock, href: "/merch/inventory?show=low", tone: "warn" } : null,
    overdueTasks ? { label: "Overdue tasks", count: overdueTasks, href: "/fundraisers", tone: "warn" } : null,
    openIncidents ? { label: "Open event incidents", count: openIncidents, href: "/events", tone: "warn" } : null,
  ].filter(Boolean) as Todo[];

  const stats = [
    members && { label: "Active members", value: members.active.toLocaleString("en-IN"), href: "/members?state=active" },
    money && {
      label: "Balance",
      value: formatINR((money[0]._sum.amountPaise ?? 0) - (money[1]._sum.amountPaise ?? 0)),
      sub: "money in − money out",
      href: "/finance",
    },
    nextEvent && { label: "Next event", value: nextEvent.title, sub: fmtDate(nextEvent.startsAt), href: `/events/${nextEvent.id}` },
    {
      label: "Your membership",
      value: mine.term?.plan.name ?? "Not a member",
      badge: true,
      href: mine.state === "NONE" || mine.state === "EXPIRED" ? "/me" : "/me/pass",
    },
  ].filter(Boolean) as Stat[];

  return (
    <>
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} />

      <div
        className={cn(
          "bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border",
          stats.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
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

        <div className="grid content-start gap-6">
          <RolePanels user={user} />
        </div>
      </div>
    </>
  );
}

// ─── Role panels (at most three, most relevant first) ────────────────────────

async function RolePanels({ user }: { user: CurrentUser }) {
  const now = new Date();
  const p = (k: PermissionKey) => can(user, k);
  const in14 = new Date(now.getTime() + 14 * 86_400_000);

  const [insights, myEvents, coming, news, contribution, recent] = await Promise.all([
    p("analytics.view") ? loadInsights(user, now) : null,
    p("events.edit") || p("events.create")
      ? db.event.findMany({
          where: { organizerId: user.id, status: "PUBLISHED", endsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 4,
          select: { id: true, title: true, startsAt: true, endsAt: true, capacity: true, allocated: true },
        })
      : [],
    loadCalendar(user, now, in14),
    // Only announcements addressed to this person.
    audiencesFor(user.id).then((audience) =>
      db.announcement.findMany({
        where: { status: "PUBLISHED", audience: { in: audience } },
        orderBy: { publishedAt: "desc" },
        take: 2,
        select: { id: true, title: true, publishedAt: true },
      }),
    ),
    db.task.aggregate({
      where: { assigneeId: user.id, status: "DONE", completedAt: { gte: new Date(now.getTime() - 182 * 86_400_000) } },
      _count: true,
      _sum: { loggedHours: true },
    }),
    p("audit.view")
      ? db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, summary: true, actorName: true, createdAt: true },
        })
      : null,
  ]);

  const panels: React.ReactNode[] = [];

  if (insights) {
    const rows = pulse(insights.areas, insights.insights);
    const DOT = { green: "bg-success", orange: "bg-warning", red: "bg-destructive" } as const;
    panels.push(
      <Section key="pulse" title="Organization pulse" actions={<More href="/insights" label="Insights" />}>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {rows.map((r) => (
            <li key={r.area}>
              <Link
                href={`/insights?area=${r.area}`}
                className="hover:bg-muted/50 -mx-1.5 flex items-center gap-2 rounded px-1.5 py-1"
                title={r.reasons.join(" · ")}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", DOT[r.status])} />
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
        {insights.insights[0] && (
          <p className="text-muted-foreground mt-3 border-t pt-3 text-sm">
            Top:{" "}
            <Link href="/insights" className="text-foreground hover:underline">
              {insights.insights[0].title}
            </Link>
          </p>
        )}
      </Section>,
    );
  }

  if (myEvents.length) {
    panels.push(
      <Section key="events" title="Your events" actions={<More href="/events" label="Events" />}>
        <ul className="grid gap-3">
          {myEvents.map((e) => {
            const live = e.startsAt <= now && e.endsAt >= now;
            return (
              <li key={e.id} className="grid gap-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link href={live ? `/events/${e.id}/live` : `/events/${e.id}`} className="truncate hover:underline">
                    {e.title}
                  </Link>
                  {live ? (
                    <span className="text-destructive inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                      <RadioIcon className="size-3" /> Live now
                    </span>
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-xs">{fmtDate(e.startsAt)}</span>
                  )}
                </div>
                <Meter value={e.allocated} max={e.capacity} className="h-1.5" />
                <p className="text-muted-foreground text-xs">
                  {e.allocated} of {e.capacity} tickets
                </p>
              </li>
            );
          })}
        </ul>
      </Section>,
    );
  }

  // Membership-expiry counts are for staff lists; here only your own expiry shows.
  const upcoming = coming
    .filter((c) => c.kind !== "expiry" || c.id === "my-term")
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);
  if (upcoming.length) {
    panels.push(
      <Section key="coming" title="Coming up" actions={<More href="/calendar" label="Calendar" />}>
        <ul className="grid gap-2.5 text-sm">
          {upcoming.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span className="text-muted-foreground w-14 shrink-0 text-xs tabular-nums">
                {c.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
              <span className="min-w-0">
                {c.href ? (
                  <Link href={c.href} className="hover:underline">
                    {c.title}
                  </Link>
                ) : (
                  c.title
                )}
                <span className="text-muted-foreground block text-xs">{KIND_LABEL[c.kind]}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>,
    );
  }

  if (news.length) {
    panels.push(
      <Section key="news" title="Announcements" actions={<More href="/announcements" label="All" />}>
        <ul className="grid gap-2 text-sm">
          {news.map((n) => (
            <li key={n.id}>
              <Link href="/announcements" className="hover:underline">
                {n.title}
              </Link>
              <span className="text-muted-foreground block text-xs">{fmtRelative(n.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </Section>,
    );
  }

  if (contribution._count > 0) {
    panels.push(
      <Section key="contribution" title="Your contribution" actions={<More href="/me/volunteering" label="Volunteering" />}>
        <p className="text-sm">
          You finished <strong>{contribution._count}</strong> task{contribution._count === 1 ? "" : "s"} and gave{" "}
          <strong>{contribution._sum.loggedHours ?? 0} hours</strong> in the last 6 months. Thank you!
        </p>
      </Section>,
    );
  }

  if (recent) {
    panels.push(
      <Section key="recent" title="Recent activity" actions={<More href="/admin/audit" label="All" />}>
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
      </Section>,
    );
  }

  return <>{panels.slice(0, 3)}</>;
}

function More({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
      {label} <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}
