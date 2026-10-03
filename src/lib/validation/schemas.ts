import { z } from "zod";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/rbac/catalog";
import { ROLE_COLORS } from "@/lib/rbac/presets";
import {
  dateInput,
  email,
  id,
  optionalDateInput,
  optionalEmail,
  optionalId,
  optionalText,
  optionalUrl,
  password,
  personName,
  phone,
  studentId,
} from "./common";

const permissionKey = z.enum(ALL_PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(72),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });

// ─── Organization ────────────────────────────────────────────────────────────

export const organizationSchema = z.object({
  name: z.string().trim().min(3, "At least 3 characters").max(100, "At most 100 characters"),
  shortName: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(16, "At most 16 characters")
    .regex(/^[\p{L}\d &.-]+$/u, "Letters, digits, spaces, & . - only"),
  institution: optionalText(120, "Institution"),
  description: optionalText(500, "Description"),
  email: optionalEmail,
  phone,
  website: optionalUrl,
  address: optionalText(250, "Address"),
  academicYearStart: z.coerce.number().int().min(1).max(12),
  allowSelfRegistration: z.boolean().default(true),
  upiId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{2,256}@[a-z]{2,64}$/, "Enter a valid UPI ID, e.g. hsa@okicici")
      .optional(),
  ),
});

/** First-run wizard: the organization plus its Master Admin account. */
export const setupSchema = z
  .object({
    org: organizationSchema,
    admin: z.object({ name: personName, email, phone, password, confirmPassword: z.string() }),
  })
  .refine((v) => v.admin.password === v.admin.confirmPassword, {
    path: ["admin", "confirmPassword"],
    message: "Passwords don't match",
  });

// ─── Users ───────────────────────────────────────────────────────────────────

const userProfile = {
  name: personName,
  email,
  phone,
  studentId,
  departmentId: optionalId,
};

export const createUserSchema = z.object({
  ...userProfile,
  roleIds: z.array(id).max(20).default([]),
});

export const updateUserSchema = z.object({ userId: id, ...userProfile });

export const setUserStatusSchema = z.object({ userId: id, status: z.enum(["ACTIVE", "SUSPENDED"]) });

export const setUserRolesSchema = z.object({ userId: id, roleIds: z.array(id).max(20) });

export const setOverridesSchema = z.object({
  userId: id,
  overrides: z
    .array(
      z.object({
        permissionKey,
        effect: z.enum(["GRANT", "DENY"]),
        reason: optionalText(200, "Reason"),
      }),
    )
    .max(ALL_PERMISSION_KEYS.length),
});

export const userIdSchema = z.object({ userId: id });

// ─── Roles ───────────────────────────────────────────────────────────────────

export const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(40, "At most 40 characters")
    .regex(/^[\p{L}\d][\p{L}\d &/().-]*$/u, "Letters, digits, spaces and & / ( ) . - only"),
  description: optionalText(200, "Description"),
  color: z.enum(ROLE_COLORS),
});

export const createRoleSchema = roleSchema.extend({ cloneFromId: optionalId });
export const updateRoleSchema = roleSchema.extend({ roleId: id });

export const setRolePermissionsSchema = z.object({
  roleId: id,
  permissions: z.array(permissionKey).max(ALL_PERMISSION_KEYS.length),
});

export const roleIdSchema = z.object({ roleId: id });

// ─── Departments & committees ────────────────────────────────────────────────

export const departmentSchema = z.object({
  departmentId: optionalId,
  name: z.string().trim().min(2, "At least 2 characters").max(60, "At most 60 characters"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}$/, "2–6 letters, e.g. FIN"),
  description: optionalText(300, "Description"),
  headId: optionalId,
});

export const committeeSchema = z
  .object({
    committeeId: optionalId,
    name: z.string().trim().min(3, "At least 3 characters").max(80, "At most 80 characters"),
    description: optionalText(400, "Description"),
    departmentId: optionalId,
    chairId: optionalId,
    termStart: dateInput,
    termEnd: optionalDateInput,
    isActive: z.boolean().default(true),
  })
  .refine((v) => !v.termEnd || v.termEnd > v.termStart, { path: ["termEnd"], message: "End must be after start" });

