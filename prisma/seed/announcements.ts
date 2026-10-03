import { daysAgo, type Db } from "./shared";

/** Phase 22 seed: a few sent announcements and one AI draft waiting for review. */
export async function seedAnnouncements(db: Db) {
  const [president, comms, members] = await Promise.all([
    db.user.findFirst({ where: { roles: { some: { role: { key: "president" } } } }, select: { id: true } }),
    db.user.findFirst({ where: { roles: { some: { role: { key: "social_media_lead" } } } }, select: { id: true } }),
    db.user.count({
      where: {
        status: "ACTIVE",
        memberships: { some: { status: "ACTIVE", startDate: { lte: new Date() }, endDate: { gte: new Date() } } },
      },
    }),
  ]);
  const author = comms?.id ?? president?.id ?? null;
  const sent = [
    {
      title: "Welcome, freshers! 🎉",
      body: "The Freshers' Welcome Mixer is this Saturday from 5 pm in the Main Auditorium. Bring your digital pass — it's on the My pass page — and come say hi to the committee.\n\nSee you there!",
      days: 2,
    },
    {
      title: "Diwali Gala tickets are on sale",
      body: "Diwali Gala Night is on 7 November. Member tickets are cheaper — buy from the Events page and keep your QR ticket handy at the door.\n\nEarly-bird seats are limited.",
      days: 20,
    },
    {
      title: "Volunteers wanted for Garba Night",
      body: "We need help with set-up, check-in and the food stalls on 12 October. Sign up from the Volunteering page and pick the times that suit you.",
      days: 9,
    },
  ];
  await db.announcement.createMany({
    data: sent.map((a) => ({
      title: a.title,
      body: a.body,
      audience: "MEMBERS",
      status: "PUBLISHED",
      recipients: members,
      createdById: author,
      publishedById: president?.id ?? null,
      publishedAt: daysAgo(a.days),
      createdAt: daysAgo(a.days + 1),
    })),
  });
  await db.announcement.create({
    data: {
      title: "Your membership ends this week — renew in two minutes",
      body: "Hi! Your Horizon membership ends this week. Renew from the My membership page (UPI or cash at the help desk) to keep member prices for the Diwali Gala and your digital pass.\n\nRenewal price: [add price]\n\n— Horizon Student Association",
      audience: "EXPIRING",
      source: "ai",
      createdById: author,
    },
  });
  return { sent: sent.length, drafts: 1 };
}
