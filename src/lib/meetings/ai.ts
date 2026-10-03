import "server-only";
import { z } from "zod";
import { structured, AI_UNAVAILABLE_MESSAGE } from "@/lib/ai/claude";
import { extractOffline, type Extracted } from "./extract";

const Schema = z.object({
  summary: z.string().describe("2–3 sentence summary of what the meeting covered and concluded."),
  decisions: z.array(z.string()).describe("Each decision that was actually made, one short sentence each."),
  actions: z.array(
    z.object({
      task: z.string().describe("What needs doing, as a short imperative sentence."),
      owner: z
        .string()
        .nullable()
        .describe("First name (or full name) of the person responsible, exactly as written; null if nobody was named."),
      due: z.string().nullable().describe("Deadline as YYYY-MM-DD, worked out from the meeting date; null if none was given."),
    }),
  ),
  questions: z.array(z.string()).describe("Questions raised but not answered in the meeting."),
});

const SYSTEM = `You take minutes for a student organisation committee.
From the notes or transcript, extract only what is there:
- decisions that were actually agreed (not suggestions),
- action items with the person named as responsible and any deadline,
- questions left open.
Never invent owners, dates or decisions. Indian dates are written day-first.`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Claude when available; otherwise the offline extractor. A person reviews the result either way. */
export async function extractMeeting(
  notes: string,
  heldAt: Date,
  title: string,
): Promise<{ data: Extracted; source: "ai" | "rules"; notice?: string }> {
  const ai = await structured({
    schema: Schema,
    system: SYSTEM,
    effort: "medium",
    maxTokens: 6000,
    content: `Meeting: ${title}\nDate: ${heldAt.toISOString().slice(0, 10)} (${heldAt.toLocaleDateString("en-IN", { weekday: "long" })})\n\n${notes}`,
  });
  if (!ai.ok) {
    return {
      data: extractOffline(notes, heldAt, title),
      source: "rules",
      notice: AI_UNAVAILABLE_MESSAGE[ai.reason].replace(
        "the offline generator was used",
        "we read the notes offline using cues like “Decided:”, “Action:” and “@name”",
      ),
    };
  }
  return {
    data: { ...ai.data, actions: ai.data.actions.map((a) => ({ ...a, due: a.due && ISO.test(a.due) ? a.due : null })) },
    source: "ai",
  };
}
