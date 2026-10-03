import { z } from "zod";

/**
 * Field rules shared by every form. The same schema runs in the browser
 * (instant feedback) and in the server action (the authoritative check).
 */

/** Empty form inputs arrive as "" — treat them as "not provided". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const personName = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be at most 80 characters")
  .regex(/^[\p{L}][\p{L} .'-]*$/u, "Use letters, spaces, dots, apostrophes or hyphens only");

export const email = z.string().trim().toLowerCase().max(120, "Email is too long").pipe(z.email("Enter a valid email address"));

/** Indian mobile: optional +91 / 0 prefix, then 10 digits starting 6-9. Stored as +91XXXXXXXXXX. */
export const phone = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(?:\+91|0)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"))
    .transform((v) => `+91${v.slice(-10)}`)
    .optional(),
);

export const studentId = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9/-]{4,20}$/, "4–20 characters: letters, digits, / or -")
    .optional(),
);

export const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const optionalText = (max: number, label = "This field") =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `${label} must be at most ${max} characters`).optional());

export const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .url({ protocol: /^https?$/, message: "Enter a full URL starting with http:// or https://" })
    .max(200)
    .optional(),
);

export const optionalEmail = z.preprocess(emptyToUndefined, email.optional());

export const id = z.string().min(1, "Required").max(40);
export const optionalId = z.preprocess(emptyToUndefined, id.optional());

/** HTML date input ("YYYY-MM-DD") → Date. */
export const dateInput = z.coerce.date({ error: "Enter a valid date" });
export const optionalDateInput = z.preprocess(emptyToUndefined, dateInput.optional());
