import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm">
            <ChevronLeftIcon className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Role colors are a fixed, muted palette so badges never fight the UI's single accent. */
const ROLE_TONE: Record<string, string> = {
  indigo: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
  emerald: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
  sky: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
  teal: "bg-teal-500/10 text-teal-700 ring-teal-500/20 dark:text-teal-300",
  orange: "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300",
  slate: "bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-300",
};

export function RoleBadge({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        ROLE_TONE[color] ?? ROLE_TONE.slate,
        className,
      )}
    >
      {name}
    </span>
  );
}

export function RoleDot({ color }: { color: string }) {
  return <span className={cn("size-2.5 shrink-0 rounded-full ring-2", ROLE_TONE[color] ?? ROLE_TONE.slate)} />;
}

const STATUS_TONE = {
  ACTIVE: "text-success",
  INVITED: "text-info",
  SUSPENDED: "text-destructive",
} as const;

export function StatusLabel({ status }: { status: keyof typeof STATUS_TONE }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", STATUS_TONE[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function MasterBadge() {
  return (
    <span className="bg-primary text-primary-foreground inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium">
      Master Admin
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <Icon className="text-muted-foreground/60 size-8" />
      <p className="mt-3 font-medium">{title}</p>
      {children && <div className="text-muted-foreground mt-1 max-w-sm text-sm">{children}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card rounded-xl border", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-medium">{title}</h2>
          {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** URL-driven pagination: keeps filters in the query string so pages are shareable. */
export function Pagination({
  page,
  pageSize,
  total,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="text-muted-foreground flex items-center justify-between gap-4 pt-4 text-sm">
      <p>
        {from}–{to} of {total.toLocaleString("en-IN")}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)} aria-label="Previous page">
              <ChevronLeftIcon /> Prev
            </Link>
          ) : (
            <>
              <ChevronLeftIcon /> Prev
            </>
          )}
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
          {page < pages ? (
            <Link href={href(page + 1)} aria-label="Next page">
              Next <ChevronRightIcon />
            </Link>
          ) : (
            <>
              Next <ChevronRightIcon />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Link-based tabs (?tab=…). Keeps busy pages to one topic at a time, works
 * without client JavaScript, and survives refresh / back / shared links.
 */
export function PageTabs({
  tabs,
  current,
  basePath,
}: {
  tabs: { key: string; label: string; count?: number }[];
  current: string;
  basePath: string;
}) {
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b px-1" aria-label="Sections">
      {tabs.map((t, i) => (
        <Link
          key={t.key}
          href={i === 0 ? basePath : `${basePath}?tab=${t.key}`}
          aria-current={current === t.key ? "page" : undefined}
          scroll={false}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
            current === t.key ? "border-primary text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="text-muted-foreground ml-1.5 tabular-nums">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Pick the active tab from searchParams, falling back to the first. */
export const activeTab = <K extends string>(keys: readonly K[], value: string | string[] | undefined): K =>
  (keys as readonly string[]).includes(typeof value === "string" ? value : "") ? (value as K) : keys[0];
