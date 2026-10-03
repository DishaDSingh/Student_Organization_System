import {
  Building2Icon,
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
    items: [{ href: "/profile", label: "My profile & access", icon: UserCircleIcon, keywords: "password account" }],
  },
];

export function visibleNav(permissions: ReadonlySet<string>): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || i.anyOf.some((p) => permissions.has(p))) })).filter(
    (g) => g.items.length > 0,
  );
}
