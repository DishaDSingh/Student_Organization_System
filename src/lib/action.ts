import "server-only";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import type { PermissionKey } from "@/lib/rbac/catalog";

/** Uniform result every server action returns, so forms can show errors inline. */
export type ActionResult<T = undefined> =
  { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const fail = (error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});

export const ok = <T = undefined>(data?: T, message?: string): ActionResult<T> => ({
  ok: true,
  data: data as T,
  message,
});

/**
 * Wraps a server action with: authentication, permission check and Zod
 * validation of the raw input. The server never trusts the client-side
 * validation — this is the authoritative check.
 */
export function guardedAction<S extends z.ZodType, R>(
  opts: { permission?: PermissionKey | PermissionKey[]; schema: S },
  handler: (input: z.infer<S>, user: CurrentUser) => Promise<ActionResult<R>>,
) {
  return async (raw: unknown): Promise<ActionResult<R>> => {
    const user = await getCurrentUser();
    if (!user) return fail("Your session has expired. Please sign in again.");

    if (opts.permission) {
      const needed = Array.isArray(opts.permission) ? opts.permission : [opts.permission];
      if (!needed.some((p) => user.permissions.has(p))) return fail("You don't have permission to do that.");
    }

    const parsed = opts.schema.safeParse(raw);
    if (!parsed.success) {
      return fail("Please fix the highlighted fields.", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);
    }

    try {
      return await handler(parsed.data, user);
    } catch (e) {
      // Unique-constraint violations become a friendly message instead of a 500.
      if (typeof e === "object" && e && "code" in e && e.code === "P2002") {
        return fail("That value is already in use.");
      }
      console.error(e);
      return fail("Something went wrong. Please try again.");
    }
  };
}
