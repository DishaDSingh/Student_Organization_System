"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/volunteers/rules";

const fit = (score: number) =>
  score >= 70 ? ["Great fit", "text-success"] : score >= 45 ? ["Good fit", "text-primary"] : ["Possible", "text-muted-foreground"];

/** Top volunteer suggestions with one plain-language reason each. A person decides. */
export function Suggestions({
  load,
  onAssign,
}: {
  load: () => Promise<{ ok: true; data: Match[] } | { ok: false; error: string }>;
  onAssign: (userId: string) => Promise<void>;
}) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load().then((r) => live && (r.ok ? setMatches(r.data.slice(0, 5)) : setError(r.error)));
    return () => {
      live = false;
    };
  }, [load]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!matches)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" /> Finding people…
      </p>
    );
  if (!matches.length) return <p className="text-muted-foreground text-sm">No volunteers have signed up yet.</p>;

  return (
    <ul className="divide-y rounded-lg border">
      {matches.map((m) => {
        const [label, tone] = fit(m.score);
        const reason = m.reasons.find((r) => r.tone === "good") ?? m.reasons[0];
        return (
          <li key={m.userId} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {m.name} <span className={cn("ml-1 text-xs", tone)}>{label}</span>
              </p>
              {reason && <p className="text-muted-foreground truncate text-xs">{reason.text}</p>}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(m.userId);
                await onAssign(m.userId);
                setBusy(null);
              }}
            >
              {busy === m.userId && <Loader2Icon className="animate-spin" />}
              Assign
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
