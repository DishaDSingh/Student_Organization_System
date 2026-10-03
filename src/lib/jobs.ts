import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { syncPermissionCatalog } from "@/lib/rbac/sync";
import { runRenewalReminders } from "@/lib/membership/reminders";

/**
 * Local background jobs — no cloud scheduler needed.
 *  - Keep the Permission table in sync with the code catalog (new phases add permissions).
 *  - Send renewal reminders on start-up and every 6 hours (idempotent).
 */
const EVERY_6_HOURS = 6 * 60 * 60 * 1000;
const g = globalThis as unknown as { __campusbuzzJobs?: NodeJS.Timeout };

async function tick(db: PrismaClient) {
  try {
    const sent = await runRenewalReminders(db);
    if (sent) console.log(`[jobs] sent ${sent} renewal reminder(s)`);
  } catch (e) {
    console.error("[jobs] renewal reminders failed", e);
  }
}

async function start() {
  if (g.__campusbuzzJobs) return; // dev hot reload: keep a single timer
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    if (await db.organization.count()) await syncPermissionCatalog(db);
  } catch (e) {
    console.error("[jobs] permission sync failed (is the database running?)", e);
    return;
  }
  await tick(db);
  g.__campusbuzzJobs = setInterval(() => void tick(db), EVERY_6_HOURS);
  console.log("[jobs] started — permission catalog synced, renewal reminders every 6 h");
}

void start();
