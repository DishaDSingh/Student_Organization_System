import {
  BadgeIndianRupeeIcon,
  CalendarDaysIcon,
  HandHeartIcon,
  HandCoinsIcon,
  WalletIcon,
  ShirtIcon,
  ShoppingBagIcon,
  TicketIcon,
  Building2Icon,
  IdCardIcon,
  ScanLineIcon,
  UserRoundCheckIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ChartColumnIcon,
  LightbulbIcon,
  SparklesIcon,
  MegaphoneIcon,
  FlaskConicalIcon,
  CctvIcon,
  CalendarRangeIcon,
  NotebookPenIcon,
  BrainIcon,
  FileTextIcon,
  MessageCircleQuestionIcon,
  type LucideIcon,
  NetworkIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/rbac/catalog";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible if the user holds ANY of these. Omit = everyone signed in. */
  anyOf?: PermissionKey[];
  keywords?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Single source of truth for navigation. Each phase adds its module here;
 * items the user can't access are not rendered at all (no teasing locked links).
 */
export const NAV: NavGroup[] = [
  {
    label: "Home",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, keywords: "home overview" },
      { href: "/announcements", label: "Announcements", icon: MegaphoneIcon, keywords: "news notices updates" },
      { href: "/calendar", label: "Calendar", icon: CalendarRangeIcon, keywords: "schedule deadlines reminders dates" },
    ],
  },
  {
    // Layer 1 — run the organization day to day.
    label: "Operate",
    items: [
      { href: "/members", label: "Members", icon: UserRoundCheckIcon, anyOf: ["members.view"], keywords: "dues renewals expiry" },
      { href: "/members/verify", label: "Verify pass", icon: ScanLineIcon, anyOf: ["members.verify"], keywords: "scan qr door check" },
      { href: "/events", label: "Events", icon: CalendarDaysIcon, keywords: "gala tickets check-in" },
      { href: "/merch", label: "Merch", icon: ShirtIcon, keywords: "hoodie tshirt store inventory studio" },
      { href: "/volunteers", label: "Volunteers", icon: HandHeartIcon, anyOf: ["volunteers.view"], keywords: "helpers roster" },
      { href: "/fundraisers", label: "Fundraisers", icon: HandCoinsIcon, anyOf: ["fundraisers.view"], keywords: "donations goal tasks" },
      {
        href: "/finance",
        label: "Finance",
        icon: WalletIcon,
        anyOf: ["finance.view", "finance.create_expense"],
        keywords: "money expenses receipts reimbursement treasurer budget scan",
      },
      {
        href: "/security",
        label: "Security",
        icon: CctvIcon,
        anyOf: ["cctv.view", "cctv.live", "cctv.playback", "cctv.manage"],
        keywords: "cctv cameras incidents",
      },
    ],
  },
  {
    // Layer 2 — understand what's happening.
    label: "Understand",
    items: [
      { href: "/insights", label: "Insights", icon: LightbulbIcon, anyOf: ["analytics.view"], keywords: "alerts pulse health warnings" },
      {
        href: "/copilot",
        label: "Ask",
        icon: MessageCircleQuestionIcon,
        anyOf: ["ai.use"],
        keywords: "chat copilot question assistant ai",
      },
      { href: "/analytics", label: "Analytics", icon: ChartColumnIcon, anyOf: ["analytics.view"], keywords: "charts trends growth stats" },
      { href: "/reports", label: "Reports", icon: FileTextIcon, anyOf: ["reports.view"], keywords: "summary handover annual export pdf" },
    ],
  },
  {
    // Layer 3 — anticipate and remember.
    label: "Anticipate",
    items: [
      {
        href: "/simulate",
        label: "What if?",
        icon: FlaskConicalIcon,
        anyOf: ["analytics.simulate"],
        keywords: "simulate scenario sandbox forecast",
      },
      {
        href: "/meetings",
        label: "Meetings",
        icon: NotebookPenIcon,
        anyOf: ["calendar.manage", "committees.view"],
        keywords: "minutes notes transcript decisions actions",
      },
      {
        href: "/memory",
        label: "Memory",
        icon: BrainIcon,
        anyOf: ["reports.view"],
        keywords: "history lessons vendors sponsors decisions knowledge",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: UsersIcon, anyOf: ["users.view"], keywords: "people accounts" },
      { href: "/admin/roles", label: "Roles & permissions", icon: ShieldCheckIcon, anyOf: ["roles.view"], keywords: "rbac access" },
      { href: "/admin/departments", label: "Departments", icon: NetworkIcon, anyOf: ["departments.view"] },
      { href: "/admin/committees", label: "Committees", icon: UsersRoundIcon, anyOf: ["committees.view"] },
      {
        href: "/members/plans",
        label: "Membership plans",
        icon: BadgeIndianRupeeIcon,
        anyOf: ["members.view"],
        keywords: "price dues benefits",
      },
      { href: "/admin/audit", label: "Audit log", icon: HistoryIcon, anyOf: ["audit.view"], keywords: "history activity security" },
      { href: "/admin/organization", label: "Organization", icon: Building2Icon, anyOf: ["organization.view"], keywords: "settings" },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/me/pass", label: "My pass", icon: IdCardIcon, keywords: "qr digital card" },
      { href: "/me/tickets", label: "My tickets", icon: TicketIcon, keywords: "qr entry orders" },
      { href: "/me/orders", label: "My orders", icon: ShoppingBagIcon, keywords: "merch purchases" },
      { href: "/me/volunteering", label: "Volunteering", icon: HandHeartIcon, keywords: "my tasks help" },
      { href: "/me", label: "My membership", icon: BadgeIndianRupeeIcon, keywords: "renew dues join" },
      { href: "/profile", label: "My profile & access", icon: UserCircleIcon, keywords: "password account" },
      { href: "/ai", label: "How AI works here", icon: SparklesIcon, keywords: "ai principles privacy human review" },
    ],
  },
];

export function visibleNav(permissions: ReadonlySet<string>): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.has(p))) })).filter(
    (g) => g.items.length > 0,
  );
}
