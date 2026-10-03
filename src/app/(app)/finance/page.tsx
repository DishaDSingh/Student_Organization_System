import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, PlusIcon, ReceiptIcon, SparklesIcon, WalletIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, type CurrentUser } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, PageTabs, Pagination, Section, activeTab } from "@/components/common";
import { Meter } from "@/components/events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysAgo, fmtDate, pageParam, param, people, plural } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/schemas";
import { EXPENSE_STATUS_LABEL, INCOME_LABEL, SPENT_STATUSES, balance, breakdown, type ExpenseStatusKey } from "@/lib/finance/rules";
import type { Prisma } from "@/generated/prisma/client";
import { ReimburseButton, ReviewDialog } from "./finance-forms";

export const metadata: Metadata = { title: "Finance" };

const TABS = ["overview", "expenses", "income"] as const;
const PAGE_SIZE = 25;

export default async function FinancePage(props: PageProps<"/finance">) {
  const user = await requirePermission("finance.view", "finance.create_expense");
  const sp = await props.searchParams;
  const newButton = can(user, "finance.create_expense") && (
    <Button asChild>
      <Link href="/finance/new">
        <PlusIcon /> New expense
      </Link>
    </Button>
  );

  // Members who can only submit see their own claims — nothing else.
  if (!can(user, "finance.view")) {
    return (
      <>
        <PageHeader
          title="My expenses"
          description="Spent club money or paid from your pocket? Send it to the treasurer."
          actions={newButton}
        />
        <ExpenseList user={user} where={{ submittedById: user.id }} page={pageParam(sp.page)} sp={sp} mine />
      </>
    );
  }

  const tab = activeTab(TABS, sp.tab);
  const pending = await db.expense.count({ where: { status: "PENDING" } });

  return (
    <>
      <PageHeader title="Finance" description="What came in, what went out, and what's left." actions={newButton} />
      <PageTabs
        basePath="/finance"
        current={tab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "expenses", label: "Expenses", count: pending || undefined },
          { key: "income", label: "Income" },
        ]}
      />
      {tab === "overview" && <Overview />}
      {tab === "expenses" && <ExpensesTab user={user} sp={sp} />}
      {tab === "income" && <IncomeTab sp={sp} />}
    </>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

