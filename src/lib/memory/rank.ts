/**
 * Organization memory — ranking. Pure: tokens in, scores out, so search
 * results are predictable and testable. No embeddings or external service;
 * it runs fully offline on the local database.
 */

export const MEMORY_KINDS = {
  LESSON: "Lesson learned",
  DECISION: "Decision",
  VENDOR: "Vendor",
  SPONSOR: "Sponsor",
  DOCUMENT: "Document",
  NOTE: "Note",
} as const;
export type MemoryKind = keyof typeof MEMORY_KINDS;
export const MEMORY_KIND_KEYS = Object.keys(MEMORY_KINDS) as MemoryKind[];

export type Hit = {
  id: string;
  source: "memory" | "report" | "meeting" | "event" | "vendor";
  kind: string;
  title: string;
  text: string;
  date: Date | null;
  href?: string;
  score: number;
};

const STOP = new Set(
  "a an and are as at be by did do does for from had has have how i in is it its last of on or our the their this to was we were what when where which who why will with year years happened during about tell me show any".split(
    " ",
  ),
);

/** Lowercase search words, without filler words or plurals ("galas" → "gala"). */
export function tokens(q: string) {
  return [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, " ")
        .replace(/'s\b/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP.has(w))
        .map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)),
    ),
  ];
}

/** Which year the question is about: "last year" → previous year, "2025" → 2025. */
export function targetYear(q: string, now = new Date()) {
  if (/\blast year\b|\bprevious year\b/i.test(q)) return now.getFullYear() - 1;
  if (/\bthis year\b/i.test(q)) return now.getFullYear();
  const y = q.match(/\b(20\d{2})\b/);
  return y ? Number(y[1]) : null;
}

/**
 * Score = 3 per word found in the title + 1 per word in the text, +2 if it's
 * from the year asked about, and a small bonus for recent items. Zero means no match.
 */
export function score(words: string[], hit: { title: string; text: string; date: Date | null }, year: number | null, now = new Date()) {
  const title = hit.title.toLowerCase();
  const text = hit.text.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (title.includes(w)) s += 3;
    else if (text.includes(w)) s += 1;
  }
  if (s === 0) return 0;
  if (year && hit.date?.getFullYear() === year) s += 2;
  if (year && hit.date && hit.date.getFullYear() !== year) s -= 1;
  if (hit.date) s += Math.max(0, 1 - (now.getTime() - hit.date.getTime()) / (3 * 365 * 86_400_000)); // up to +1 for recent
  return Math.round(s * 100) / 100;
}

export const topHits = (hits: Hit[], limit = 10) =>
  hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

export const snippet = (text: string, words: string[], length = 220) => {
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), text.length) - 60);
  const s = text
    .slice(at, at + length)
    .replace(/\s+/g, " ")
    .trim();
  return (at > 0 ? "…" : "") + s + (at + length < text.length ? "…" : "");
};
