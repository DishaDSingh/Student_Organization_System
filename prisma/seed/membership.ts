import { addMonths } from "date-fns";
import type { Prisma } from "../../src/generated/prisma/client";
import { runRenewalReminders } from "../../src/lib/membership/reminders";
import { DAY, TODAY, between, daysAgo, faker, type Db } from "./shared";

/**
 * Phase 3 seed: plans, benefits, membership terms with real history,
 * payments with receipts, pass checks at the door, and renewal reminders.
 *
 * Built-in demo stories (relative to today):
 *  - exactly 42 members expire within 7 days   → "42 memberships expire within 7 days"
 *  - ~14 online sign-ups waiting for payment confirmation (some with UPI refs)
 *  - ~48 lapsed members who never renewed
 *  - renewals that chain onto the previous term, so long-time members have 2–3 terms
 */

const BENEFITS = [
  { key: "tickets", title: "Member pricing on event tickets", description: "Up to 40% off the Spring Gala and every ticketed event" },
  { key: "workshops", title: "Free entry to workshops & talks", description: "All skill workshops, guest lectures and panels" },
  { key: "merch", title: "15% off merchandise", description: "Hoodies, tees and accessories from the merch store" },
  { key: "priority", title: "Priority booking for Spring Gala", description: "48-hour early access before public sales open" },
  { key: "voting", title: "Voting rights in council elections", description: "Vote in the annual student council elections" },
  { key: "lounge", title: "Members' lounge access", description: "Student Activity Centre lounge, 9 am – 9 pm" },
  { key: "certificate", title: "Certificate of membership", description: "Digital certificate for your portfolio" },
  { key: "mentoring", title: "Alumni mentoring network", description: "Matched with alumni mentors in your field" },
] as const;

const PLANS = [
  {
    code: "SEMESTER",
    name: "Semester",
    months: 6,
    rupees: 300,
    description: "One semester — good for first-years trying things out",
    benefits: ["tickets", "workshops", "merch", "voting"],
  },
  {
    code: "ANNUAL",
    name: "Annual",
    months: 12,
    rupees: 500,
    description: "Most popular — a full academic year",
    benefits: ["tickets", "workshops", "merch", "priority", "voting", "lounge", "certificate"],
  },
  {
    code: "TWOYEAR",
    name: "Two-Year",
    months: 24,
    rupees: 900,
    description: "Best value — save ₹100 over two annual plans",
    benefits: ["tickets", "workshops", "merch", "priority", "voting", "lounge", "certificate"],
  },
  {
    code: "ALUMNI",
    name: "Alumni Associate",
    months: 12,
    rupees: 750,
    description: "For graduates who want to stay connected",
    benefits: ["tickets", "merch", "mentoring"],
  },
] as const;

type Category = "active" | "expiring7" | "expiring30" | "pending" | "expired" | "cancelled" | "none";
const SUPPORT_ROLE_KEYS = new Set([
  "general_member",
  "committee_member",
  "volunteer",
  "door_lead",
  "social_media_lead",
  "finance_associate",
]);

const endOfDay = (d: Date) => new Date(new Date(d).setHours(23, 59, 59, 999));
const startOfDayDate = (d: Date) => new Date(new Date(d).setHours(0, 0, 0, 0));

