import {
  BadgeIndianRupeeIcon,
  CalendarDaysIcon,
  TicketIcon,
  Building2Icon,
  IdCardIcon,
  ScanLineIcon,
  UserRoundCheckIcon,
  HistoryIcon,
  LayoutDashboardIcon,
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
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, keywords: "home overview" }],
  },
  {
    label: "Operate",
    items: [{ href: "/events", label: "Events", icon: CalendarDaysIcon, keywords: "gala tickets check-in" }],
  },
  {
    label: "Membership",
    items: [
      { href: "/members", label: "Members", icon: UserRoundCheckIcon, anyOf: ["members.view"], keywords: "dues renewals expiry" },
      { href: "/members/verify", label: "Verify pass", icon: ScanLineIcon, anyOf: ["members.verify"], keywords: "scan qr door check" },
      { href: "/members/plans", label: "Plans & benefits", icon: BadgeIndianRupeeIcon, anyOf: ["members.view"], keywords: "price dues" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: UsersIcon, anyOf: ["users.view"], keywords: "people accounts" },
      { href: "/admin/roles", label: "Roles & permissions", icon: ShieldCheckIcon, anyOf: ["roles.view"], keywords: "rbac access" },
      { href: "/admin/departments", label: "Departments", icon: NetworkIcon, anyOf: ["departments.view"] },
      { href: "/admin/committees", label: "Committees", icon: UsersRoundIcon, anyOf: ["committees.view"] },
      { href: "/admin/audit", label: "Audit log", icon: HistoryIcon, anyOf: ["audit.view"], keywords: "history activity security" },
      { href: "/admin/organization", label: "Organization", icon: Building2Icon, anyOf: ["organization.view"], keywords: "settings" },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/me/pass", label: "My pass", icon: IdCardIcon, keywords: "qr digital card" },
      { href: "/me/tickets", label: "My tickets", icon: TicketIcon, keywords: "qr entry orders" },
      { href: "/me", label: "My membership", icon: BadgeIndianRupeeIcon, keywords: "renew dues join" },
      { href: "/profile", label: "My profile & access", icon: UserCircleIcon, keywords: "password account" },
    ],
  },
];

export function visibleNav(permissions: ReadonlySet<string>): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.has(p))) })).filter(
    (g) => g.items.length > 0,
  );
}
