import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { can, requireUser } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { param } from "@/lib/format";
import { loadCalendar } from "@/lib/calendar/load";
import { KIND_LABEL, dayKey, groupByDay, monthGrid, monthKey, parseMonth, type CalItem } from "@/lib/calendar/grid";
import { AddEntryDialog } from "./add-entry";

export const metadata: Metadata = { title: "Calendar" };

const KIND_DOT: Record<CalItem["kind"], string> = {
  event: "bg-primary",
  sales: "bg-info",
  meeting: "bg-violet-500",
  deadline: "bg-warning",
  expiry: "bg-destructive",
  fundraiser: "bg-success",
  task: "bg-amber-600",
  payment: "bg-rose-500",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage(props: PageProps<"/calendar">) {
  // Everyone signed in gets a calendar; each source inside is permission-filtered.
  const user = await requireUser();
  const sp = await props.searchParams;
  const { year, month } = parseMonth(param(sp.m));
  const { weeks, from, to } = monthGrid(year, month);
  const items = await loadCalendar(user, from, to);
  const byDay = groupByDay(items);
  const today = dayKey(new Date());
  const title = new Date(year, month, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const inMonth = items
    .filter((i) => i.date.getMonth() === month && i.date.getFullYear() === year)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const kinds = [...new Set(items.map((i) => i.kind))];

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Events, meetings, deadlines, expiries and your tasks — all in one place."
        actions={can(user, "calendar.manage") && <AddEntryDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={`/calendar?m=${monthKey(year, month - 1)}`} aria-label="Previous month" scroll={false}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <h2 className="min-w-40 text-center text-lg font-semibold">{title}</h2>
        <Button variant="outline" size="icon-sm" asChild>
          <Link href={`/calendar?m=${monthKey(year, month + 1)}`} aria-label="Next month" scroll={false}>
            <ChevronRightIcon />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/calendar" scroll={false}>
            Today
          </Link>
        </Button>
        <ul className="text-muted-foreground ml-auto hidden flex-wrap gap-3 text-xs md:flex">
          {kinds.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", KIND_DOT[k])} /> {KIND_LABEL[k]}
            </li>
          ))}
        </ul>
      </div>

      {/* Month grid on larger screens */}
      <div className="bg-border hidden grid-cols-7 gap-px overflow-hidden rounded-xl border md:grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-muted/50 text-muted-foreground px-2 py-1.5 text-xs font-medium">
            {d}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const list = byDay.get(dayKey(d)) ?? [];
          const other = d.getMonth() !== month;
          return (
            <div key={d.toISOString()} className={cn("bg-card min-h-28 p-1.5", other && "bg-muted/30")}>
              <p
                className={cn(
                  "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  other && "text-muted-foreground",
                  dayKey(d) === today && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {d.getDate()}
              </p>
              <ul className="grid gap-0.5">
                {list.slice(0, 4).map((i) => (
                  <li key={i.id}>
                    <Item item={i} compact />
                  </li>
                ))}
                {list.length > 4 && <li className="text-muted-foreground px-1 text-[11px]">+{list.length - 4} more</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Agenda on phones */}
      <ol className="bg-card divide-y rounded-xl border md:hidden">
        {inMonth.length === 0 && <li className="text-muted-foreground p-4 text-sm">Nothing scheduled this month.</li>}
        {inMonth.map((i) => (
          <li key={i.id} className="flex gap-3 p-3">
            <div className="w-10 shrink-0 text-center">
              <p className="text-muted-foreground text-[11px] uppercase">{i.date.toLocaleString("en-IN", { weekday: "short" })}</p>
              <p className={cn("text-lg font-semibold tabular-nums", dayKey(i.date) === today && "text-primary")}>{i.date.getDate()}</p>
            </div>
            <Item item={i} />
          </li>
        ))}
      </ol>
    </>
  );
}

function Item({ item: i, compact }: { item: CalItem; compact?: boolean }) {
  const body = (
    <span className={cn("flex min-w-0 items-start gap-1.5", compact ? "text-[11px] leading-tight" : "text-sm")}>
      <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", KIND_DOT[i.kind])} aria-hidden />
      <span className="min-w-0">
        <span className={cn("block", compact && "truncate")} title={`${KIND_LABEL[i.kind]}: ${i.title}`}>
          {i.title}
        </span>
        {!compact && (
          <span className="text-muted-foreground block text-xs">{[KIND_LABEL[i.kind], i.detail].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </span>
  );
  return i.href ? (
    <Link href={i.href} className="hover:bg-muted block rounded px-1 py-0.5">
      {body}
    </Link>
  ) : (
    <span className="block px-1 py-0.5">{body}</span>
  );
}
