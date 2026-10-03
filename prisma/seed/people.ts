import bcrypt from "bcryptjs";
import type { Prisma } from "../../src/generated/prisma/client";
import { syncPermissionCatalog, ensurePresetRoles } from "../../src/lib/rbac/sync";
import { DEMO_PASSWORD, EMAIL_DOMAIN, TODAY, between, bySize, daysAgo, daysFromNow, faker, type Db } from "./shared";

/**
 * Phase 1–2 seed: organization, departments, ~420 people with roles,
 * custom roles, per-user overrides, committees and the audit trail that
 * would have been produced by creating all of it through the app.
 */

const DEPARTMENTS = [
  { code: "FIN", name: "Finance", description: "Dues, budgets, expenses and reimbursements" },
  { code: "EVT", name: "Events", description: "Planning and running every event, from Spring Gala to workshops" },
  { code: "MER", name: "Merchandise", description: "Hoodies, tees and the merch studio" },
  { code: "VOL", name: "Volunteers & Outreach", description: "Volunteer roster, shifts and community outreach" },
  { code: "COM", name: "Communication", description: "Announcements, social media and the calendar" },
  { code: "SEC", name: "Security", description: "Event safety, door control and CCTV" },
  { code: "OPS", name: "Operations", description: "Logistics, vendors, venues and supplies" },
  { code: "FUN", name: "Fundraising", description: "Sponsorships, donation drives and fundraisers" },
] as const;

/** Named leadership personas — stable emails so the team can demo each dashboard. */
const LEADERSHIP = [
  { email: "admin", name: "Aarav Mehta", roles: ["general_member"], master: true, dept: "OPS" },
  { email: "president", name: "Ishita Sharma", roles: ["president", "general_member"], dept: "OPS" },
  { email: "vp", name: "Kabir Malhotra", roles: ["vice_president", "general_member"], dept: "EVT" },
  { email: "treasurer", name: "Priya Nair", roles: ["treasurer", "general_member"], dept: "FIN" },
  { email: "secretary", name: "Rohan Deshpande", roles: ["secretary", "general_member"], dept: "COM" },
  { email: "events", name: "Ananya Iyer", roles: ["event_head", "general_member"], dept: "EVT" },
  { email: "volunteers", name: "Vikram Rao", roles: ["volunteer_head", "general_member"], dept: "VOL" },
  { email: "merch", name: "Sneha Kulkarni", roles: ["merchandise_manager", "general_member"], dept: "MER" },
  { email: "comms", name: "Aditya Joshi", roles: ["communication_manager", "general_member"], dept: "COM" },
  { email: "security", name: "Meera Pillai", roles: ["security_head", "general_member"], dept: "SEC" },
  { email: "deputy.events", name: "Arjun Bhatia", roles: ["event_head", "general_member"], dept: "EVT" },
  { email: "fundraising", name: "Diya Chatterjee", roles: ["committee_member", "general_member"], dept: "FUN" },
];

const CUSTOM_ROLES = [
  {
    key: "finance_associate",
    name: "Finance Associate",
    description: "Helps the Treasurer record income and file expenses. Cannot approve.",
    color: "emerald",
    rank: 35,
    permissions: ["finance.view", "finance.record_income", "finance.create_expense", "members.view", "reports.view"],
  },
  {
    key: "social_media_lead",
    name: "Social Media Lead",
    description: "Drafts announcements and promotes events. Publishing stays with Communication.",
    color: "sky",
    rank: 82,
    permissions: ["announcements.view", "announcements.create", "events.view", "calendar.view", "ai.use"],
  },
  {
    key: "door_lead",
    name: "Door Lead",
    description: "Runs entry at events: check-in, door sales and pass verification.",
    color: "orange",
    rank: 88,
    permissions: ["tickets.checkin", "tickets.sell", "tickets.view", "members.verify", "events.view"],
  },
];

