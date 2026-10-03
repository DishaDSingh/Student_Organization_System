import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { structured } from "@/lib/ai/claude";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Announcements (Phase 22) — and the clearest example of the AI principle
 * (Phase 24): AI may *draft*, a person edits, and only someone with
 * announcements.publish can send, after seeing exactly how many people
 * will be notified.
 */

export const AUDIENCES = {
  MEMBERS: "Active members",
  EXPIRING: "Members whose membership ends this week",
  VOLUNTEERS: "Volunteers",
  ALL: "Everyone with an account",
} as const;
export type Audience = keyof typeof AUDIENCES;

/** Who an announcement reaches — the same query is used to count and to send. */
export function audienceWhere(a: Audience, now = new Date()): Prisma.UserWhereInput {
  const active: Prisma.UserWhereInput = { status: "ACTIVE" };
  if (a === "MEMBERS") return { ...active, memberships: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } } } };
  if (a === "EXPIRING") {
    // Same rule as the renewal insight: ends within 7 days and not already renewed.
    const week = new Date(now.getTime() + 7 * 86_400_000);
    return {
      ...active,
      AND: [
        { memberships: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now, lte: week } } } },
        { memberships: { none: { status: "ACTIVE", startDate: { gt: now } } } },
      ],
    };
  }
  if (a === "VOLUNTEERS") return { ...active, volunteerProfile: { isActive: true } };
  return active;
}

export const countAudience = (a: Audience) => db.user.count({ where: audienceWhere(a) });

const Draft = z.object({
  title: z.string().describe("Short, specific headline (max 80 characters)."),
  body: z.string().describe("Friendly announcement, 2–5 short paragraphs or a short list. Plain text, no markdown headings."),
});

/** AI drafts from a brief; without AI, a tidy template built from the brief. Always a draft. */
export async function draftFromBrief(brief: string, orgName: string, useAi = true) {
  const ai = useAi
    ? await structured({
        schema: Draft,
        system: `You write announcements for ${orgName}, a student organisation in India. Warm, clear, short. Use only facts in the brief — never invent dates, prices, venues or names. If something important is missing, write [add …] as a placeholder.`,
        content: `Brief: ${brief}`,
        effort: "low",
        maxTokens: 1500,
      })
    : null;
  if (ai?.ok) return { ...ai.data, title: ai.data.title.slice(0, 120), source: "ai" as const };
  const first = brief.split(/[.!?\n]/)[0].trim();
  return {
    title: (first.charAt(0).toUpperCase() + first.slice(1)).slice(0, 80),
    body: `Hi everyone,\n\n${brief.trim()}\n\nQuestions? Reply to the committee or ask at the help desk.\n\n— ${orgName}`,
    source: "template" as const,
  };
}

/** Which audiences a person is in — they only see announcements addressed to them. */
export async function audiencesFor(userId: string): Promise<Audience[]> {
  const groups: Audience[] = ["MEMBERS", "EXPIRING", "VOLUNTEERS"];
  const inGroup = await Promise.all(groups.map((a) => db.user.count({ where: { id: userId, ...audienceWhere(a) } })));
  return ["ALL", ...groups.filter((_, i) => inGroup[i] > 0)];
}
