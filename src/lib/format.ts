import { format, formatDistanceToNowStrict } from "date-fns";

export const fmtDate = (d: Date | string | null | undefined) => (d ? format(new Date(d), "d MMM yyyy") : "—");
export const fmtDateTime = (d: Date | string | null | undefined) => (d ? format(new Date(d), "d MMM yyyy, HH:mm") : "—");
export const fmtRelative = (d: Date | string | null | undefined) => (d ? `${formatDistanceToNowStrict(new Date(d))} ago` : "Never");
export const toDateInput = (d: Date | null | undefined) => (d ? format(d, "yyyy-MM-dd") : "");

/** Read a single string from Next's searchParams. */
export const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
export const pageParam = (v: string | string[] | undefined) => Math.max(1, Number.parseInt(param(v) ?? "1", 10) || 1);

/** "1 person", "3 people"; "1 permission", "16 permissions". */
export const people = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "person" : "people"}`;
export const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

/** A moment `n` days before now (kept out of components so render stays pure). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
