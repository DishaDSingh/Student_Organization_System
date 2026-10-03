/**
 * What-if simulator (Phase 17). LIVE DATA → copied into a snapshot → you
 * change assumptions → these pure functions calculate → compare. Nothing here
 * can write to the database; the page has no server actions at all.
 *
 * The models are deliberately simple and every assumption is visible.
 */

export type Outcome = { label: string; baseline: number; scenario: number; unit: "inr" | "count" | "pct" | "months" };

// ─── Event: ticket price / capacity / costs ──────────────────────────────────

export type EventSnapshot = {
  capacity: number;
  sold: number;
  soldRevenuePaise: number; // what's already been paid — earlier buyers keep their price
  avgPricePaise: number; // current average ticket price
  perDay: number; // recent sales pace (last 14 days)
  daysLeft: number; // until sales close / the event
  attendanceRate: number; // 0..1, from past events
  fixedCostPaise: number; // approved costs so far
};

export type EventAssumptions = {
  pricePct: number; // −50 … +100
  capacity: number;
  elasticity: number; // how strongly demand reacts to price (0 = not at all)
  extraCostPaise: number;
  perHeadCostPaise: number;
};

export function projectEvent(s: EventSnapshot, a: Pick<EventAssumptions, "pricePct" | "capacity" | "elasticity">) {
  const p = a.pricePct / 100;
  const demand = Math.max(0, 1 - a.elasticity * p); // +10% price with elasticity 0.8 → 8% fewer future sales
  const price = Math.round(s.avgPricePaise * (1 + p));
  const room = Math.max(0, a.capacity - s.sold);
  const future = Math.min(room, Math.round(s.perDay * s.daysLeft * demand));
  return { future, total: s.sold + future, price };
}

export function eventScenario(s: EventSnapshot, a: EventAssumptions): Outcome[] {
  const base = projectEvent(s, { pricePct: 0, capacity: s.capacity, elasticity: a.elasticity });
  const next = projectEvent(s, a);
  const revenue = (x: { future: number; price: number }) => s.soldRevenuePaise + x.future * x.price;
  const attendees = (total: number) => Math.round(total * s.attendanceRate);
  const cost = (total: number, extra: number) => s.fixedCostPaise + extra + attendees(total) * a.perHeadCostPaise;
  const bRev = revenue(base);
  const sRev = revenue(next);
  const bCost = cost(base.total, 0);
  const sCost = cost(next.total, a.extraCostPaise);
  return [
    { label: "Tickets sold", baseline: base.total, scenario: next.total, unit: "count" },
    { label: "Seats filled", baseline: pct(base.total, s.capacity), scenario: pct(next.total, a.capacity), unit: "pct" },
    { label: "Expected attendance", baseline: attendees(base.total), scenario: attendees(next.total), unit: "count" },
    { label: "Ticket revenue", baseline: bRev, scenario: sRev, unit: "inr" },
    { label: "Costs", baseline: bCost, scenario: sCost, unit: "inr" },
    { label: "Net result", baseline: bRev - bCost, scenario: sRev - sCost, unit: "inr" },
  ];
}

// ─── Spending: what if we spend ₹X more? ─────────────────────────────────────

export type SpendSnapshot = {
  balancePaise: number;
  avgMonthlyInPaise: number;
  avgMonthlyOutPaise: number;
  budgets: { category: string; monthlyPaise: number; spentPaise: number }[];
};

export type SpendAssumptions = { extraPaise: number; category: string };

/** Months the balance lasts at the current burn; Infinity when income covers spending. */
export function runway(balance: number, monthlyIn: number, monthlyOut: number) {
  const burn = monthlyOut - monthlyIn;
  return burn <= 0 ? Infinity : Math.max(0, balance / burn);
}

export function spendScenario(s: SpendSnapshot, a: SpendAssumptions): Outcome[] {
  const b = s.budgets.find((x) => x.category === a.category);
  const out: Outcome[] = [
    { label: "Balance", baseline: s.balancePaise, scenario: s.balancePaise - a.extraPaise, unit: "inr" },
    {
      label: "Runway (months)",
      baseline: runway(s.balancePaise, s.avgMonthlyInPaise, s.avgMonthlyOutPaise),
      scenario: runway(s.balancePaise - a.extraPaise, s.avgMonthlyInPaise, s.avgMonthlyOutPaise),
      unit: "months",
    },
  ];
  if (b)
    out.push({
      label: `${b.category} budget used this month`,
      baseline: pct(b.spentPaise, b.monthlyPaise),
      scenario: pct(b.spentPaise + a.extraPaise, b.monthlyPaise),
      unit: "pct",
    });
  return out;
}

// ─── Merch: what if we sell N more? ──────────────────────────────────────────

export type MerchSnapshot = { products: { id: string; name: string; pricePaise: number; unitCostPaise: number; stock: number }[] };
export type MerchAssumptions = { productId: string; extraUnits: number; pricePaise: number };

export function merchScenario(s: MerchSnapshot, a: MerchAssumptions): { outcomes: Outcome[]; reorder: number } {
  const p = s.products.find((x) => x.id === a.productId);
  if (!p) return { outcomes: [], reorder: 0 };
  const reorder = Math.max(0, a.extraUnits - p.stock);
  return {
    reorder,
    outcomes: [
      { label: "Extra revenue", baseline: 0, scenario: a.extraUnits * a.pricePaise, unit: "inr" },
      { label: "Cost of goods", baseline: 0, scenario: a.extraUnits * p.unitCostPaise, unit: "inr" },
      { label: "Extra profit", baseline: 0, scenario: a.extraUnits * (a.pricePaise - p.unitCostPaise), unit: "inr" },
      { label: "Stock left", baseline: p.stock, scenario: Math.max(0, p.stock - a.extraUnits), unit: "count" },
      { label: "Units to reorder", baseline: 0, scenario: reorder, unit: "count" },
    ],
  };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
