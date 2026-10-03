"use client";

import Link from "next/link";
import { ScanLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/events";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { IncidentDialog } from "../../event-forms";
import { useLiveEvent } from "./use-live";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

export function LiveIndicator({ connected, at }: { connected: boolean; at?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium", connected ? "text-success" : "text-muted-foreground")}>
      <span className="relative flex size-2">
        {connected && <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground")} />
      </span>
      {connected ? `Live · ${at ? time(at) : ""}` : "Reconnecting…"}
    </span>
  );
}

/** Small bar sparkline of arrivals per 10 minutes. */
function Arrivals({ points }: { points: { t: string; n: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.n));
  if (!points.length) return <p className="text-muted-foreground text-sm">No arrivals in the last 2 hours.</p>;
  return (
    <div className="flex h-20 items-end gap-1" role="img" aria-label="Arrivals per 10 minutes over the last 2 hours">
      {points.map((p) => (
        <div key={p.t} className="group relative flex-1">
          <div className="bg-primary/70 rounded-t-sm" style={{ height: `${Math.max(4, (p.n / max) * 80)}px` }} />
          <span className="bg-popover absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded px-1 text-[10px] whitespace-nowrap shadow group-hover:block">
            {time(p.t)} · {p.n}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CommandCenter({ eventId, capacity, canCheckIn }: { eventId: string; capacity: number; canCheckIn: boolean }) {
  const { data, connected } = useLiveEvent(eventId);
  const s = data?.stats;

  const tiles = [
    { label: "Tickets sold", value: s ? `${s.sold}` : "—", sub: s ? `${capacity - s.sold - s.reserved} seats left` : "" },
    { label: "Inside now", value: s ? `${s.checkedIn}` : "—", sub: s ? `${s.sold - s.checkedIn} yet to arrive` : "" },
    {
      label: "Revenue",
      value: s?.revenuePaise != null ? formatINR(s.revenuePaise) : "—",
      sub: s ? `${s.pendingOrders} unpaid orders` : "",
    },
    {
      label: "Open incidents",
      value: s ? `${s.incidentsOpen}` : "—",
      sub: s?.incidentsOpen ? "needs attention" : "all clear",
      alert: !!s?.incidentsOpen,
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <LiveIndicator connected={connected} at={data?.at} />
        <div className="ml-auto flex gap-2">
          <IncidentDialog eventId={eventId} />
          {canCheckIn && (
            <Button size="sm" asChild>
              <Link href={`/events/${eventId}/checkin`}>
                <ScanLineIcon /> Open door scanner
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-card p-4 sm:p-5">
            <p className="text-muted-foreground text-sm">{t.label}</p>
            <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular-nums", t.alert && "text-destructive")}>{t.value}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="bg-card rounded-xl border p-5 lg:col-span-2">
          <h2 className="font-medium">Attendance</h2>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums">{s ? Math.round((s.checkedIn / Math.max(1, s.sold)) * 100) : 0}%</span>
            <span className="text-muted-foreground text-sm">of ticket holders are in</span>
          </div>
          <Meter value={s?.checkedIn ?? 0} max={Math.max(1, s?.sold ?? 1)} className="mt-3 h-2.5" tone="bg-success" />
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {s?.byType.map((t) => (
              <li key={t.id} className="text-sm">
                <div className="flex justify-between">
                  <span>{t.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {t.checkedIn}/{t.allocated}
                  </span>
                </div>
                <Meter value={t.checkedIn} max={Math.max(1, t.allocated)} className="mt-1" />
              </li>
            ))}
          </ul>
          <h3 className="mt-6 mb-2 text-sm font-medium">Arrivals per 10 minutes</h3>
          <Arrivals points={data?.arrivals ?? []} />
        </section>

        <div className="grid content-start gap-6">
          <section className="bg-card rounded-xl border p-5">
            <h2 className="font-medium">Latest check-ins</h2>
            <ol className="mt-3 grid gap-2 text-sm" aria-live="polite">
              {data?.recent.length ? (
                data.recent.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {r.holderName} <span className="text-muted-foreground text-xs">· {r.ticketType.name}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{time(r.checkedInAt)}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Nobody yet.</li>
              )}
            </ol>
          </section>
          <section className="bg-card rounded-xl border p-5">
            <h2 className="font-medium">Incidents</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {data?.incidents.length ? (
                data.incidents.map((i) => (
                  <li key={i.id} className={cn("flex gap-2", i.resolvedAt && "text-muted-foreground")}>
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        i.resolvedAt
                          ? "bg-muted-foreground/40"
                          : i.severity === "HIGH"
                            ? "bg-destructive"
                            : i.severity === "MEDIUM"
                              ? "bg-warning"
                              : "bg-info",
                      )}
                    />
                    <span className="min-w-0">
                      {i.title}
                      <span className="text-muted-foreground block text-xs">
                        {time(i.createdAt)}
                        {i.location && ` · ${i.location}`}
                        {i.resolvedAt && " · resolved"}
                      </span>
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">None logged.</li>
              )}
            </ul>
          </section>
          <section className="bg-card text-muted-foreground rounded-xl border p-5 text-sm">
            <h2 className="text-foreground font-medium">Volunteers · CCTV · Announcements</h2>
            <p className="mt-1">These panels connect when their modules are enabled.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
