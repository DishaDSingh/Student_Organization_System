import "dotenv/config";
import { createClient } from "./shared";
import { seedPeople } from "./people";
import { seedMembership } from "./membership";

/**
 * `npm run db:seed` — wipes the local database and rebuilds the demo dataset.
 * Each phase adds its own module below, in dependency order.
 */
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
  const db = createClient();

  try {
    console.log("Resetting demo data…");
    // Children before parents. Later phases prepend their tables here.
    await db.notification.deleteMany();
    await db.passVerification.deleteMany();
    await db.payment.deleteMany();
    await db.membership.deleteMany();
    await db.planBenefit.deleteMany();
    await db.membershipBenefit.deleteMany();
    await db.membershipPlan.deleteMany();
    await db.auditLog.deleteMany();
    await db.committeeMember.deleteMany();
    await db.committee.deleteMany();
    await db.userPermission.deleteMany();
    await db.userRole.deleteMany();
    await db.department.updateMany({ data: { headId: null } });
    await db.user.deleteMany();
    await db.department.deleteMany();
    await db.rolePermission.deleteMany();
    await db.role.deleteMany();
    await db.organization.deleteMany();

    console.log("Phase 1–2: organization, people, roles, committees…");
    const people = await seedPeople(db);
    console.table(people);

    console.log("Phase 3: plans, memberships, payments, pass checks, reminders…");
    console.table(await seedMembership(db));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