async function Overview() {
  const since = daysAgo(30);
  const spent = { status: { in: [...SPENT_STATUSES] } } satisfies Prisma.ExpenseWhereInput;
  const [inAll, outAll, in30, out30, byPurpose, byCategory, waiting, owed] = await Promise.all([
    db.payment.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: spent, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { ...spent, spentAt: { gte: since } }, _sum: { amountPaise: true } }),
    db.payment.groupBy({ by: ["purpose"], where: { status: "PAID" }, _sum: { amountPaise: true } }),
    db.expense.groupBy({ by: ["category"], where: spent, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { status: "APPROVED", needsReimbursement: true }, _count: true, _sum: { amountPaise: true } }),
  ]);
  const total = balance(inAll._sum.amountPaise ?? 0, outAll._sum.amountPaise ?? 0);
  const income = breakdown(byPurpose.map((r) => ({ key: INCOME_LABEL[r.purpose], paise: r._sum.amountPaise ?? 0 })));
  const costs = breakdown(byCategory.map((r) => ({ key: r.category, paise: r._sum.amountPaise ?? 0 })));

  const stats = [
    {
      label: "Money in",
      value: total.in,
      sub: `${formatINR(in30._sum.amountPaise ?? 0)} in the last 30 days`,
      href: "/finance?tab=income",
    },
    {
      label: "Money out",
      value: total.out,
      sub: `${formatINR(out30._sum.amountPaise ?? 0)} in the last 30 days`,
      href: "/finance?tab=expenses&status=APPROVED",
    },
    { label: "Balance", value: total.left, sub: total.left < 0 ? "Spending more than we earn" : "Money left to use", tone: total.left < 0 },
  ];

  return (
    <div className="grid gap-6">
      <div className="bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
        {stats.map((s) => {
          const body = (
            <>
              <p className="text-muted-foreground text-sm">{s.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", s.tone && "text-destructive")}>
                {formatINR(s.value)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{s.sub}</p>
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="bg-card hover:bg-muted/60 p-4 transition-colors sm:p-5">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="bg-card p-4 sm:p-5">
              {body}
            </div>
          );
        })}
      </div>

      {(waiting._count > 0 || owed._count > 0) && (
        <div className="flex flex-wrap gap-3">
          {waiting._count > 0 && (
            <Button asChild variant="outline">
              <Link href="/finance?tab=expenses">
                {plural(waiting._count, "expense")} to review · {formatINR(waiting._sum.amountPaise ?? 0)}
              </Link>
            </Button>
          )}
          {owed._count > 0 && (
            <Button asChild variant="outline">
              <Link href="/finance?tab=expenses&status=OWED">
                {people(owed._count)} to pay back · {formatINR(owed._sum.amountPaise ?? 0)}
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Where money came from">
          <Bars rows={income} empty="No income recorded yet." />
        </Section>
        <Section title="Where money went">
          <Bars rows={costs} empty="No approved expenses yet." tone="bg-warning/70" />
        </Section>
      </div>
    </div>
  );
}

function Bars({ rows, empty, tone }: { rows: { key: string; paise: number; pct: number }[]; empty: string; tone?: string }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span>{r.key}</span>
            <span className="tabular-nums">
              {formatINR(r.paise)} <span className="text-muted-foreground">· {r.pct}%</span>
            </span>
          </div>
          <Meter value={r.pct} max={100} className="h-1.5" tone={tone} />
        </li>
      ))}
    </ul>
  );
}

// ─── Expenses ────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "PENDING", label: "To review" },
  { key: "OWED", label: "To pay back" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
] as const;

function filterWhere(key: (typeof FILTERS)[number]["key"]): Prisma.ExpenseWhereInput {
  if (key === "ALL") return {};
  if (key === "OWED") return { status: "APPROVED", needsReimbursement: true };
  if (key === "APPROVED") return { status: { in: [...SPENT_STATUSES] } };
  return { status: key };
}

async function ExpensesTab({ user, sp }: { user: CurrentUser; sp: Record<string, string | string[] | undefined> }) {
  const status = FILTERS.find((f) => f.key === param(sp.status))?.key ?? "PENDING";
  return (
    <>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter expenses">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "PENDING" ? "/finance?tab=expenses" : `/finance?tab=expenses&status=${f.key}`}
            aria-current={status === f.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              status === f.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <ExpenseList user={user} where={filterWhere(status)} page={pageParam(sp.page)} sp={sp} />
    </>
  );
}

const STATUS_TONE: Record<ExpenseStatusKey, string> = {
  PENDING: "text-info",
  APPROVED: "text-success",
  REIMBURSED: "text-success",
  REJECTED: "text-destructive",
};

async function ExpenseList({
  user,
  where,
  page,
  sp,
  mine,
}: {
  user: CurrentUser;
  where: Prisma.ExpenseWhereInput;
  page: number;
  sp: Record<string, string | string[] | undefined>;
  mine?: boolean;
}) {
  const [rows, total] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        submittedBy: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
        fundraiser: { select: { id: true, title: true } },
      },
    }),
    db.expense.count({ where }),
  ]);
  const approver = can(user, "finance.approve_expense");

  if (!rows.length) {
    return (
      <EmptyState icon={WalletIcon} title={mine ? "No expenses yet" : "Nothing here"}>
        {mine ? "Add a receipt photo and we'll fill in the details for you." : "Try another filter."}
      </EmptyState>
    );
  }

  return (
    <div className="bg-card rounded-xl border">
      <ul className="divide-y">
        {rows.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{x.description}</span>
                {x.source === "scan" && (
                  <SparklesIcon className="text-primary size-3.5 shrink-0" aria-label="Filled from a scanned receipt" />
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {[x.category, x.vendor, fmtDate(x.spentAt), !mine && x.submittedBy?.name, x.event?.title ?? x.fundraiser?.title]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {x.reviewNote && <p className="text-muted-foreground mt-0.5 text-xs italic">“{x.reviewNote}”</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{formatINR(x.amountPaise)}</p>
              <p className={cn("text-xs", STATUS_TONE[x.status])}>
                {x.status === "APPROVED" && x.needsReimbursement ? "Approved · to pay back" : EXPENSE_STATUS_LABEL[x.status]}
              </p>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              {x.receiptUploadId && (
                <Button asChild variant="ghost" size="icon-sm" aria-label="Open receipt">
                  <a href={`/api/uploads/${x.receiptUploadId}`} target="_blank" rel="noreferrer">
                    <FileTextIcon />
                  </a>
                </Button>
              )}
              {approver && !mine && x.status === "PENDING" && x.submittedById !== user.id && (
                <ReviewDialog
                  expense={{
                    id: x.id,
                    description: x.description,
                    amountRupees: x.amountPaise / 100,
                    category: x.category,
                    submitter: x.submittedBy?.name ?? "a former member",
                    receiptUrl: x.receiptUploadId ? `/api/uploads/${x.receiptUploadId}` : null,
                  }}
                />
              )}
              {approver && !mine && x.status === "PENDING" && x.submittedById === user.id && (
                <span className="text-muted-foreground text-xs">Yours — another approver decides</span>
              )}
              {approver && !mine && x.status === "APPROVED" && x.needsReimbursement && <ReimburseButton expenseId={x.id} />}
            </div>
          </li>
        ))}
      </ul>
      {total > PAGE_SIZE && (
        <div className="border-t px-4 pb-3 sm:px-5">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} />
        </div>
      )}
    </div>
  );
}

// ─── Income ──────────────────────────────────────────────────────────────────

const PURPOSES = Object.keys(INCOME_LABEL) as (keyof typeof INCOME_LABEL)[];

async function IncomeTab({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const purpose = PURPOSES.find((p) => p === param(sp.purpose));
  const page = pageParam(sp.page);
  const where = { status: "PAID", ...(purpose && { purpose }) } satisfies Prisma.PaymentWhereInput;
  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { payer: { select: { name: true } }, fundraiser: { select: { title: true } } },
    }),
    db.payment.count({ where }),
  ]);

  return (
    <>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter income">
        {[undefined, ...PURPOSES].map((p) => (
          <Link
            key={p ?? "all"}
            href={p ? `/finance?tab=income&purpose=${p}` : "/finance?tab=income"}
            aria-current={purpose === p ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              purpose === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
            )}
          >
            {p ? INCOME_LABEL[p] : "All"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="No income here yet" />
      ) : (
        <div className="bg-card rounded-xl border">
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.fundraiser?.title ?? INCOME_LABEL[r.purpose]}</p>
                  <p className="text-muted-foreground text-xs">
                    {[
                      r.payer?.name ?? r.notes?.replace(/^Donor: /, "").split(" · ")[0],
                      fmtDate(r.paidAt),
                      PAYMENT_METHOD_LABEL[r.method],
                      r.receiptNumber,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">{formatINR(r.amountPaise)}</p>
              </li>
            ))}
          </ul>
          {total > PAGE_SIZE && (
            <div className="border-t px-4 pb-3 sm:px-5">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
