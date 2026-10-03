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
