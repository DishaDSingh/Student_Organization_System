import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/claude";
import { keepsNumbers, type Section } from "./types";

/**
 * Optional AI writing pass. Claude rewrites the factual draft into clearer
 * prose but must keep every heading and every number. If the rewrite drops or
 * changes a figure, we keep the original draft — accuracy beats polish.
 */

const Rewrite = z.object({ sections: z.array(z.object({ heading: z.string(), body: z.string() })) });

const SYSTEM = `You edit reports for a student organisation in India.
Rewrite each section's body so it reads clearly for a committee. Rules:
- Keep the same sections, in the same order, with the same headings.
- Use ONLY the facts given. Never add numbers, names, dates or claims.
- Keep every number and amount exactly as written (₹ amounts, counts, percentages).
- Keep bullet lists as bullet lists ("- " lines) when they list figures.
- If a body is a placeholder in brackets like "(Add …)", leave it unchanged.`;

export async function polish(title: string, sections: Section[]) {
  const ai = await structured({
    schema: Rewrite,
    system: SYSTEM,
    effort: "low",
    maxTokens: 8000,
    content: `Report: ${title}\n\n${JSON.stringify({ sections })}`,
  });
  if (!ai.ok || ai.data.sections.length !== sections.length) return { sections, polished: false };
  const merged = sections.map((s, i) => {
    const r = ai.data.sections[i];
    return r.heading.trim() === s.heading && keepsNumbers(s, r) ? { heading: s.heading, body: r.body.trim() } : s;
  });
  return { sections: merged, polished: merged.some((s, i) => s.body !== sections[i].body) };
}
