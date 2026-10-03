import type { Prisma } from "../../src/generated/prisma/client";
import { DAY, TODAY, between, bySize, daysAgo, faker, type Db } from "./shared";

/**
 * Phase 7–8 seed: expenses and reimbursement claims.
 * Story: a queue of claims waiting for the treasurer (Freshers snacks among
 * them), a few people still owed money, and Diwali Gala costs adding up.
 */

type Spec = { category: string; what: string[]; vendors: string[]; min: number; max: number };

const SPECS: Spec[] = [
  {
    category: "Food & refreshments",
    what: [
      "Snacks for volunteers",
      "Tea & coffee for the meeting",
      "Samosas for the stall team",
      "Pizza for the late-night setup",
      "Water bottles",
    ],
    vendors: ["Sharma Sweets", "Café Coffee Day", "Domino's", "Swiggy", "Canteen"],
    min: 300,
    max: 4500,
  },
  {
    category: "Printing & stationery",
    what: ["Posters for the event", "Flex banner", "Entry wristbands", "Certificates", "Membership cards printing"],
    vendors: ["Shree Xerox", "Print Point", "Kokuyo Stationers", "FlexWorld"],
    min: 250,
    max: 6000,
  },
  {
    category: "Event costs",
    what: ["Sound system rental", "Hall booking deposit", "DJ advance", "Stage & tent", "Chair rentals"],
    vendors: ["Sonic Sound & Lights", "Lakeside Banquets", "DJ Akash", "Royal Tent House"],
    min: 2000,
    max: 25000,
  },
  {
    category: "Decorations",
    what: ["Marigold garlands", "Fairy lights", "Balloons & ribbon", "Rangoli colours", "Diyas"],
    vendors: ["Dadar Flower Market", "Party Needs", "Crawford Market"],
    min: 400,
    max: 7000,
  },
  {
    category: "Travel",
    what: ["Cab to vendor pickup", "Cab for equipment run", "Auto fare for poster run", "Cab to inter-college meet"],
    vendors: ["Uber", "Ola", "Rapido"],
    min: 120,
    max: 3500,
  },
  {
    category: "Merch production",
    what: ["Hoodie sample", "Screen printing setup", "Tote bag batch advance"],
    vendors: ["Threadcraft Apparel", "PrintMyTee"],
    min: 1500,
    max: 18000,
  },
  {
    category: "Software & subscriptions",
    what: ["Canva Pro (month)", "Domain renewal", "Google Workspace storage"],
    vendors: ["Canva", "GoDaddy", "Google"],
    min: 300,
    max: 2500,
  },
];

const GALA_COSTS = [
  { what: "Diwali Gala — venue advance", category: "Event costs", vendor: "Lakeside Banquets", amount: 35000 },
  { what: "Diwali Gala — sound & lights advance", category: "Event costs", vendor: "Sonic Sound & Lights", amount: 12000 },
  { what: "Diwali Gala — invitation printing", category: "Printing & stationery", vendor: "Print Point", amount: 4200 },
];

const REJECT_REASONS = ["No receipt — please re-submit with one", "Not pre-approved by the event head", "Duplicate of an earlier claim"];

/** GST already inside an 18%-inclusive total. */
const gstIn = (paise: number) => Math.round(paise - paise / 1.18);

