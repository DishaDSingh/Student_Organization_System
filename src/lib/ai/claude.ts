import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * One door to Claude for every AI feature. Callers get schema-validated data
 * or a reason it wasn't available — never an exception — so each feature can
 * fall back to its offline mode (templates, OCR, rules) and the app keeps working
 * without internet or an API key.
 */

export const AI_MODEL = "claude-opus-5-5";

/** Claude is used only when credentials are configured; otherwise features go straight to their offline path. */
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 }));

export type AiResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; reason: "not_configured" | "offline" | "refused" | "invalid" | "error"; detail?: string };

export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<AiResult<z.infer<S>>> {
  if (!aiConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const response = await getClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      // If the primary model declines on policy grounds, the API retries on a suitable fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    });

    if (response.stop_reason === "refusal")
      return { ok: false, reason: "refused", detail: response.stop_details?.explanation ?? undefined };
    if (response.parsed_output == null) return { ok: false, reason: "invalid", detail: `stop_reason: ${response.stop_reason}` };
    return { ok: true, data: response.parsed_output as z.infer<S>, model: response.model };
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, reason: "offline", detail: e.message };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: "not_configured", detail: "API key rejected" };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "error", detail: "Rate limited — try again shortly" };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: "error", detail: `API error ${e.status}` };
    console.error("[ai] unexpected error", e);
    return { ok: false, reason: "error" };
  }
}

export const AI_UNAVAILABLE_MESSAGE: Record<Exclude<AiResult<unknown>, { ok: true }>["reason"], string> = {
  not_configured: "AI isn't set up on this server, so the offline generator was used.",
  offline: "Couldn't reach the AI service (offline?), so the offline generator was used.",
  refused: "The AI declined this request, so the offline generator was used.",
  invalid: "The AI response couldn't be used, so the offline generator was used.",
  error: "The AI service had a problem, so the offline generator was used.",
};