const COMMITTEES = [
  {
    name: "Spring Gala Committee 2026",
    dept: "EVT",
    start: 150,
    end: -45,
    active: true,
    desc: "Plans this year's Spring Gala: venue, tickets, performances and décor.",
  },
  {
    name: "Spring Gala Committee 2025",
    dept: "EVT",
    start: 520,
    end: 330,
    active: false,
    desc: "Last year's gala committee. Kept for history and lessons learned.",
  },
  {
    name: "Fundraising Committee",
    dept: "FUN",
    start: 240,
    end: -120,
    active: true,
    desc: "Bake sales, sponsorship drives and the annual charity run.",
  },
  {
    name: "Merchandise Committee",
    dept: "MER",
    start: 200,
    end: -160,
    active: true,
    desc: "Designs, sizes and orders for hoodies, tees and accessories.",
  },
  {
    name: "Orientation Committee",
    dept: "OPS",
    start: 120,
    end: 60,
    active: false,
    desc: "Freshers' orientation week and the membership drive.",
  },
  { name: "Tech Fest Committee", dept: "EVT", start: 90, end: -75, active: true, desc: "Hackathon, workshops and the project expo." },
  { name: "Cultural Night Committee", dept: "EVT", start: 60, end: -30, active: true, desc: "Music, dance and drama showcase." },
  { name: "Outreach Committee", dept: "VOL", start: 300, end: -60, active: true, desc: "Community service drives and NGO partnerships." },
  { name: "Sports Meet Committee", dept: "OPS", start: 100, end: -90, active: true, desc: "Inter-college sports meet logistics." },
  {
    name: "Alumni Relations Committee",
    dept: "COM",
    start: 280,
    end: -80,
    active: true,
    desc: "Alumni mentoring, newsletters and the homecoming event.",
  },
] as const;

const BRANCHES = ["CS", "IT", "EC", "ME", "CE", "EE", "BT", "MB"];

