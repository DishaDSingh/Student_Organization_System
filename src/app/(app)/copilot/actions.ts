"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guardedAction, ok } from "@/lib/action";
import { structured } from "@/lib/ai/claude";
import { answer, type Answer } from "@/lib/copilot/answers";
import { INTENT_HELP, INTENTS, routeOffline, type Route } from "@/lib/copilot/router";

const askSchema = z.object({ question: z.string().trim().min(2, "Ask a question").max(300, "Keep it under 300 characters") });

const RouteSchema = z.object({
  intent: z.enum(INTENTS),
  subject: z
    .string()
    .nullable()
    .describe("Event, product or fundraiser name the question is about, if any — words only, e.g. 'Diwali Gala' or 'hoodie'."),
  period: z.enum(["today", "week", "month", "year"]).nullable(),
});

const SYSTEM = `You route questions for a student organisation's data copilot. You never answer the question yourself.
Pick the single intent that best matches. Use "help" if none fits.
Intents:
${INTENTS.map((i) => `- ${i}: ${INTENT_HELP[i]}`).join("\n")}`;

/**
 * The model only chooses *which* question was asked. The answer and every
 * number in it are computed from the database, so the copilot can't invent figures.
 */
export const askCopilot = guardedAction({ permission: "ai.use", schema: askSchema }, async ({ question }, actor) => {
  const ai = await structured({ schema: RouteSchema, system: SYSTEM, content: question, effort: "low", maxTokens: 1000 });
  const route: Route = ai.ok ? ai.data : routeOffline(question);
  const result = await answer(route, actor);
  await db.$transaction((tx) =>
    audit(tx, {
      actor,
      action: "copilot.ask",
      entityType: "Copilot",
      summary: `Asked the copilot: "${question.slice(0, 120)}" → ${route.intent}`,
    }),
  );
  return ok<Answer & { routedBy: "ai" | "rules" }>({ ...result, routedBy: ai.ok ? "ai" : "rules" });
});