export const committeeMemberSchema = z.object({
  committeeId: id,
  userId: id,
  position: z.string().trim().min(2, "At least 2 characters").max(40, "At most 40 characters"),
});

export const removeCommitteeMemberSchema = z.object({ committeeId: id, userId: id });
export const deleteByIdSchema = z.object({ id });

// ─── Membership (Phase 3) ────────────────────────────────────────────────────

export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "ONLINE"] as const;
export const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
};

/** UTR / UPI transaction id / cheque no. */
const paymentReference = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9/-]{4,40}$/, "4–40 letters, digits, / or -")
    .optional(),
);

/** Cash needs no reference; every traceable method does. */
const paymentFields = z
  .object({ method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }), reference: paymentReference })
  .refine((v) => v.method === "CASH" || !!v.reference, { path: ["reference"], message: "Enter the transaction reference" });

const rupees = z.coerce
  .number({ error: "Enter an amount" })
  .min(0, "Can't be negative")
  .max(100000, "That's more than ₹1,00,000")
  .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "At most 2 decimal places");

export const planSchema = z.object({
  planId: optionalId,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,12}$/, "2–12 letters or digits, e.g. ANNUAL"),
  name: z.string().trim().min(3, "At least 3 characters").max(40, "At most 40 characters"),
  description: optionalText(200, "Description"),
  durationMonths: z.coerce.number().int("Whole months only").min(1, "At least 1 month").max(60, "At most 60 months"),
  priceRupees: rupees,
  isActive: z.boolean().default(true),
  benefitIds: z.array(id).max(30).default([]),
});

export const benefitSchema = z.object({
  benefitId: optionalId,
  title: z.string().trim().min(3, "At least 3 characters").max(80, "At most 80 characters"),
  description: optionalText(200, "Description"),
  isActive: z.boolean().default(true),
});

const memberExtras = {
  program: optionalText(80, "Programme"),
  yearOfStudy: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1, "1–6").max(6, "1–6").optional()),
};

/** Staff registering a member at the desk: an existing account or a new person. */
export const registerMemberSchema = z
  .object({
    existingUserId: optionalId,
    name: z.preprocess((v) => (v === "" ? undefined : v), personName.optional()),
    email: z.preprocess((v) => (v === "" ? undefined : v), email.optional()),
    phone,
    studentId,
    ...memberExtras,
    planId: id,
    payNow: z.boolean().default(true),
    method: z.enum(PAYMENT_METHODS).optional(),
    reference: paymentReference,
  })
  .superRefine((v, ctx) => {
    if (!v.existingUserId) {
      if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "Enter the member's name" });
      if (!v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Enter the member's email" });
    }
    if (v.payNow) {
      if (!v.method) ctx.addIssue({ code: "custom", path: ["method"], message: "Choose how it was paid" });
      else if (v.method !== "CASH" && !v.reference)
        ctx.addIssue({ code: "custom", path: ["reference"], message: "Enter the transaction reference" });
    }
  });

export const confirmPaymentSchema = z.intersection(z.object({ membershipId: id, notes: optionalText(200, "Notes") }), paymentFields);

export const staffRenewSchema = z.intersection(z.object({ userId: id, planId: id }), paymentFields);

export const cancelMembershipSchema = z.object({
  membershipId: id,
  reason: z.string().trim().min(3, "Give a short reason").max(200, "At most 200 characters"),
});

export const memberProfileSchema = z.object({ userId: id, ...memberExtras });

/** A member asking to renew from their own account (paid later or via UPI reference). */
export const selfRenewSchema = z.object({ planId: id, reference: paymentReference });

