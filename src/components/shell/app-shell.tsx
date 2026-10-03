"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOutIcon, MenuIcon, MonitorIcon, MoonIcon, SearchIcon, SunIcon, UserCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { visibleNav, type NavGroup } from "./nav";
import { cn } from "@/lib/utils";
import { logout } from "@/app/(auth)/actions";

type ShellUser = { name: string; email: string; isMasterAdmin: boolean; roleNames: string[] };

export function AppShell({
  user,
  orgShortName,
  permissions,
  children,
}: {
  user: ShellUser;
  orgShortName: string;
  permissions: string[];
  children: React.ReactNode;
}) {
  const nav = useMemo(() => visibleNav(new Set(permissions)), [permissions]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="bg-sidebar sticky top-0 hidden h-svh flex-col border-r lg:flex">
        <SidebarContent nav={nav} orgShortName={orgShortName} pathname={pathname} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-sidebar w-[272px] p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent nav={nav} orgShortName={orgShortName} pathname={pathname} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="bg-background/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <MenuIcon />
          </Button>
          <Logo className="lg:hidden" href="/dashboard" />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="bg-muted/40 text-muted-foreground hover:bg-muted ml-auto flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors sm:w-64 lg:ml-0"
          >
            <SearchIcon className="size-4" />
            <span className="hidden sm:inline">Jump to…</span>
            <kbd className="bg-background ml-auto hidden rounded border px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-1 lg:ml-auto">
            <NotificationBell />
            <ThemeMenu />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <NavPalette nav={nav} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function SidebarContent({ nav, orgShortName, pathname }: { nav: NavGroup[]; orgShortName: string; pathname: string }) {
  // The most specific match wins, so /members/verify doesn't also light up /members.
  const activeHref = nav
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Logo href="/dashboard" />
        <span className="bg-background text-muted-foreground ring-border ml-auto truncate rounded-md px-1.5 py-0.5 text-xs font-medium ring-1">
          {orgShortName}
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {nav.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="text-muted-foreground mb-1 px-2 text-[11px] font-semibold tracking-wider uppercase">{group.label}</p>
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

function NavPalette({ nav, open, onOpenChange }: { nav: NavGroup[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Search pages you have access to">
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No matching pages.</CommandEmpty>
        {nav.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.keywords ?? ""}`}
                onSelect={() => {
                  onOpenChange(false);
                  router.push(item.href);
                }}
              >
                <item.icon />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function ThemeMenu() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <SunIcon /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <MoonIcon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <MonitorIcon /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-2 px-1.5" aria-label="Account menu">
          <Initials name={user.name} />
          <span className="hidden max-w-32 truncate text-sm md:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {user.isMasterAdmin ? "Master Admin" : user.roleNames.slice(0, 2).join(" · ") || "No role"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserCircleIcon /> My profile & access
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => logout()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className,
      )}
    >
      {initials}
    </span>
  );
}
