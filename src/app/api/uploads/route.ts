import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canUpload, saveUpload, UPLOAD_PURPOSES, type UploadPurpose } from "@/lib/uploads";

/** POST /api/uploads (multipart: file, purpose) → { id, url } */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const purpose = form?.get("purpose");
  if (!(file instanceof File) || typeof purpose !== "string" || !(purpose in UPLOAD_PURPOSES)) {
    return NextResponse.json({ error: "Send a file and a valid purpose." }, { status: 400 });
  }
  if (!canUpload(user, purpose as UploadPurpose)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res = await saveUpload(user, purpose as UploadPurpose, file);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });
  return NextResponse.json({ id: res.upload.id, url: `/api/uploads/${res.upload.id}`, filename: res.upload.filename }, { status: 201 });
}