/** Public sign-up at /join. `website` is a honeypot that real people never fill in. */
export const joinSchema = z
  .object({
    name: personName,
    email,
    phone: phone.refine((v) => !!v, "Enter your mobile number"),
    studentId: studentId.refine((v) => !!v, "Enter your roll / enrollment number"),
    ...memberExtras,
    planId: id,
    reference: paymentReference,
    password,
    confirmPassword: z.string(),
    website: z.string().max(0).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" });

export const verifyLookupSchema = z.object({ query: z.string().trim().min(2, "Type at least 2 characters").max(80) });

// ─── Events & tickets (Phase 4) ──────────────────────────────────────────────

const EVENT_CATEGORY_VALUES = ["Gala", "Cultural", "Workshop", "Tech", "Sports", "Social", "Talk", "Fundraiser"] as const;
const dateTime = z.coerce.date({ error: "Enter a valid date and time" });
const optionalDateTime = z.preprocess((v) => (v === "" || v == null ? undefined : v), dateTime.optional());

export const eventSchema = z
  .object({
    eventId: optionalId,
    title: z.string().trim().min(3, "At least 3 characters").max(120, "At most 120 characters"),
    description: optionalText(2000, "Description"),
    category: z.enum(EVENT_CATEGORY_VALUES, { error: "Choose a category" }),
    venue: z.string().trim().min(2, "Where is it?").max(120, "At most 120 characters"),
    startsAt: dateTime,
    endsAt: dateTime,
    capacity: z.coerce.number().int("Whole number").min(1, "At least 1").max(20000, "At most 20,000"),
    salesOpenAt: optionalDateTime,
    salesCloseAt: optionalDateTime,
    organizerId: optionalId,
    committeeId: optionalId,
  })
  .refine((v) => v.endsAt > v.startsAt, { path: ["endsAt"], message: "Must end after it starts" })
  .refine((v) => !v.salesCloseAt || v.salesCloseAt <= v.endsAt, {
    path: ["salesCloseAt"],
    message: "Sales must close before the event ends",
  })
  .refine((v) => !v.salesOpenAt || !v.salesCloseAt || v.salesOpenAt < v.salesCloseAt, {
    path: ["salesCloseAt"],
    message: "Must be after sales open",
  });

export const ticketTypeSchema = z
  .object({
    ticketTypeId: optionalId,
    eventId: id,
    name: z.string().trim().min(2, "At least 2 characters").max(40, "At most 40 characters"),
    description: optionalText(160, "Description"),
    memberPriceRupees: rupees,
    publicPriceRupees: rupees,
    quantity: z.coerce.number().int("Whole number").min(1, "At least 1").max(20000, "At most 20,000"),
    maxPerOrder: z.coerce.number().int().min(1, "At least 1").max(10, "At most 10"),
    membersOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.memberPriceRupees <= v.publicPriceRupees, {
    path: ["memberPriceRupees"],
    message: "Member price can't exceed the public price",
  });

const ticketLines = z
  .array(z.object({ ticketTypeId: id, quantity: z.coerce.number().int().min(0).max(10) }))
  .max(10)
  .transform((lines) => lines.filter((l) => l.quantity > 0))
  .refine((lines) => lines.length > 0, "Choose at least one ticket")
  .refine((lines) => lines.reduce((s, l) => s + l.quantity, 0) <= 10, "At most 10 tickets per order");

export const buyTicketsSchema = z.object({ eventId: id, lines: ticketLines, reference: paymentReference });

export const doorSaleSchema = z
  .object({
    eventId: id,
    memberId: optionalId,
    buyerName: z.preprocess((v) => (v === "" ? undefined : v), personName.optional()),
    buyerPhone: phone,
    lines: ticketLines,
    method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid" }),
    reference: paymentReference,
  })
  .refine((v) => !!v.memberId || !!v.buyerName, { path: ["buyerName"], message: "Enter the buyer's name or pick a member" })
  .refine((v) => v.method === "CASH" || !!v.reference, { path: ["reference"], message: "Enter the transaction reference" });

export const confirmOrderSchema = z.intersection(z.object({ orderId: id }), paymentFields);
export const voidOrderSchema = z.object({ orderId: id, reason: z.string().trim().min(3, "Give a short reason").max(200) });
export const cancelEventSchema = z.object({ eventId: id, reason: z.string().trim().min(5, "Tell attendees why").max(300) });
export const eventIdSchema = z.object({ eventId: id });

export const incidentSchema = z.object({
  eventId: id,
  title: z.string().trim().min(3, "What happened?").max(120),
  details: optionalText(1000, "Details"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  location: optionalText(80, "Location"),
});
export const resolveIncidentSchema = z.object({ incidentId: id, resolution: z.string().trim().min(3, "How was it resolved?").max(300) });
export const checkInSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,64}$/, "Not a ticket code"),
});
