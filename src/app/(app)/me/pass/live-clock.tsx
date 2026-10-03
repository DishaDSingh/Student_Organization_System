"use client";

import { useEffect, useState } from "react";

/**
 * Ticking clock on the pass. A screenshot freezes it, so door volunteers can
 * tell a live pass from a forwarded image at a glance.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm tabular-nums" aria-label="Live time">
      <span className="relative flex size-2">
        <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-60" />
        <span className="bg-success relative inline-flex size-2 rounded-full" />
      </span>
      {now ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--"}
    </span>
  );
}
