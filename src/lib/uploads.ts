import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Local file storage (storage/uploads). No cloud bucket needed; files are
 * served only through /api/uploads/:id with a permission check.
 */

const ROOT = path.join(process.cwd(), "storage", "uploads");
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UPLOAD_PURPOSES = {
  // Logos end up on product pages every member sees, so any signed-in user may view them.
  merch_logo: {
    mimes: ["image/png", "image/jpeg", "image/webp"],
    uploadAny: ["merchandise.studio", "merchandise.manage_products"],
    viewAny: null,
  },
  receipt: {
    mimes: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
    uploadAny: ["finance.create_expense"],
    viewAny: ["finance.view", "finance.approve_expense"],
  },
} as const;
export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

/** Identify the file from its first bytes — never trust the browser's MIME type or the filename. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export const canUpload = (user: CurrentUser, purpose: UploadPurpose) =>
  UPLOAD_PURPOSES[purpose].uploadAny.some((p) => user.permissions.has(p));

export async function saveUpload(user: CurrentUser, purpose: UploadPurpose, file: File) {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false as const, error: "File is larger than 5 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !(UPLOAD_PURPOSES[purpose].mimes as readonly string[]).includes(mime)) {
    return { ok: false as const, error: purpose === "receipt" ? "Upload a PNG, JPEG, WebP or PDF." : "Upload a PNG, JPEG or WebP image." };
  }
  const now = new Date();
  const dir = path.join(ROOT, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
  await mkdir(dir, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${EXT[mime]}`;
  await writeFile(path.join(dir, name), buf);

  const upload = await db.upload.create({
    data: {
      purpose,
      filename: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `upload.${EXT[mime]}`,
      mimeType: mime,
      sizeBytes: buf.length,
      path: path.relative(ROOT, path.join(dir, name)),
      uploadedById: user.id,
    },
  });
  return { ok: true as const, upload };
}

export async function readUpload(relPath: string) {
  const full = path.resolve(ROOT, relPath);
  // Paths come from our own DB, but never allow escaping the storage root.
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) throw new Error("Invalid path");
  return readFile(full);
}

export async function readUploadBase64(uploadId: string) {
  const u = await db.upload.findUnique({ where: { id: uploadId } });
  if (!u) return null;
  return { mimeType: u.mimeType, data: (await readUpload(u.path)).toString("base64") };
}
