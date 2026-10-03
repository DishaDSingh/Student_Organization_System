import "dotenv/config";
import { SEED_SIZE, createClient } from "./shared";
import { seedPeople } from "./people";
import { seedMembership } from "./membership";
import { seedEvents } from "./events";
import { seedMerch } from "./merch";
import { seedFundraisers } from "./fundraisers";
import { seedFinance } from "./finance";
import { seedMemory } from "./memory";
import { seedSecurity } from "./security";
import { seedAnnouncements } from "./announcements";

/**
 * `npm run db:seed` — wipes the local database and rebuilds the demo dataset.
 * Each phase adds its own module below, in dependency order.
 */
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
  const db = createClient();

  try {
    console.log(`Resetting demo data (${SEED_SIZE} dataset)…`);
    // Children before parents. Later phases prepend their tables here.
    await db.announcement.deleteMany();
    await db.cameraAccess.deleteMany();
    await db.camera.deleteMany();
    await db.memoryItem.deleteMany();
    await db.calendarEntry.deleteMany();
    await db.meeting.deleteMany();
    await db.report.deleteMany();
    await db.budget.deleteMany();
    await db.expense.deleteMany();
    await db.task.deleteMany();
    await db.volunteerProfile.deleteMany();
    await db.stockMovement.deleteMany();
    await db.merchOrderItem.deleteMany();
    await db.eventIncident.deleteMany();
    await db.ticket.deleteMany();
    await db.notification.deleteMany();
    await db.passVerification.deleteMany();
    await db.payment.deleteMany();
    await db.ticketOrder.deleteMany();
    await db.merchOrder.deleteMany();
    await db.productVariant.deleteMany();
    await db.product.deleteMany();
    await db.merchDesign.deleteMany();
    await db.fundraiser.deleteMany();
    await db.upload.deleteMany();
    await db.ticketType.deleteMany();
    await db.event.deleteMany();
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

    console.log("Phase 4: events, tickets, check-ins, incidents…");
    console.table(await seedEvents(db));

    console.log("Phase 5: merchandise, stock, orders, studio designs…");
    console.table(await seedMerch(db));

    console.log("Phase 6: volunteers, fundraisers, tasks, donations…");
    console.table(await seedFundraisers(db));

    console.log("Phase 7-8: expenses and reimbursements...");
    console.table(await seedFinance(db));

    console.log("Phases 14-19: memory, meetings, calendar deadlines...");
    console.table(await seedMemory(db));

    console.log("Phase 15: security cameras...");
    console.table(await seedSecurity(db));

    console.log("Phase 22: announcements...");
    console.table(await seedAnnouncements(db));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