export async function seedPeople(db: Db) {
  await syncPermissionCatalog(db);
  await ensurePresetRoles(db);

  const org = await db.organization.create({
    data: {
      name: "Horizon Student Association",
      shortName: "HSA",
      institution: "Horizon Institute of Technology, Mumbai",
      description: "The student body of Horizon Institute — events, clubs, welfare and the annual Spring Gala.",
      email: `council@${EMAIL_DOMAIN}`,
      phone: "+919820012345",
      website: "https://hsa.horizon.test",
      address: "Student Activity Centre, Horizon Institute of Technology, Powai, Mumbai 400076",
      academicYearStart: 7,
      createdAt: daysAgo(540),
    },
  });

  // ── Custom roles ──
  for (const r of CUSTOM_ROLES) {
    await db.role.create({
      data: {
        key: r.key,
        name: r.name,
        description: r.description,
        color: r.color,
        rank: r.rank,
        isSystem: false,
        createdAt: daysAgo(400),
        permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) },
      },
    });
  }
  const roles = Object.fromEntries((await db.role.findMany({ select: { key: true, id: true, name: true } })).map((r) => [r.key, r]));

  // ── Departments (heads assigned after users exist) ──
  const depts: Record<string, { id: string; name: string }> = {};
  for (const d of DEPARTMENTS) {
    depts[d.code] = await db.department.create({ data: { ...d, createdAt: daysAgo(530) }, select: { id: true, name: true } });
  }

  // ── People ──
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const usedEmails = new Set<string>();
  const usedNames = new Set<string>(LEADERSHIP.map((l) => l.name));
  let rollSeq = 1;

  const makeStudent = (deptCode?: string) => {
    let first: string, last: string, name: string;
    do {
      first = faker.person.firstName();
      last = faker.person.lastName();
      name = `${first} ${last}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    let local = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    while (usedEmails.has(local)) local = `${local}${faker.number.int({ min: 1, max: 99 })}`;
    usedEmails.add(local);

    const year = faker.helpers.arrayElement([22, 23, 24, 25, 26]);
    return {
      name,
      email: `${local}@${EMAIL_DOMAIN}`,
      phone: `+91${faker.helpers.arrayElement(["98", "99", "97", "88", "77", "70", "93"])}${faker.string.numeric(8)}`,
      studentId: `HIT${year}${faker.helpers.arrayElement(BRANCHES)}${String(rollSeq++).padStart(3, "0")}`,
      departmentId: deptCode ? depts[deptCode].id : null,
      passwordHash,
      createdAt: between(500, 5),
    };
  };

  type Seeded = { id: string; name: string; group: string; roleKeys: string[]; createdAt: Date };
  const people: Seeded[] = [];

  // Leadership
  for (const l of LEADERSHIP) {
    const u = await db.user.create({
      data: {
        name: l.name,
        email: `${l.email}@${EMAIL_DOMAIN}`,
        phone: `+9198${faker.string.numeric(8)}`,
        studentId: `HIT23${faker.helpers.arrayElement(BRANCHES)}${String(rollSeq++).padStart(3, "0")}`,
        passwordHash,
        isMasterAdmin: !!l.master,
        departmentId: depts[l.dept].id,
        createdAt: l.master ? daysAgo(540) : between(520, 400),
        lastLoginAt: between(3, 0),
      },
    });
    people.push({ id: u.id, name: u.name, group: "leadership", roleKeys: l.roles, createdAt: u.createdAt });
  }

  // Bulk groups: committee members (55), volunteers (65), general members (300)
  const groups = [
    { group: "committee", count: bySize(50, 55), roleKeys: ["committee_member", "general_member"], withDept: true },
    { group: "volunteer", count: bySize(50, 65), roleKeys: ["volunteer", "general_member"], withDept: true },
    { group: "member", count: bySize(60, 300), roleKeys: ["general_member"], withDept: false },
  ];
  const deptCodes = DEPARTMENTS.map((d) => d.code);

  for (const g of groups) {
    const rows = Array.from({ length: g.count }, () => {
      const s = makeStudent(g.withDept ? faker.helpers.arrayElement(deptCodes) : undefined);
      // Mostly active; some invited (never logged in) and a few suspended.
      const roll = faker.number.float();
      const status = roll < 0.04 ? ("SUSPENDED" as const) : roll < 0.09 ? ("INVITED" as const) : ("ACTIVE" as const);
      return {
        ...s,
        status,
        lastLoginAt: status === "ACTIVE" && faker.datatype.boolean(0.8) ? between(60, 0) : null,
      };
    });
    const created = await db.user.createManyAndReturn({ data: rows, select: { id: true, name: true, createdAt: true } });
    for (const u of created) people.push({ id: u.id, name: u.name, group: g.group, roleKeys: [...g.roleKeys], createdAt: u.createdAt });
  }

  // Custom roles go to some committee members / volunteers.
  const committeePeople = people.filter((p) => p.group === "committee");
  const volunteerPeople = people.filter((p) => p.group === "volunteer");
  committeePeople.slice(0, 4).forEach((p) => p.roleKeys.push("finance_associate"));
  committeePeople.slice(4, 7).forEach((p) => p.roleKeys.push("social_media_lead"));
  volunteerPeople.slice(0, 8).forEach((p) => p.roleKeys.push("door_lead"));

  const admin = people[0];
  const secretary = people.find((p) => p.name === "Rohan Deshpande")!;

  await db.userRole.createMany({
    data: people.flatMap((p) =>
      p.roleKeys.map((k) => ({
        userId: p.id,
        roleId: roles[k].id,
        assignedById: p.group === "leadership" ? admin.id : faker.helpers.arrayElement([admin.id, secretary.id]),
        assignedAt: p.createdAt,
      })),
    ),
  });

  // ── Department heads ──
  const headByDept: Record<string, string> = {
    FIN: "Priya Nair",
    EVT: "Ananya Iyer",
    MER: "Sneha Kulkarni",
    VOL: "Vikram Rao",
    COM: "Aditya Joshi",
    SEC: "Meera Pillai",
    OPS: "Ishita Sharma",
    FUN: "Diya Chatterjee",
  };
  for (const [code, headName] of Object.entries(headByDept)) {
    await db.department.update({ where: { id: depts[code].id }, data: { headId: people.find((p) => p.name === headName)!.id } });
  }

  // ── Per-user overrides (the "exceptions" layer) ──
  const byName = (n: string) => people.find((p) => p.name === n)!;
  const overrides = [
    { user: byName("Kabir Malhotra"), key: "finance.view", effect: "GRANT", reason: "Reviewing Spring Gala budget this term" },
    {
      user: byName("Ishita Sharma"),
      key: "finance.approve_expense",
      effect: "GRANT",
      reason: "Backup approver while Treasurer is on exchange (Nov)",
    },
    {
      user: byName("Ananya Iyer"),
      key: "tickets.refund",
      effect: "DENY",
      reason: "Refunds go through Treasurer after the 2025 refund mix-up",
    },
    { user: byName("Arjun Bhatia"), key: "events.cancel", effect: "DENY", reason: "Deputy — cancellations need the Event Head" },
    { user: byName("Diya Chatterjee"), key: "fundraisers.manage", effect: "GRANT", reason: "Leads the Fundraising Committee" },
    { user: byName("Diya Chatterjee"), key: "finance.record_income", effect: "GRANT", reason: "Records donation-drive collections" },
    { user: committeePeople[10], key: "finance.create_expense", effect: "DENY", reason: "Pending audit of an unreceipted claim" },
    { user: volunteerPeople[12], key: "cctv.view", effect: "GRANT", reason: "Control-room assistant for Spring Gala night" },
    { user: committeePeople[15], key: "announcements.create", effect: "GRANT", reason: "Writes the weekly newsletter" },
  ] as const;
  await db.userPermission.createMany({
    data: overrides.map((o) => ({
      userId: o.user.id,
      permissionKey: o.key,
      effect: o.effect,
      reason: o.reason,
      grantedById: admin.id,
      createdAt: between(120, 2),
    })),
  });

  // ── Committees ──
  const committeeIds: { id: string; name: string }[] = [];
  const chairPool = [
    byName("Ananya Iyer"),
    byName("Kabir Malhotra"),
    byName("Diya Chatterjee"),
    byName("Sneha Kulkarni"),
    byName("Rohan Deshpande"),
    byName("Arjun Bhatia"),
    byName("Aditya Joshi"),
    byName("Vikram Rao"),
    ...committeePeople.slice(20, 22),
  ];
  for (const [i, c] of COMMITTEES.entries()) {
    const committee = await db.committee.create({
      data: {
        name: c.name,
        description: c.desc,
        departmentId: depts[c.dept].id,
        chairId: chairPool[i].id,
        termStart: daysAgo(c.start),
        termEnd: c.end < 0 ? daysFromNow(-c.end) : daysAgo(c.end),
        isActive: c.active,
        createdAt: daysAgo(c.start + 5),
      },
    });
    committeeIds.push({ id: committee.id, name: committee.name });
  }

  // Every committee member sits on 1–2 committees; volunteers occasionally join one.
  const memberships = new Map<string, { committeeId: string; userId: string; position: string; joinedAt: Date }>();
  const addMembership = (committeeId: string, userId: string, position: string) => {
    const k = `${committeeId}:${userId}`;
    if (!memberships.has(k)) memberships.set(k, { committeeId, userId, position, joinedAt: between(300, 10) });
  };
  committeeIds.forEach((c, i) => addMembership(c.id, chairPool[i].id, "Chair"));
  for (const p of committeePeople) {
    for (const c of faker.helpers.arrayElements(committeeIds, faker.number.int({ min: 1, max: 2 }))) {
      addMembership(
        c.id,
        p.id,
        faker.helpers.weightedArrayElement([
          { weight: 7, value: "Member" },
          { weight: 2, value: "Coordinator" },
          { weight: 1, value: "Co-chair" },
        ]),
      );
    }
  }
  for (const p of faker.helpers.arrayElements(volunteerPeople, 20)) {
    addMembership(faker.helpers.arrayElement(committeeIds).id, p.id, "Volunteer Lead");
  }
  await db.committeeMember.createMany({ data: [...memberships.values()] });

  // ── Audit trail that the above would have produced ──
  const auditRows: Prisma.AuditLogCreateManyInput[] = [
    {
      actorId: admin.id,
      actorName: admin.name,
      action: "organization.create",
      entityType: "Organization",
      entityId: org.id,
      summary: `Created organization "${org.name}"`,
      createdAt: daysAgo(540),
    },
    ...CUSTOM_ROLES.map((r) => ({
      actorId: admin.id,
      actorName: admin.name,
      action: "role.create",
      entityType: "Role",
      entityId: roles[r.key].id,
      summary: `Created custom role "${r.name}" with ${r.permissions.length} permissions`,
      after: { name: r.name, permissions: r.permissions },
      createdAt: daysAgo(400),
    })),
    ...people.slice(1).map((p) => {
      const actor = p.group === "leadership" ? admin : faker.helpers.arrayElement([admin, secretary]);
      return {
        actorId: actor.id,
        actorName: actor.name,
        action: "user.create",
        entityType: "User",
        entityId: p.id,
        summary: `Created account for ${p.name} with roles: ${p.roleKeys.map((k) => roles[k].name).join(", ")}`,
        createdAt: p.createdAt,
        ip: `10.20.${faker.number.int({ min: 1, max: 9 })}.${faker.number.int({ min: 2, max: 250 })}`,
      };
    }),
    ...overrides.map((o) => ({
      actorId: admin.id,
      actorName: admin.name,
      action: `user.permission.${o.effect.toLowerCase()}`,
      entityType: "User",
      entityId: o.user.id,
      summary: `${o.effect === "GRANT" ? "Granted" : "Denied"} "${o.key}" for ${o.user.name} — ${o.reason}`,
      after: { permissionKey: o.key, effect: o.effect, reason: o.reason },
      createdAt: between(120, 2),
    })),
    {
      actorId: admin.id,
      actorName: admin.name,
      action: "role.permissions.update",
      entityType: "Role",
      entityId: roles.event_head.id,
      summary: "Updated Event Head permissions (+tickets.refund)",
      before: { added: [] },
      after: { added: ["tickets.refund"] },
      createdAt: daysAgo(200),
    },
    {
      actorId: admin.id,
      actorName: admin.name,
      action: "role.permissions.update",
      entityType: "Role",
      entityId: roles.president.id,
      summary: "Updated President permissions (−cctv.view)",
      before: { removed: [] },
      after: { removed: ["cctv.view"] },
      createdAt: daysAgo(180),
    },
  ];
  const suspended = await db.user.findMany({ where: { status: "SUSPENDED" }, select: { id: true, name: true } });
  for (const s of suspended) {
    auditRows.push({
      actorId: secretary.id,
      actorName: secretary.name,
      action: "user.status.update",
      entityType: "User",
      entityId: s.id,
      summary: `Suspended ${s.name}`,
      before: { status: "ACTIVE" },
      after: { status: "SUSPENDED" },
      createdAt: between(90, 1),
    });
  }
  for (const p of faker.helpers.arrayElements(
    people.filter((x) => x.group === "leadership"),
    12,
  )) {
    for (let i = 0; i < 4; i++) {
      auditRows.push({
        actorId: p.id,
        actorName: p.name,
        action: "auth.login",
        entityType: "User",
        entityId: p.id,
        summary: `${p.name} signed in`,
        ip: `10.20.1.${faker.number.int({ min: 2, max: 250 })}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0",
        createdAt: between(30, 0),
      });
    }
  }
  await db.auditLog.createMany({ data: auditRows });

  return {
    users: people.length,
    roles: Object.keys(roles).length,
    departments: DEPARTMENTS.length,
    committees: COMMITTEES.length,
    committeeMemberships: memberships.size,
    overrides: overrides.length,
    auditLogs: auditRows.length,
    asOf: TODAY.toISOString().slice(0, 10),
  };
}
