import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { syncPermissionCatalog } from "@/lib/rbac/sync";
import { runRenewalReminders } from "@/lib/membership/reminders";
import { releaseExpiredHolds } from "@/lib/events/service";
import { releaseExpiredMerchHolds } from "@/lib/merch/service";

/**
 * Local background jobs — no cloud scheduler needed.
 *  - Keep the Permission table in sync with the code catalog (new phases add permissions).
 *  - Every 30 minutes: renewal reminders (idempotent) and releasing seats held by unpaid orders.
 */
const EVERY_30_MINUTES = 30 * 60 * 1000;
const g = globalThis as unknown as { __campusbuzzJobs?: NodeJS.Timeout };

async function tick(db: PrismaClient) {
  try {
    const sent = await runRenewalReminders(db);
    if (sent) console.log(`[jobs] sent ${sent} renewal reminder(s)`);
    const released = await releaseExpiredHolds(db);
    if (released) console.log(`[jobs] released seats from ${released} unpaid order(s)`);
    const merch = await releaseExpiredMerchHolds(db);
    if (merch) console.log(`[jobs] returned stock from ${merch} unpaid merch order(s)`);
  } catch (e) {
    console.error("[jobs] background tick failed", e);
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
  g.__campusbuzzJobs = setInterval(() => void tick(db), EVERY_30_MINUTES);
  console.log("[jobs] started — permission catalog synced, renewal reminders + seat-hold expiry every 30 min");
}

void start();
