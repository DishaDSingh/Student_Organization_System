/**
 * The permission catalog: every capability in CampusBuzz, grouped by module.
 *
 * This is code (not data) on purpose — a permission only means something if
 * code checks it. The seed and setup wizard sync it into the `Permission`
 * table so role assignments are enforced by foreign keys.
 *
 * Modules for later phases are declared now so roles can be configured
 * up-front; their screens arrive in their own phases.
 */

export type PermissionDef = {
  action: string;
  label: string;
  description: string;
  /** Sensitive permissions are highlighted in the UI and always audited. */
  sensitive?: boolean;
};

export type ModuleDef = {
  key: string;
  label: string;
  description: string;
  permissions: PermissionDef[];
};

export const PERMISSION_MODULES = [
  {
    key: "organization",
    label: "Organization",
    description: "Organization profile and global settings",
    permissions: [
      { action: "view", label: "View settings", description: "See organization profile and settings" },
      { action: "manage", label: "Manage settings", description: "Edit organization profile and settings", sensitive: true },
    ],
  },
  {
    key: "users",
    label: "User accounts",
    description: "Login accounts for everyone in the organization",
    permissions: [
      { action: "view", label: "View", description: "Browse user accounts" },
      { action: "create", label: "Create", description: "Create new user accounts" },
      { action: "edit", label: "Edit", description: "Edit profile details of other users" },
      { action: "suspend", label: "Suspend / reactivate", description: "Block or restore a user's access", sensitive: true },
      { action: "reset_password", label: "Reset password", description: "Set a temporary password for a user", sensitive: true },
      { action: "export", label: "Export", description: "Download user lists", sensitive: true },
    ],
  },
  {
    key: "roles",
    label: "Roles & permissions",
    description: "Who can do what",
    permissions: [
      { action: "view", label: "View", description: "See roles and their permissions" },
      { action: "manage", label: "Create / edit roles", description: "Create custom roles and change role permissions", sensitive: true },
      { action: "assign", label: "Assign roles", description: "Give or remove roles and per-user overrides", sensitive: true },
    ],
  },
  {
    key: "departments",
    label: "Departments",
    description: "Functional areas such as Finance or Events",
    permissions: [
      { action: "view", label: "View", description: "See departments and their members" },
      { action: "manage", label: "Manage", description: "Create, edit and delete departments" },
    ],
  },
  {
    key: "committees",
    label: "Committees",
    description: "Term-bound working groups",
    permissions: [
      { action: "view", label: "View", description: "See committees and members" },
      { action: "manage", label: "Manage", description: "Create committees and manage membership" },
    ],
  },
  {
    key: "members",
    label: "Membership",
    description: "Member records, dues, renewals and digital passes",
    permissions: [
      { action: "view", label: "View", description: "See member records" },
      { action: "add", label: "Add", description: "Register new members" },
      { action: "edit", label: "Edit", description: "Edit member records and status" },
      { action: "delete", label: "Delete", description: "Remove member records", sensitive: true },
      { action: "export", label: "Export", description: "Download member data", sensitive: true },
      { action: "verify", label: "Verify passes", description: "Scan and verify digital member passes" },
      { action: "manage_plans", label: "Manage plans & benefits", description: "Set membership plans, prices and benefits" },
    ],
  },
  {
    key: "events",
    label: "Events",
    description: "Event planning and publishing",
    permissions: [
      { action: "view", label: "View", description: "See events, including drafts" },
      { action: "create", label: "Create", description: "Create new events" },
      { action: "edit", label: "Edit", description: "Edit event details" },
      { action: "publish", label: "Publish", description: "Make events public and open sales" },
      { action: "cancel", label: "Cancel", description: "Cancel a published event", sensitive: true },
    ],
  },
  {
    key: "tickets",
    label: "Tickets & check-in",
    description: "Ticket types, sales, refunds and door check-in",
    permissions: [
      { action: "view", label: "View", description: "See ticket sales" },
      { action: "manage", label: "Manage ticket types", description: "Set prices, inventory and member pricing" },
      { action: "sell", label: "Sell at door", description: "Record in-person ticket sales" },
      { action: "refund", label: "Refund", description: "Refund tickets", sensitive: true },
      { action: "checkin", label: "Check-in", description: "Scan tickets and mark attendance" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    description: "Income, expenses, reimbursements and budgets",
    permissions: [
      { action: "view", label: "View", description: "See income, expenses and balances", sensitive: true },
      { action: "record_income", label: "Record income", description: "Record dues, sales and donations" },
      { action: "create_expense", label: "Create expense", description: "Submit expenses and reimbursement claims" },
      { action: "approve_expense", label: "Approve expense", description: "Approve or reject expenses", sensitive: true },
      { action: "manage_budget", label: "Manage budgets", description: "Set and edit budgets", sensitive: true },
      { action: "export", label: "Export reports", description: "Download financial reports", sensitive: true },
    ],
  },
  {
    key: "merchandise",
    label: "Merchandise",
    description: "Products, inventory, orders and the merch studio",
    permissions: [
      { action: "view", label: "View", description: "See products, stock and orders" },
      { action: "manage_products", label: "Manage products", description: "Create and edit products and prices" },
      { action: "manage_inventory", label: "Manage inventory", description: "Adjust stock levels" },
      { action: "manage_orders", label: "Manage orders", description: "Fulfil, cancel and refund orders" },
      { action: "studio", label: "Merch studio", description: "Design future merchandise previews" },
    ],
  },
  {
    key: "volunteers",
    label: "Volunteers",
    description: "Volunteer roster, shifts and tasks",
    permissions: [
      { action: "view", label: "View", description: "See volunteers and their tasks" },
      { action: "manage", label: "Manage", description: "Add volunteers and schedule shifts" },
      { action: "assign_tasks", label: "Assign tasks", description: "Assign and reassign tasks" },
    ],
  },
  {
    key: "fundraisers",
    label: "Fundraisers",
    description: "Fundraiser goals, tasks and progress",
    permissions: [
      { action: "view", label: "View", description: "See fundraisers and progress" },
      { action: "manage", label: "Manage", description: "Create fundraisers and set goals" },
    ],
  },
  {
    key: "announcements",
    label: "Announcements",
    description: "Organization-wide communication",
    permissions: [
      { action: "view", label: "View", description: "Read announcements, including drafts" },
      { action: "create", label: "Draft", description: "Write announcement drafts" },
      { action: "publish", label: "Publish", description: "Send announcements to members" },
    ],
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "Organization calendar and reminders",
    permissions: [
      { action: "view", label: "View", description: "See the organization calendar" },
      { action: "manage", label: "Manage", description: "Add meetings, deadlines and reminders" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Generated reports and summaries",
    permissions: [
      { action: "view", label: "View", description: "Read generated reports" },
      { action: "generate", label: "Generate", description: "Generate new reports" },
      { action: "export", label: "Export", description: "Export reports to files" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics & insights",
    description: "Dashboards, insights and organization pulse",
    permissions: [
      { action: "view", label: "View", description: "See analytics, insights and pulse" },
      { action: "simulate", label: "What-if simulator", description: "Run sandbox simulations" },
    ],
  },
  {
    key: "ai",
    label: "AI features",
    description: "Copilot, summarizer and AI configuration",
    permissions: [
      { action: "use", label: "Use copilot", description: "Ask the organization copilot" },
      { action: "manage", label: "Manage AI", description: "Configure AI providers and features", sensitive: true },
    ],
  },
  {
    key: "cctv",
    label: "CCTV & security",
    description: "Camera feeds and incident records. Never visible by default.",
    permissions: [
      { action: "view", label: "View cameras", description: "See the camera list and incidents", sensitive: true },
      { action: "live", label: "Live access", description: "Watch live feeds", sensitive: true },
      { action: "playback", label: "Playback", description: "Watch recorded footage", sensitive: true },
      { action: "export", label: "Export footage", description: "Download footage", sensitive: true },
      { action: "manage", label: "Manage cameras", description: "Add cameras, groups and retention rules", sensitive: true },
    ],
  },
  {
    key: "audit",
    label: "Audit log",
    description: "Record of every important action",
    permissions: [
      { action: "view", label: "View", description: "Read the audit log", sensitive: true },
      { action: "export", label: "Export", description: "Download the audit log", sensitive: true },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    description: "Payment gateways, email and external services",
    permissions: [{ action: "manage", label: "Manage", description: "Configure integrations and API keys", sensitive: true }],
  },
] as const satisfies readonly ModuleDef[];

type Modules = (typeof PERMISSION_MODULES)[number];
export type PermissionKey = {
  [M in Modules as M["key"]]: `${M["key"]}.${M["permissions"][number]["action"]}`;
}[Modules["key"]];

export type FlatPermission = PermissionDef & {
  key: PermissionKey;
  module: string;
  sortOrder: number;
};

export const ALL_PERMISSIONS: FlatPermission[] = PERMISSION_MODULES.flatMap((m, mi) =>
  m.permissions.map((p, pi) => ({
    ...p,
    key: `${m.key}.${p.action}` as PermissionKey,
    module: m.key,
    sortOrder: mi * 100 + pi,
  })),
);

export const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

const KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);
export function isPermissionKey(value: string): value is PermissionKey {
  return KEY_SET.has(value);
}

/** Every key in one module, e.g. allOf("events") → events.view, events.create… */
export function allOf(moduleKey: Modules["key"]): PermissionKey[] {
  return ALL_PERMISSIONS.filter((p) => p.module === moduleKey).map((p) => p.key);
}