export async function seedFinance(db: Db) {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, roles: { select: { role: { select: { key: true } } } } },
  });
  const hasRole = (u: (typeof users)[number], ...k: string[]) => u.roles.some((r) => k.includes(r.role.key));
  const submitters = users.filter((u) => hasRole(u, "event_head", "volunteer_head", "merchandise_manager", "committee_member"));
  const treasurer = users.find((u) => hasRole(u, "treasurer"))!;
  const president = users.find((u) => hasRole(u, "president")) ?? treasurer;
  const events = await db.event.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, title: true } });
  const fundraisers = await db.fundraiser.findMany({ select: { id: true } });
  const gala = events.find((e) => e.title === "Diwali Gala Night 2026");
  const freshers = events.find((e) => e.title.startsWith("Freshers"));

  const rows: Prisma.ExpenseCreateManyInput[] = [];
  const now = Date.now();

  for (let i = 0; i < bySize(60, 120); i++) {
    const spec = faker.helpers.arrayElement(SPECS);
    const spentAt = i < 8 ? between(10, 0) : between(330, 12);
    // Recent claims are still waiting; older ones were decided.
    const status =
      i < 8
        ? "PENDING"
        : faker.helpers.weightedArrayElement([
            { value: "APPROVED" as const, weight: 5 },
            { value: "REIMBURSED" as const, weight: 7 },
            { value: "REJECTED" as const, weight: 1 },
          ]);
    const needsReimbursement = status === "REIMBURSED" || (status !== "APPROVED" && faker.datatype.boolean(0.6));
    const amountPaise = faker.number.int({ min: spec.min, max: spec.max }) * 100;
    const reviewedAt =
      status === "PENDING" ? null : new Date(Math.min(now, spentAt.getTime() + faker.number.int({ min: 1, max: 6 }) * DAY));
    const event = faker.datatype.boolean(0.45) ? faker.helpers.arrayElement(events) : null;
    rows.push({
      description: faker.helpers.arrayElement(spec.what),
      category: spec.category,
      vendor: faker.helpers.arrayElement(spec.vendors),
      amountPaise,
      taxPaise: faker.datatype.boolean(0.5) ? gstIn(amountPaise) : 0,
      spentAt,
      status,
      needsReimbursement,
      eventId: event?.id ?? null,
      fundraiserId: !event && fundraisers.length && faker.datatype.boolean(0.2) ? faker.helpers.arrayElement(fundraisers).id : null,
      source: faker.datatype.boolean(0.35) ? "scan" : "manual",
      submittedById: faker.helpers.arrayElement(submitters).id,
      reviewedById: reviewedAt ? treasurer.id : null,
      reviewedAt,
      reviewNote: status === "REJECTED" ? faker.helpers.arrayElement(REJECT_REASONS) : null,
      reimbursedAt: status === "REIMBURSED" && reviewedAt ? new Date(Math.min(now, reviewedAt.getTime() + 2 * DAY)) : null,
      createdAt: spentAt,
    });
  }

  // A few people approved but still waiting to be paid back.
  for (const r of rows.filter((r) => r.status === "REIMBURSED").slice(0, 4)) {
    r.status = "APPROVED";
    r.reimbursedAt = null;
  }

  // Story rows.
  if (freshers) {
    rows.push({
      description: "Snacks for Freshers volunteers",
      category: "Food & refreshments",
      vendor: "Sharma Sweets",
      amountPaise: 185_000,
      taxPaise: 8_810,
      spentAt: daysAgo(0),
      needsReimbursement: true,
      eventId: freshers.id,
      source: "scan",
      submittedById: submitters[0].id,
    });
  }
  if (gala) {
    for (const g of GALA_COSTS) {
      const spentAt = between(20, 8);
      rows.push({
        description: g.what,
        category: g.category,
        vendor: g.vendor,
        amountPaise: g.amount * 100,
        taxPaise: gstIn(g.amount * 100),
        spentAt,
        status: "APPROVED",
        eventId: gala.id,
        // The treasurer paid these, so the president approved them (four-eyes).
        submittedById: treasurer.id,
        reviewedById: president.id,
        reviewedAt: new Date(spentAt.getTime() + DAY),
        createdAt: spentAt,
      });
    }
  }

  // Phase 9 story: the food budget is nearly used up this month.
  const yesterday = new Date(Math.max(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1).getTime(), daysAgo(1).getTime()));
  rows.push({
    description: "Tea & snacks for the committee meeting",
    category: "Food & refreshments",
    vendor: "Café Coffee Day",
    amountPaise: 190_000,
    spentAt: yesterday,
    status: "APPROVED",
    submittedById: submitters[1].id,
    reviewedById: treasurer.id,
    reviewedAt: yesterday,
    createdAt: yesterday,
  });

  await db.expense.createMany({ data: rows });

  await db.budget.createMany({
    data: [
      { category: "Food & refreshments", monthlyPaise: 200_000 },
      { category: "Printing & stationery", monthlyPaise: 500_000 },
      { category: "Event costs", monthlyPaise: 4_000_000 },
      { category: "Decorations", monthlyPaise: 500_000 },
      { category: "Travel", monthlyPaise: 300_000 },
    ].map((b) => ({ ...b, updatedById: treasurer.id })),
  });

  const reviewed = rows.filter((r) => r.reviewedAt).slice(0, 40);
  await db.auditLog.createMany({
    data: reviewed.map((r) => {
      const reviewer = r.reviewedById === president.id ? president : treasurer;
      return {
        actorId: reviewer.id,
        actorName: reviewer.name,
        action: r.status === "REJECTED" ? "expense.reject" : "expense.approve",
        entityType: "Expense",
        summary: `${r.status === "REJECTED" ? "Rejected" : "Approved"} ₹${(r.amountPaise / 100).toLocaleString("en-IN")} expense "${r.description}"`,
        createdAt: r.reviewedAt as Date,
      };
    }),
  });

  const count = (s: string) => rows.filter((r) => (r.status ?? "PENDING") === s).length;
  return {
    expenses: rows.length,
    waiting: count("PENDING"),
    approved: count("APPROVED"),
    paidBack: count("REIMBURSED"),
    rejected: count("REJECTED"),
    toPayBack: rows.filter((r) => r.status === "APPROVED" && r.needsReimbursement).length,
  };
}
