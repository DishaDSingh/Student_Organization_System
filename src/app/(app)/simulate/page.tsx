import type { Metadata } from "next";
import { FlaskConicalIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader, PageTabs, activeTab } from "@/components/common";
import { param } from "@/lib/format";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import type { EventSnapshot, MerchSnapshot, SpendSnapshot } from "@/lib/simulate/model";
import { EventSim, MerchSim, SpendSim } from "./sims";

export const metadata: Metadata = { title: "What if?" };

const TABS = ["event", "spend", "merch"] as const;
const DAY = 86_400_000;

export default async function SimulatePage(props: PageProps<"/simulate">) {
  await requirePermission("analytics.simulate");
  const sp = await props.searchParams;
  const tab = activeTab(TABS, sp.tab);

  return (
    <>
      <PageHeader
        title="What if?"
        description="Try a decision before making it. This works on a copy of today's numbers — nothing here is saved or changed."
      />
      <p className="bg-primary/5 border-primary/20 text-primary mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <FlaskConicalIcon className="size-4 shrink-0" /> Sandbox mode — live data is read once and copied; your changes stay in this page.
      </p>
      <PageTabs
        basePath="/simulate"
        current={tab}
        tabs={[
          { key: "event", label: "Ticket price & capacity" },
          { key: "spend", label: "Spend more" },
          { key: "merch", label: "Sell more merch" },
        ]}
      />
      {tab === "event" && <EventTab eventId={param(sp.event)} />}
      {tab === "spend" && <SpendTab />}
      {tab === "merch" && <MerchTab />}
    </>
  );
}

async function EventTab({ eventId }: { eventId?: string }) {
  const now = new Date();
  const events = await db.event.findMany({
    where: { status: "PUBLISHED", startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, salesCloseAt: true, capacity: true },
  });
  if (!events.length) return <p className="text-muted-foreground text-sm">There are no upcoming events to simulate.</p>;
  const e = events.find((x) => x.id === eventId) ?? events.find((x) => /gala/i.test(x.title)) ?? events[0];

  const since = new Date(now.getTime() - 14 * DAY);
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const [sold, recent, paid, costs, past] = await Promise.all([
    db.ticket.count({ where: { eventId: e.id, status: { in: ["VALID", "RESERVED"] } } }),
    db.ticket.count({ where: { eventId: e.id, status: { in: ["VALID", "RESERVED"] }, createdAt: { gte: since } } }),
    db.payment.aggregate({ where: { status: "PAID", purpose: "TICKET", ticketOrder: { eventId: e.id } }, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { eventId: e.id, status: { in: [...SPENT_STATUSES] } }, _sum: { amountPaise: true } }),
    db.ticket.groupBy({ by: ["checkedInAt"], where: { status: "VALID", event: { endsAt: { lt: now, gte: yearAgo } } }, _count: true }),
  ]);
  const prices = await db.ticket.aggregate({ where: { eventId: e.id, status: "VALID" }, _avg: { pricePaise: true } });
  const pastTotal = past.reduce((s, r) => s + r._count, 0);
  const pastCame = past.filter((r) => r.checkedInAt).reduce((s, r) => s + r._count, 0);
  const until = e.salesCloseAt && e.salesCloseAt < e.startsAt ? e.salesCloseAt : e.startsAt;

  const snapshot: EventSnapshot = {
    capacity: e.capacity,
    sold,
    soldRevenuePaise: paid._sum.amountPaise ?? 0,
    avgPricePaise: Math.round(prices._avg.pricePaise ?? 0),
    perDay: Math.round((recent / 14) * 10) / 10,
    daysLeft: Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY)),
    attendanceRate: pastTotal ? Math.round((pastCame / pastTotal) * 100) / 100 : 0.85,
    fixedCostPaise: costs._sum.amountPaise ?? 0,
  };
  return <EventSim key={e.id} events={events.map((x) => ({ id: x.id, title: x.title }))} eventId={e.id} snapshot={snapshot} />;
}

async function SpendTab() {
  const now = new Date();
  const sixMonths = new Date(now.getTime() - 182 * DAY);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const [inAll, outAll, in6, out6, budgets, spent] = await Promise.all([
    db.payment.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { status: { in: [...SPENT_STATUSES] } }, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: sixMonths } }, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: sixMonths } }, _sum: { amountPaise: true } }),
    db.budget.findMany({ orderBy: { category: "asc" } }),
    db.expense.groupBy({
      by: ["category"],
      where: { status: { in: [...SPENT_STATUSES] }, spentAt: { gte: month } },
      _sum: { amountPaise: true },
    }),
  ]);
  const spentBy = new Map(spent.map((x) => [x.category, x._sum.amountPaise ?? 0]));
  const snapshot: SpendSnapshot = {
    balancePaise: (inAll._sum.amountPaise ?? 0) - (outAll._sum.amountPaise ?? 0),
    avgMonthlyInPaise: Math.round((in6._sum.amountPaise ?? 0) / 6),
    avgMonthlyOutPaise: Math.round((out6._sum.amountPaise ?? 0) / 6),
    budgets: budgets.map((b) => ({ category: b.category, monthlyPaise: b.monthlyPaise, spentPaise: spentBy.get(b.category) ?? 0 })),
  };
  return <SpendSim snapshot={snapshot} />;
}

async function MerchTab() {
  const products = await db.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      publicPricePaise: true,
      unitCostPaise: true,
      variants: { where: { isActive: true }, select: { stock: true } },
    },
  });
  const snapshot: MerchSnapshot = {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      pricePaise: p.publicPricePaise,
      unitCostPaise: p.unitCostPaise,
      stock: p.variants.reduce((s, v) => s + v.stock, 0),
    })),
  };
  if (!snapshot.products.length) return <p className="text-muted-foreground text-sm">There are no active products.</p>;
  return <MerchSim snapshot={snapshot} />;
}
