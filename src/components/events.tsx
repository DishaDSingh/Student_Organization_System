import { cn } from "@/lib/utils";
import { PHASE_LABEL, SALES_LABEL, type EventPhase, type SalesState } from "@/lib/events/rules";

const PHASE_TONE: Record<EventPhase, string> = {
  DRAFT: "bg-muted text-muted-foreground ring-border",
  CANCELLED: "bg-destructive/10 text-destructive ring-destructive/20",
  UPCOMING: "bg-info/12 text-info ring-info/25",
  LIVE: "bg-success/12 text-success ring-success/25",
  ENDED: "bg-muted text-muted-foreground ring-border",
};

export function PhaseBadge({ phase, className }: { phase: EventPhase; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", PHASE_TONE[phase], className)}>
      {phase === "LIVE" ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : <span className="size-1.5 rounded-full bg-current" />}
      {PHASE_LABEL[phase]}
    </span>
  );
}

export function SalesBadge({ state }: { state: SalesState }) {
  if (state === "UNAVAILABLE") return null;
  return (
    <span
      className={cn(
        "text-xs font-medium",
        state === "OPEN" ? "text-success" : state === "SOLD_OUT" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {SALES_LABEL[state]}
    </span>
  );
}

/** Thin horizontal meter: value out of max. */
export function Meter({ value, max, className, tone = "bg-primary/70" }: { value: number; max: number; className?: string; tone?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("bg-muted h-1.5 overflow-hidden rounded-full", className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Date block used in event lists: "07 NOV". */
export function DateBlock({ date }: { date: Date }) {
  return (
    <div className="bg-muted/60 flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5 leading-none">
      <span className="text-lg font-semibold tabular-nums">{date.toLocaleDateString("en-IN", { day: "2-digit" })}</span>
      <span className="text-muted-foreground mt-0.5 text-[10px] font-semibold tracking-wider uppercase">
        {date.toLocaleDateString("en-IN", { month: "short" })}
      </span>
    </div>
  );
}
