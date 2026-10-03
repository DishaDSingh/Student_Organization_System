import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Stateless signed session cookie. It only carries the user id and a
 * session version; permissions are always re-read from the database, so a
 * role change or suspension takes effect on the very next request.
 */
export const SESSION_COOKIE = "cb_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = { uid: string; ver: number };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars). See .env.example");
  return new TextEncoder().encode(secret);
}

export async function createSession(uid: string, ver: number) {
  const token = await new SignJWT({ uid, ver } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.ver !== "number") return null;
    return { uid: payload.uid, ver: payload.ver };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