export async function seedMembership(db: Db) {
  const org = await db.organization.findFirstOrThrow({ select: { id: true, shortName: true, createdAt: true } });
  await db.organization.update({ where: { id: org.id }, data: { upiId: "hsa-demo@example", allowSelfRegistration: true } });

  // ── Benefits & plans ──
  const benefitIds: Record<string, string> = {};
  for (const [i, b] of BENEFITS.entries()) {
    const row = await db.membershipBenefit.create({
      data: { title: b.title, description: b.description, sortOrder: i, createdAt: org.createdAt },
    });
    benefitIds[b.key] = row.id;
  }
  const plans: Record<string, { id: string; name: string; months: number; paise: number }> = {};
  for (const [i, p] of PLANS.entries()) {
    const row = await db.membershipPlan.create({
      data: {
        code: p.code,
        name: p.name,
        description: p.description,
        durationMonths: p.months,
        pricePaise: p.rupees * 100,
        sortOrder: i,
        createdAt: org.createdAt,
        benefits: { create: p.benefits.map((k) => ({ benefitId: benefitIds[k] })) },
      },
    });
    plans[p.code] = { id: row.id, name: row.name, months: p.months, paise: row.pricePaise };
  }
  const pickPlan = () =>
    plans[
      faker.helpers.weightedArrayElement([
        { weight: 55, value: "ANNUAL" },
        { weight: 25, value: "SEMESTER" },
        { weight: 15, value: "TWOYEAR" },
        { weight: 5, value: "ALUMNI" },
      ])
    ];

  // ── Who's who ──
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isMasterAdmin: true,
      studentId: true,
      createdAt: true,
      roles: { select: { role: { select: { key: true } } } },
    },
  });
  const keysOf = (u: (typeof users)[number]) => u.roles.map((r) => r.role.key);
  const isLeader = (u: (typeof users)[number]) => u.isMasterAdmin || keysOf(u).some((k) => !SUPPORT_ROLE_KEYS.has(k));
  const collectors = users.filter((u) => keysOf(u).some((k) => ["treasurer", "secretary", "finance_associate"].includes(k)));
  const verifiers = users.filter((u) =>
    keysOf(u).some((k) => ["door_lead", "security_head", "event_head", "committee_member"].includes(k)),
  );

  // Leadership are always members in good standing; everyone else is dealt a category.
  const leaders = users.filter(isLeader);
  const rest = faker.helpers.shuffle(users.filter((u) => !isLeader(u)));
  const quota: [Category, number][] = [
    ["expiring7", 42],
    ["expiring30", 26],
    ["pending", 14],
    ["expired", 48],
    ["cancelled", 5],
    ["none", 20],
  ];
  const category = new Map<string, Category>(leaders.map((u) => [u.id, "active"]));
  let cursor = 0;
  for (const [cat, n] of quota) for (let i = 0; i < n && cursor < rest.length; i++) category.set(rest[cursor++].id, cat);
  for (; cursor < rest.length; cursor++) category.set(rest[cursor].id, "active");

  // ── Terms (built backwards from the current one) ──
  type TermRow = Prisma.MembershipCreateManyInput & { id: string };
  const terms: TermRow[] = [];
  const payments: (Omit<Prisma.PaymentCreateManyInput, "receiptNumber"> & { kind: "register" | "renew" })[] = [];
  const firstStart = new Map<string, Date>();

  const addPaidTerm = (userId: string, plan: (typeof plans)[string], startDate: Date, isRenewal: boolean) => {
    const endDate = new Date(addMonths(startDate, plan.months).getTime() - 1);
    const id = faker.string.uuid();
    terms.push({
      id,
      userId,
      planId: plan.id,
      status: "ACTIVE",
      startDate,
      endDate,
      pricePaise: plan.paise,
      isRenewal,
      createdAt: new Date(startDate.getTime() - faker.number.int({ min: 0, max: 6 }) * DAY),
    });
    // Renewals are often paid a few days before the new term starts.
    const paidAt = new Date(
      Math.min(
        TODAY.getTime(),
        startDate.getTime() -
          (isRenewal ? faker.number.int({ min: 0, max: 12 }) : 0) * DAY +
          faker.number.int({ min: 9, max: 18 }) * 3600_000,
      ),
    );
    const method = faker.helpers.weightedArrayElement([
      { weight: 60, value: "UPI" as const },
      { weight: 25, value: "CASH" as const },
      { weight: 8, value: "CARD" as const },
      { weight: 7, value: "BANK_TRANSFER" as const },
    ]);
    const reference =
      method === "UPI"
        ? faker.string.numeric(12)
        : method === "CARD"
          ? `POS${faker.string.numeric(6)}`
          : method === "BANK_TRANSFER"
            ? `NEFT${faker.string.alphanumeric({ length: 10, casing: "upper" })}`
            : null;
    payments.push({
      purpose: "MEMBERSHIP",
      payerId: userId,
      membershipId: id,
      amountPaise: plan.paise,
      method,
      reference,
      receivedById: faker.helpers.arrayElement(collectors).id,
      paidAt,
      kind: isRenewal ? "renew" : "register",
    });
    const prev = firstStart.get(userId);
    if (!prev || startDate < prev) firstStart.set(userId, startDate);
    return { startDate, endDate };
  };

  /** A current term ending on `end`, plus 0–2 earlier terms chained right before it. */
  const buildHistory = (userId: string, plan: (typeof plans)[string], end: Date) => {
    // Term = [start, start + months), so step back from the midnight *after* the intended last day.
    let start = startOfDayDate(addMonths(new Date(endOfDay(end).getTime() + 1), -plan.months));
    const history: { plan: (typeof plans)[string]; start: Date }[] = [{ plan, start }];
    let earlier = faker.helpers.weightedArrayElement([
      { weight: 45, value: 0 },
      { weight: 40, value: 1 },
      { weight: 15, value: 2 },
    ]);
    while (earlier-- > 0) {
      const p = pickPlan();
      const prevStart = startOfDayDate(addMonths(start, -p.months));
      if (prevStart < daysAgo(900)) break;
      history.unshift({ plan: p, start: prevStart });
      start = prevStart;
    }
    history.forEach((h, i) => addPaidTerm(userId, h.plan, h.start, i > 0));
  };

  for (const u of users) {
    const cat = category.get(u.id)!;
    const plan = pickPlan();
    const durationDays = Math.floor(plan.months * 30.4);
    switch (cat) {
      case "active":
        buildHistory(u.id, plan, endOfDay(new Date(TODAY.getTime() + faker.number.int({ min: 31, max: durationDays - 2 }) * DAY)));
        break;
      case "expiring7":
        buildHistory(u.id, plan, endOfDay(new Date(TODAY.getTime() + faker.number.int({ min: 0, max: 6 }) * DAY)));
        break;
      case "expiring30":
        buildHistory(u.id, plan, endOfDay(new Date(TODAY.getTime() + faker.number.int({ min: 8, max: 29 }) * DAY)));
        break;
      case "expired":
        buildHistory(u.id, plan, endOfDay(daysAgo(faker.number.int({ min: 1, max: 320 }))));
        break;
      case "pending": {
        // Half are lapsed members renewing; half are brand-new online sign-ups.
        if (faker.datatype.boolean()) buildHistory(u.id, pickPlan(), endOfDay(daysAgo(faker.number.int({ min: 1, max: 120 }))));
        terms.push({
          id: faker.string.uuid(),
          userId: u.id,
          planId: plan.id,
          status: "PENDING_PAYMENT",
          pricePaise: plan.paise,
          claimedReference: faker.datatype.boolean(0.65) ? faker.string.numeric(12) : null,
          createdAt: between(12, 0),
        });
        break;
      }
      case "cancelled":
        terms.push({
          id: faker.string.uuid(),
          userId: u.id,
          planId: plan.id,
          status: "CANCELLED",
          pricePaise: plan.paise,
          cancelledReason: faker.helpers.arrayElement([
            "Duplicate registration",
            "Payment never received",
            "Transferred to another college",
          ]),
          createdAt: between(200, 20),
        });
        break;
      case "none":
        break;
    }
  }

  await db.membership.createMany({ data: terms });

  // ── Member numbers in joining order, pass tokens for everyone who ever paid ──
  const ordered = [...firstStart.entries()].sort((a, b) => a[1].getTime() - b[1].getTime());
  for (const [i, [userId]] of ordered.entries()) {
    await db.user.update({
      where: { id: userId },
      data: { memberNumber: `${org.shortName}-${String(i + 1).padStart(5, "0")}`, passToken: faker.string.alphanumeric(24) },
    });
  }

  // Programme details for a realistic member directory.
  const PROGRAMS = [
    "B.Tech Computer Engineering",
    "B.Tech Information Technology",
    "B.Tech Electronics",
    "B.Tech Mechanical",
    "B.Tech Civil",
    "B.Tech Electrical",
    "B.Tech Biotechnology",
    "MBA",
  ];
  for (const u of users) {
    if (!u.studentId) continue;
    const branch = u.studentId.slice(5, 7);
    const program = {
      CS: PROGRAMS[0],
      IT: PROGRAMS[1],
      EC: PROGRAMS[2],
      ME: PROGRAMS[3],
      CE: PROGRAMS[4],
      EE: PROGRAMS[5],
      BT: PROGRAMS[6],
      MB: PROGRAMS[7],
    }[branch];
    const joinedYear = 2000 + Number(u.studentId.slice(3, 5));
    await db.user.update({
      where: { id: u.id },
      data: { program, yearOfStudy: Math.min(4, Math.max(1, TODAY.getFullYear() - joinedYear + (TODAY.getMonth() >= 6 ? 1 : 0))) },
    });
  }

  // ── Payments with receipts numbered per year in time order ──
  payments.sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
  const perYear = new Map<number, number>();
  const paymentRows = payments.map(({ kind: _kind, ...p }) => {
    const y = (p.paidAt as Date).getFullYear();
    const n = (perYear.get(y) ?? 0) + 1;
    perYear.set(y, n);
    return { ...p, receiptNumber: `RCP-${y}-${String(n).padStart(5, "0")}` };
  });
  await db.payment.createMany({ data: paymentRows });

  // ── Audit trail for the money and the requests ──
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const planById = new Map(Object.values(plans).map((p) => [p.id, p]));
  const termById = new Map(terms.map((t) => [t.id, t]));
  const audits: Prisma.AuditLogCreateManyInput[] = payments.map((p, i) => {
    const t = termById.get(p.membershipId as string)!;
    const plan = planById.get(t.planId)!;
    const receipt = paymentRows[i].receiptNumber;
    return {
      actorId: p.receivedById,
      actorName: nameOf.get(p.receivedById as string)!,
      action: p.kind === "renew" ? "member.renew" : "member.payment.confirm",
      entityType: "Member",
      entityId: p.payerId,
      summary: `${p.kind === "renew" ? "Renewed" : "Confirmed dues for"} ${nameOf.get(p.payerId as string)} — ${plan.name}, ₹${p.amountPaise / 100} by ${p.method === "BANK_TRANSFER" ? "bank transfer" : p.method.toLowerCase()}, receipt ${receipt}`,
      after: { receipt, method: p.method, reference: p.reference ?? null },
      createdAt: p.paidAt,
    };
  });
  for (const t of terms.filter((t) => t.status === "PENDING_PAYMENT")) {
    audits.push({
      actorId: t.userId,
      actorName: nameOf.get(t.userId)!,
      action: "member.request",
      entityType: "Member",
      entityId: t.userId,
      summary: `${nameOf.get(t.userId)} requested ${planById.get(t.planId)!.name} membership${t.claimedReference ? ` with payment reference ${t.claimedReference}` : ""}`,
      createdAt: t.createdAt,
    });
  }
  await db.auditLog.createMany({ data: audits });

  // ── Door checks over the last two months ──
  const holders = [...firstStart.keys()];
  const checks = Array.from({ length: 140 }, () => {
    const memberId = faker.helpers.arrayElement(holders);
    const cat = category.get(memberId)!;
    return {
      memberId,
      verifiedById: faker.helpers.arrayElement(verifiers).id,
      result: cat === "expired" ? ("EXPIRED" as const) : cat === "pending" ? ("PENDING" as const) : ("VALID" as const),
      method: faker.helpers.weightedArrayElement([
        { weight: 8, value: "scan" },
        { weight: 2, value: "manual" },
      ]),
      createdAt: between(60, 0),
    };
  });
  await db.passVerification.createMany({ data: checks });

  // ── Notifications: confirmations for recent payments, then the reminder job itself ──
  await db.notification.createMany({
    data: payments
      .filter((p) => (p.paidAt as Date) > daysAgo(21))
      .map((p) => ({
        userId: p.payerId as string,
        type: "membership.activated",
        title: "Membership confirmed",
        body: `We received your ₹${p.amountPaise / 100} dues. Thanks for being a member!`,
        link: "/me/pass",
        createdAt: p.paidAt,
        readAt: faker.datatype.boolean(0.6) ? new Date() : null,
      })),
  });
  const reminders = await runRenewalReminders(db, TODAY);

  const counts = Object.fromEntries(quota.map(([c]) => [c, [...category.values()].filter((v) => v === c).length]));
  return {
    plans: PLANS.length,
    benefits: BENEFITS.length,
    terms: terms.length,
    payments: payments.length,
    duesCollected: `₹${(payments.reduce((s, p) => s + (p.amountPaise as number), 0) / 100).toLocaleString("en-IN")}`,
    members: firstStart.size,
    expiringIn7Days: counts.expiring7,
    pending: counts.pending,
    lapsed: counts.expired,
    passChecks: checks.length,
    reminders,
  };
}
