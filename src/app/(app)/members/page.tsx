import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, IdCardIcon, PlusIcon, ScanLineIcon, SearchIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, Pagination } from "@/components/common";
import { MemberStateBadge } from "@/components/membership";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/form/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, pageParam, param } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATE_FILTERS, stateWhere, type StateFilter } from "@/lib/membership/query";
import { formatINR, standing } from "@/lib/membership/rules";
import { membershipCounts } from "@/lib/membership/load";
import { SendRemindersButton } from "./member-forms";

export const metadata: Metadata = { title: "Members" };
const PAGE_SIZE = 25;

const TABS: { key: StateFilter | "all"; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "active", label: "Active" },
  { key: "expiring", label: "Expiring ≤ 30 days" },
  { key: "expired", label: "Expired" },
  { key: "pending", label: "Payment pending" },
  { key: "none", label: "Not members" },
];

export default async function MembersPage(props: PageProps<"/members">) {
  const user = await requirePermission("members.view");
  const sp = await props.searchParams;
  const tab = (STATE_FILTERS as string[]).includes(param(sp.state) ?? "") ? (param(sp.state) as StateFilter) : "all";
  const q = param(sp.q)?.trim().slice(0, 80);
  const planId = param(sp.plan);
  const page = pageParam(sp.page);
  const now = new Date();

  const where: Prisma.UserWhereInput = {
    AND: [
      tab === "all" ? {} : stateWhere(tab, now),
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { studentId: { contains: q, mode: "insensitive" } },
              { memberNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      planId ? { memberships: { some: { planId, status: { in: ["ACTIVE", "PENDING_PAYMENT"] } } } } : {},
    ],
  };

  const [counts, total, rows, plans] = await Promise.all([
    membershipCounts(now),
    db.user.count({ where }),
    db.user.findMany({
      where,
      // Expiring and pending first is what the desk needs; otherwise alphabetical.
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        memberNumber: true,
        studentId: true,
        memberships: {
          select: { id: true, status: true, startDate: true, endDate: true, pricePaise: true, plan: { select: { name: true } } },
        },
      },
    }),
    db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const countFor = (k: StateFilter | "all") => (k === "all" ? null : counts[k]);
  const tabHref = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "all") p.set("state", k);
    if (q) p.set("q", q);
    if (planId) p.set("plan", planId);
    return `/members${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Members"
        description="Membership status, dues and renewals. Expired and expiring are worked out from dates, so they're always current."
        actions={
          <>
            {can(user, "members.verify") && (
              <Button variant="outline" asChild>
                <Link href="/members/verify">
                  <ScanLineIcon /> Verify pass
                </Link>
              </Button>
            )}
            {can(user, "members.export") && (
              <Button variant="outline" asChild>
                <a
                  href={`/api/members/export?${new URLSearchParams(Object.entries({ state: tab === "all" ? "" : tab, q: q ?? "", plan: planId ?? "" }).filter(([, v]) => v))}`}
                >
                  <DownloadIcon /> Export
                </a>
              </Button>
            )}
            {can(user, "members.add") && (
              <Button asChild>
                <Link href="/members/new">
                  <PlusIcon /> Register member
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* Headline numbers — each one is a filter. */}
      <div className="bg-border mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
        {[
          { label: "Active members", value: counts.active, href: tabHref("active"), tone: "" },
          {
            label: "Expire within 7 days",
            value: counts.expiringThisWeek,
            href: tabHref("expiring"),
            tone: counts.expiringThisWeek ? "text-amber-600 dark:text-amber-400" : "",
          },
          { label: "Awaiting payment", value: counts.pending, href: tabHref("pending"), tone: counts.pending ? "text-info" : "" },
          { label: "Lapsed", value: counts.expired, href: tabHref("expired"), tone: "" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="bg-card hover:bg-muted/60 p-4 transition-colors sm:p-5">
            <p className="text-muted-foreground text-sm">{s.label}</p>
            <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular-nums", s.tone)}>{s.value.toLocaleString("en-IN")}</p>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1" aria-label="Membership status">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm whitespace-nowrap ring-1 transition-colors",
                tab === t.key
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "text-muted-foreground ring-border hover:text-foreground",
              )}
            >
              {t.label}
              {countFor(t.key) !== null && <span className="ml-1.5 tabular-nums opacity-70">{countFor(t.key)}</span>}
            </Link>
          ))}
        </nav>
        {can(user, "members.edit") && (tab === "expiring" || tab === "expired") && (
          <div className="ml-auto">
            <SendRemindersButton />
          </div>
        )}
      </div>

      <form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_12rem_auto]" role="search">
        {tab !== "all" && <input type="hidden" name="state" value={tab} />}
        <div className="relative col-span-2 sm:col-span-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input name="q" defaultValue={q} placeholder="Name, email, roll no. or member no." className="pl-8" aria-label="Search members" />
        </div>
        <NativeSelect name="plan" defaultValue={planId ?? ""} aria-label="Filter by plan">
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={IdCardIcon} title="Nobody here">
          {q || planId ? "Try a different search." : "No one is in this group right now."}
        </EmptyState>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Member</TableHead>
                <TableHead className="hidden sm:table-cell">Plan</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden pr-4 text-right md:table-cell">Valid until</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const s = standing(r.memberships, now);
                const plan = s.term?.plan.name;
                return (
                  <TableRow key={r.id} className="relative">
                    <TableCell className="pl-4">
                      <Link href={`/members/${r.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {r.memberNumber ?? "No member no."} · {r.studentId ?? r.email}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:hidden">
                        <MemberStateBadge state={s.state} />
                        {s.validUntil && <span className="text-muted-foreground text-xs">until {fmtDate(s.validUntil)}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {plan ?? "—"}
                      {s.state === "PENDING" && s.pending && <span className="block text-xs">{formatINR(s.pending.pricePaise)} due</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <MemberStateBadge state={s.state} />
                      {s.state === "EXPIRING" && s.daysLeft !== null && (
                        <span className="text-muted-foreground block pt-0.5 text-xs">
                          {s.daysLeft} day{s.daysLeft === 1 ? "" : "s"} left
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden pr-4 text-right tabular-nums md:table-cell">
                      {fmtDate(s.validUntil ?? s.term?.endDate)}
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
