import { fakerEN_IN as faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Deterministic demo data: the same seed always produces the same people,
 * roles and history. Dates are anchored to "today" so time-sensitive demo
 * stories (expiring memberships, upcoming events) stay true on demo day.
 */
export const SEED = 2026;
faker.seed(SEED);
export const TODAY = new Date(new Date().setHours(0, 0, 0, 0));
faker.setDefaultRefDate(TODAY);
export { faker };

export const DAY = 24 * 60 * 60 * 1000;
export const daysAgo = (n: number) => new Date(TODAY.getTime() - n * DAY);
export const daysFromNow = (n: number) => new Date(TODAY.getTime() + n * DAY);

/** Random timestamp between `fromDaysAgo` and `toDaysAgo` days in the past. */
export const between = (fromDaysAgo: number, toDaysAgo = 0) => faker.date.between({ from: daysAgo(fromDaysAgo), to: daysAgo(toDaysAgo) });

export function createClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}
export type Db = ReturnType<typeof createClient>;

/** Shared demo password for every seeded account — documented in README "Demo logins". */
export const DEMO_PASSWORD = "CampusBuzz@2026";
export const EMAIL_DOMAIN = "horizon.test";
