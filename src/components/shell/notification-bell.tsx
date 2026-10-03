"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/lib/format";

type Item = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

/** Polls every 30 s and on tab focus, so reminders show up without a reload. */
export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      /* offline — try again next tick */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const mark = async (body: object) => {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    void load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
          <BellIcon />
          {unread > 0 && (
            <span className="bg-destructive absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <button type="button" className="text-primary text-xs hover:underline" onClick={() => mark({ all: true })}>
              Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {items.length === 0 && <li className="text-muted-foreground p-4 text-center text-sm">You&apos;re all caught up.</li>}
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn("hover:bg-muted/50 block w-full px-3 py-2.5 text-left", !n.readAt && "bg-primary/5")}
                onClick={() => {
                  if (!n.readAt) void mark({ ids: [n.id] });
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
              >
                <p className="flex items-start gap-2 text-sm font-medium">
                  {!n.readAt && <span className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />}
                  {n.title}
                </p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.body}</p>
                <p className="text-muted-foreground mt-1 text-[11px]">{fmtRelative(n.createdAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
