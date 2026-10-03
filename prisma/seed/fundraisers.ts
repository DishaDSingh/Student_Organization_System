import type { Prisma } from "../../src/generated/prisma/client";
import { SKILLS, SLOTS } from "../../src/lib/volunteers/rules";
import { DAY, TODAY, between, bySize, daysAgo, faker, type Db } from "./shared";

/**
 * Phase 6 seed: volunteer profiles, fundraisers, tasks and donations.
 * Story: "Winter Clothes Drive" is behind on its goal with two overdue tasks.
 */

const FUNDRAISERS = [
  {
    title: "Charity Bake Sale for Akshaya Patra",
    cause: "Charity",
    goal: 25000,
    start: -40,
    end: 10,
    raised: 0.72,
    tasks: [
      "Bake 40 brownies",
      "Design posters",
      "Book the foyer stall",
      "Collect donations box",
      "Post on Instagram",
      "Count & deposit cash",
      "Buy paper plates",
      "Thank-you notes to bakers",
    ],
  },
  {
    title: "Winter Clothes Drive",
    cause: "Community",
    goal: 40000,
    start: -25,
    end: 6,
    raised: 0.31,
    tasks: [
      "Set up collection points",
      "Sort donated clothes",
      "Contact NGO for pickup",
      "Social media campaign",
      "Hostel-wise announcements",
      "Arrange transport",
      "Write press note",
      "Volunteer roster for sorting day",
    ],
  },
  {
    title: "Tree Plantation Drive",
    cause: "Environment",
    goal: 18000,
    start: -120,
    end: -90,
    raised: 1.08,
    tasks: ["Buy saplings", "Permission from estate office", "Plant along the east wall", "Watering roster", "Photo story for newsletter"],
  },
  {
    title: "Library Book Fund",
    cause: "Education",
    goal: 50000,
    start: -60,
    end: 45,
    raised: 0.46,
    tasks: ["List of books from faculty", "Alumni email appeal", "Book-fair stall", "Track pledges", "Thank-you wall"],
  },
  {
    title: "Blood Donation Camp Support",
    cause: "Health",
    goal: 15000,
    start: -200,
    end: -185,
    raised: 0.94,
    tasks: [
      "Coordinate with blood bank",
      "Refreshments for donors",
      "Registration desk",
      "First aid volunteers",
      "Certificates for donors",
    ],
  },
  {
    title: "Annual Charity Run",
    cause: "Charity",
    goal: 80000,
    start: -10,
    end: 40,
    raised: 0.18,
    tasks: [
      "Route permission",
      "Sponsor outreach",
      "T-shirt sizes form",
      "Water stations plan",
      "Medical team",
      "Timing chips vendor",
      "Registration page",
      "Volunteer marshals",
    ],
  },
  {
    title: "Club Equipment Fund",
    cause: "Club funds",
    goal: 30000,
    start: -300,
    end: -250,
    raised: 1.0,
    tasks: ["Quote from vendors", "Approval from treasurer", "Order equipment", "Inventory tags"],
  },
  {
    title: "Flood Relief Collection",
    cause: "Community",
    goal: 100000,
    start: -400,
    end: -370,
    raised: 1.21,
    tasks: ["Collection boxes", "UPI QR posters", "Daily tally", "Hand over to Red Cross", "Publish final report"],
  },
];

