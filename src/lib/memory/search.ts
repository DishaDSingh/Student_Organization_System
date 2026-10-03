import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { structured } from "@/lib/ai/claude";
import { fmtDate } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { SPENT_STATUSES } from "@/lib/finance/rules";
import type { Section } from "@/lib/reports/types";
import { MEMORY_KINDS, score, snippet, targetYear, tokens, topHits, type Hit, type MemoryKind } from "./rank";

/**
 * Searches everything the organization has learned: saved memories,
 * final reports, confirmed meeting notes, past events (with their real
 * numbers) and vendors. Answers cite the items they came from.
 */
export async function searchMemory(q: string, now = new Date()): Promise<{ words: string[]; hits: Hit[] }> {
  const words = tokens(q);
  if (!words.length) return { words, hits: [] };
  const year = targetYear(q, now);
  const like = (field: string) => words.map((w) => ({ [field]: { contains: w, mode: "insensitive" as const } }));

  const [memories, reports, meetings, events, vendors] = await Promise.all([
    db.memoryItem.findMany({ where: { OR: [...like("title"), ...like("body"), { tags: { hasSome: words } }] }, take: 200 }),
    db.report.findMany({ where: { status: "FINAL" }, select: { id: true, title: true, sections: true, updatedAt: true, periodTo: true } }),
    db.meeting.findMany({
      where: { status: "CONFIRMED", OR: [...like("title"), ...like("notes")] },
      select: { id: true, title: true, heldAt: true, extracted: true, notes: true },
    }),
    db.event.findMany({
      where: { status: "PUBLISHED", endsAt: { lt: now }, OR: like("title") },
      select: {
        id: true,
        title: true,
        startsAt: true,
        venue: true,
        capacity: true,
        _count: { select: { tickets: { where: { status: "VALID" } } } },
        tickets: { where: { checkedInAt: { not: null } }, select: { id: true } },
      },
    }),
    db.expense.groupBy({
      by: ["vendor"],
      where: { status: { in: [...SPENT_STATUSES] }, OR: like("vendor") },
      _sum: { amountPaise: true },
      _count: true,
      _max: { spentAt: true },
    }),
  ]);

  // Ticket revenue for the matched past events, computed live.
  const revenue = new Map(
    await Promise.all(
      events.map(
        async (e) =>
          [
            e.id,
            (
              await db.payment.aggregate({
                where: { status: "PAID", purpose: "TICKET", ticketOrder: { eventId: e.id } },
                _sum: { amountPaise: true },
              })
            )._sum.amountPaise ?? 0,
          ] as const,
      ),
    ),
  );

  const hits: Hit[] = [
    ...memories.map((m) => ({
      id: `mem-${m.id}`,
      source: "memory" as const,
      kind: MEMORY_KINDS[m.kind as MemoryKind] ?? m.kind,
      title: m.title,
      text: m.body + (m.tags.length ? ` (${m.tags.join(", ")})` : ""),
      date: m.happenedAt ?? m.createdAt,
      href: m.url ?? (m.eventId ? `/events/${m.eventId}` : m.meetingId ? `/meetings/${m.meetingId}` : undefined),
      score: 0,
    })),
    ...reports.map((r) => ({
      id: `rep-${r.id}`,
      source: "report" as const,
      kind: "Report",
      title: r.title,
      text: (r.sections as Section[]).map((s) => `${s.heading}: ${s.body}`).join("\n"),
      date: r.periodTo ?? r.updatedAt,
      href: `/reports/${r.id}`,
      score: 0,
    })),
    ...meetings.map((m) => {
      const x = m.extracted as { summary?: string; decisions?: string[] } | null;
      return {
        id: `mtg-${m.id}`,
        source: "meeting" as const,
        kind: "Meeting",
        title: m.title,
        text: [x?.summary, ...(x?.decisions ?? []).map((d) => `Decided: ${d}`), m.notes].filter(Boolean).join("\n"),
        date: m.heldAt,
        href: `/meetings/${m.id}`,
        score: 0,
      };
    }),
    ...events.map((e) => ({
      id: `evt-${e.id}`,
      source: "event" as const,
      kind: "Past event",
      title: e.title,
      text: `${e.title} was held on ${fmtDate(e.startsAt)} at ${e.venue}. ${e._count.tickets} tickets sold of ${e.capacity} seats, ${e.tickets.length} people checked in, ticket revenue ${formatINR(revenue.get(e.id) ?? 0)}.`,
      date: e.startsAt,
      href: `/events/${e.id}`,
      score: 0,
    })),
    ...vendors.map((v) => ({
      id: `ven-${v.vendor}`,
      source: "vendor" as const,
      kind: "Vendor",
      title: v.vendor ?? "Vendor",
      text: `We paid ${v.vendor} ${formatINR(v._sum.amountPaise ?? 0)} over ${v._count} approved expenses, most recently on ${fmtDate(v._max.spentAt)}.`,
      date: v._max.spentAt,
      href: "/finance?tab=expenses&status=APPROVED",
      score: 0,
    })),
  ];

  for (const h of hits) h.score = score(words, h, year, now);
  const top = topHits(hits, 12).map((h) => ({ ...h, text: snippet(h.text, words, 320) }));
  return { words, hits: top };
}

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe("A short answer (2–5 sentences) using only the numbered sources. Say plainly if they don't answer the question."),
  cited: z.array(z.number().int()).describe("Numbers of the sources the answer relies on."),
});

/** AI answer grounded only in the retrieved items; null when AI isn't available. */
export async function answerFromMemory(q: string, hits: Hit[]) {
  if (!hits.length) return null;
  const sources = hits.slice(0, 8).map((h, i) => `[${i + 1}] ${h.kind} — ${h.title}${h.date ? ` (${fmtDate(h.date)})` : ""}: ${h.text}`);
  const ai = await structured({
    schema: AnswerSchema,
    system:
      "You answer questions about a student organisation's history using ONLY the numbered sources provided. Never add facts, numbers or names that aren't in them. If the sources don't answer it, say so.",
    content: `Question: ${q}\n\nSources:\n${sources.join("\n")}`,
    effort: "low",
    maxTokens: 1500,
  });
  if (!ai.ok) return null;
  const cited = ai.data.cited.filter((n) => n >= 1 && n <= sources.length).map((n) => hits[n - 1].id);
  return { answer: ai.data.answer, cited };
}
