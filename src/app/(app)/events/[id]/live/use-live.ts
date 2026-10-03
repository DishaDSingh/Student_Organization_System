"use client";

import { useEffect, useState } from "react";

export type LiveSnapshot = {
  at: string;
  stats: {
    sold: number;
    reserved: number;
    checkedIn: number;
    noShows: number;
    revenuePaise: number | null;
    pendingOrders: number;
    incidentsOpen: number;
    byType: { id: string; name: string; quantity: number; allocated: number; checkedIn: number }[];
  };
  recent: { id: string; holderName: string; checkedInAt: string; ticketType: { name: string }; checkedInBy: { name: string } | null }[];
  incidents: { id: string; title: string; severity: "LOW" | "MEDIUM" | "HIGH"; location: string | null; createdAt: string; resolvedAt: string | null }[];
  arrivals: { t: string; n: number }[];
};

/** Subscribes to the event's SSE stream. `connected` drives the live indicator. */
export function useLiveEvent(eventId: string, initial: LiveSnapshot | null = null) {
  const [data, setData] = useState<LiveSnapshot | null>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/events/${eventId}/live`);
    es.onopen = () => setConnected(true);
    es.onmessage = (m) => {
      setConnected(true);
      setData(JSON.parse(m.data));
    };
    es.onerror = () => setConnected(false); // EventSource retries on its own
    return () => es.close();
  }, [eventId]);

  return { data, connected };
}