export async function seedFundraisers(db: Db) {
  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, roles: { select: { role: { select: { key: true } } } } },
  });
  const hasRole = (u: (typeof users)[number], ...k: string[]) => u.roles.some((r) => k.includes(r.role.key));
  const volunteers = users.filter((u) => hasRole(u, "volunteer", "committee_member", "door_lead", "social_media_lead"));
  const leads = users.filter((u) => hasRole(u, "volunteer_head", "committee_member", "president", "vice_president"));
  const collectors = users.filter((u) => hasRole(u, "treasurer", "finance_associate", "volunteer_head"));
  const head = users.find((u) => hasRole(u, "volunteer_head")) ?? leads[0];

  // ── Volunteer profiles ──
  const profiles = volunteers.slice(0, bySize(60, 110));
  await db.volunteerProfile.createMany({
    data: profiles.map((u) => ({
      userId: u.id,
      skills: faker.helpers.arrayElements([...SKILLS], { min: 2, max: 5 }),
      interests: faker.helpers.arrayElements(
        ["Galas & parties", "Cultural", "Tech", "Sports", "Charity", "Environment", "Workshops", "Food"],
        { min: 1, max: 3 },
      ),
      availability: faker.helpers.arrayElements(
        SLOTS.map((s) => s.key),
        { min: 2, max: 4 },
      ),
      maxHoursPerWeek: faker.helpers.arrayElement([3, 4, 5, 6, 8, 10]),
      createdAt: between(400, 20),
    })),
  });

  // ── Fundraisers, tasks, donations ──
  const tasks: Prisma.TaskCreateManyInput[] = [];
  const donations: Omit<Prisma.PaymentCreateManyInput, "receiptNumber">[] = [];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const now = new Date();

  for (const spec of FUNDRAISERS.slice(0, bySize(6, 8))) {
    const lead = faker.helpers.arrayElement(leads);
    const startsAt = new Date(TODAY.getTime() + spec.start * DAY);
    const endsAt = new Date(TODAY.getTime() + spec.end * DAY + DAY - 1);
    const ended = spec.end < 0;
    const f = await db.fundraiser.create({
      data: {
        title: spec.title,
        cause: spec.cause,
        description: `Raising ${spec.goal.toLocaleString("en-IN")} rupees for ${spec.cause.toLowerCase()} — every rupee is receipted and reported.`,
        goalPaise: spec.goal * 100,
        startsAt,
        endsAt,
        status: ended ? "COMPLETED" : "ACTIVE",
        leadId: lead.id,
        createdById: head.id,
        createdAt: new Date(startsAt.getTime() - 7 * DAY),
      },
    });
    audits.push({
      actorId: head.id,
      actorName: head.name,
      action: "fundraiser.create",
      entityType: "Fundraiser",
      entityId: f.id,
      summary: `Created fundraiser "${f.title}" — goal ₹${spec.goal.toLocaleString("en-IN")}`,
      createdAt: f.createdAt,
    });

    // Every fundraiser also needs these.
    const allTasks = [...spec.tasks, "Volunteer briefing", "Update the progress board", "Share final numbers with members"];
    for (const [i, title] of allTasks.entries()) {
      const due = new Date(startsAt.getTime() + ((i + 1) / (allTasks.length + 1)) * (endsAt.getTime() - startsAt.getTime()));
      // Past-due work is mostly done; the story fundraiser has two overdue tasks.
      const story = spec.title === "Winter Clothes Drive" && (i === 1 || i === 2);
      const done = !story && (ended || due < now || faker.datatype.boolean(0.15));
      const assignee = faker.datatype.boolean(0.85) ? faker.helpers.arrayElement(profiles) : null;
      const est = faker.helpers.arrayElement([1, 2, 2, 3, 4]);
      tasks.push({
        title,
        fundraiserId: f.id,
        assigneeId: assignee?.id ?? null,
        createdById: lead.id,
        status: done ? "DONE" : due < now ? "IN_PROGRESS" : faker.helpers.arrayElement(["TODO", "TODO", "IN_PROGRESS"]),
        priority: story ? "HIGH" : faker.helpers.arrayElement(["LOW", "MEDIUM", "MEDIUM", "HIGH"]),
        requiredSkills: faker.helpers.arrayElements([...SKILLS], { min: 0, max: 1 }),
        dueAt: story ? daysAgo(i) : due,
        estimatedHours: est,
        loggedHours: done ? est + faker.helpers.arrayElement([-0.5, 0, 0, 1]) : 0,
        completedAt: done ? new Date(Math.min(now.getTime(), due.getTime())) : null,
        createdAt: new Date(startsAt.getTime() - 2 * DAY),
      });
    }

    // Donations add up to roughly the target share of the goal.
    let total = 0;
    const target = spec.goal * 100 * spec.raised;
    const lastDay = Math.min(now.getTime(), endsAt.getTime());
    while (total < target) {
      const amount = faker.helpers.arrayElement([100, 200, 250, 500, 500, 1000, 1000, 2000, 2500, 5000]) * 100;
      const member = faker.datatype.boolean(0.55) ? faker.helpers.arrayElement(users) : null;
      const anonymous = !member && faker.datatype.boolean(0.3);
      const method = faker.helpers.weightedArrayElement([
        { weight: 6, value: "UPI" as const },
        { weight: 3, value: "CASH" as const },
        { weight: 1, value: "BANK_TRANSFER" as const },
      ]);
      donations.push({
        purpose: "DONATION",
        payerId: member?.id ?? null,
        fundraiserId: f.id,
        amountPaise: amount,
        method,
        reference: method === "CASH" ? null : faker.string.numeric(12),
        receivedById: faker.helpers.arrayElement(collectors).id,
        paidAt: new Date(startsAt.getTime() + faker.number.float() * (lastDay - startsAt.getTime())),
        notes: anonymous ? null : member ? null : `Donor: ${faker.person.fullName()}`,
      });
      total += amount;
    }
  }
  await db.task.createMany({ data: tasks });

  // Receipts continue each year's sequence.
  const lastByYear = new Map<number, number>();
  for (const p of await db.payment.findMany({ select: { receiptNumber: true } })) {
    const [, y, n] = p.receiptNumber.split("-");
    lastByYear.set(Number(y), Math.max(lastByYear.get(Number(y)) ?? 0, Number(n)));
  }
  donations.sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
  await db.payment.createMany({
    data: donations.map((p) => {
      const y = (p.paidAt as Date).getFullYear();
      const n = (lastByYear.get(y) ?? 0) + 1;
      lastByYear.set(y, n);
      return { ...p, receiptNumber: `RCP-${y}-${String(n).padStart(5, "0")}` };
    }),
  });
  await db.auditLog.createMany({ data: audits });

  return {
    volunteerProfiles: profiles.length,
    fundraisers: bySize(6, 8),
    tasks: tasks.length,
    overdueTasks: tasks.filter((t) => t.status !== "DONE" && t.dueAt && (t.dueAt as Date) < now).length,
    donations: donations.length,
    raised: `₹${(donations.reduce((s, d) => s + (d.amountPaise as number), 0) / 100).toLocaleString("en-IN")}`,
  };
}
