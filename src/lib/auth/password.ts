import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Readable temporary password, e.g. "Kite-Lamp-4821". Shown once to the admin. */
export function generateTempPassword() {
  const words = ["Kite", "Lamp", "Maple", "River", "Comet", "Pixel", "Tiger", "Cedar", "Orbit", "Quill", "Ember", "Lotus"];
  const pick = () => words[randomInt(words.length)];
  return `${pick()}-${pick()}-${randomInt(1000, 10000)}`;
}
