import { allOf, type PermissionKey } from "./catalog";

/**
 * Default roles created by the setup wizard and the seed.
 * They are starting points: the Master Admin can re-permission any of them
 * and add custom roles. Note what is *missing* — e.g. no preset except
 * Security Head gets CCTV, and only the Treasurer approves expenses.
 *
 * Self-service (a member seeing their own pass, tickets, orders) does not
 * need a permission; these keys cover acting on other people's data.
 */
export type RolePreset = {
  key: string;
  name: string;
  description: string;
  color: RoleColor;
  rank: number;
  permissions: PermissionKey[];
};

export const ROLE_COLORS = ["indigo", "violet", "emerald", "amber", "rose", "sky", "teal", "orange", "slate"] as const;
export type RoleColor = (typeof ROLE_COLORS)[number];

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: "president",
    name: "President",
    description: "Leads the organization. Broad visibility, no finance approval or CCTV.",
    color: "indigo",
    rank: 10,
    permissions: [
      "organization.view",
      "users.view",
      "roles.view",
      ...allOf("departments"),
      ...allOf("committees"),
      "members.view",
      "members.verify",
      "events.view",
      "events.publish",
      "events.cancel",
      "tickets.view",
      "finance.view",
      "merchandise.view",
      "volunteers.view",
      "fundraisers.view",
      ...allOf("announcements"),
      ...allOf("calendar"),
      ...allOf("reports"),
      ...allOf("analytics"),
      "ai.use",
      "audit.view",
    ],
  },
  {
    key: "vice_president",
    name: "Vice President",
    description: "Supports the President; oversees events and people.",
    color: "violet",
    rank: 20,
    permissions: [
      "organization.view",
      "users.view",
      "departments.view",
      ...allOf("committees"),
      "members.view",
      "members.verify",
      "events.view",
      "events.edit",
      "tickets.view",
      "volunteers.view",
      "fundraisers.view",
      "announcements.view",
      "announcements.create",
      ...allOf("calendar"),
      "reports.view",
      "analytics.view",
      "ai.use",
    ],
  },
  {
    key: "treasurer",
    name: "Treasurer",
    description: "Owns the books: income, expenses, reimbursements and budgets.",
    color: "emerald",
    rank: 30,
    permissions: [
      ...allOf("finance"),
      "members.view",
      "tickets.view",
      "merchandise.view",
      "fundraisers.view",
      "calendar.view",
      ...allOf("reports"),
      "analytics.view",
      "ai.use",
    ],
  },
  {
    key: "secretary",
    name: "Secretary",
    description: "Records, membership administration and meeting minutes.",
    color: "sky",
    rank: 40,
    permissions: [
      "users.view",
      "users.create",
      "users.edit",
      "departments.view",
      "committees.view",
      "members.view",
      "members.add",
      "members.edit",
      "members.verify",
      ...allOf("announcements"),
      ...allOf("calendar"),
      "reports.view",
      "reports.generate",
      "ai.use",
    ],
  },
  {
    key: "event_head",
    name: "Event Head",
    description: "Runs events end to end: tickets, attendance and event volunteers.",
    color: "orange",
    rank: 50,
    permissions: [
      ...allOf("events"),
      ...allOf("tickets"),
      "members.view",
      "members.verify",
      "volunteers.view",
      "volunteers.assign_tasks",
      "finance.create_expense",
      "announcements.view",
      "announcements.create",
      ...allOf("calendar"),
      "reports.view",
      "reports.generate",
      "analytics.view",
      "ai.use",
    ],
  },
  {
    key: "volunteer_head",
    name: "Volunteer Head",
    description: "Recruits volunteers, schedules shifts and assigns tasks.",
    color: "teal",
    rank: 60,
    permissions: [
      ...allOf("volunteers"),
      ...allOf("fundraisers"),
      "members.view",
      "events.view",
      "finance.create_expense",
      ...allOf("calendar"),
      "reports.view",
      "ai.use",
    ],
  },
  {
    key: "merchandise_manager",
    name: "Merchandise Manager",
    description: "Products, sizes, inventory, orders and the merch studio.",
    color: "rose",
    rank: 70,
    permissions: [...allOf("merchandise"), "members.view", "finance.create_expense", "calendar.view", "reports.view", "ai.use"],
  },
  {
    key: "communication_manager",
    name: "Communication Manager",
    description: "Announcements and the organization calendar.",
    color: "violet",
    rank: 80,
    permissions: [...allOf("announcements"), ...allOf("calendar"), "events.view", "members.view", "ai.use"],
  },
  {
    key: "security_head",
    name: "Security Head",
    description: "Event security and CCTV. The only preset with camera access.",
    color: "slate",
    rank: 85,
    permissions: ["cctv.view", "cctv.live", "cctv.playback", "events.view", "tickets.checkin", "calendar.view"],
  },
  {
    key: "committee_member",
    name: "Committee Member",
    description: "Works on a committee; can view events and help at the door.",
    color: "amber",
    rank: 90,
    permissions: [
      "committees.view",
      "events.view",
      "tickets.checkin",
      "members.verify",
      "volunteers.view",
      "finance.create_expense",
      "announcements.view",
      "calendar.view",
      "ai.use",
    ],
  },
  {
    key: "volunteer",
    name: "Volunteer",
    description: "Sees assigned tasks and shifts; can check in attendees.",
    color: "teal",
    rank: 95,
    permissions: ["tickets.checkin", "calendar.view"],
  },
  {
    key: "general_member",
    name: "General Member",
    description: "Default for every member: own pass, tickets, orders and calendar.",
    color: "slate",
    rank: 100,
    permissions: ["calendar.view"],
  },
];
