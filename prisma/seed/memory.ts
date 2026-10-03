import type { Prisma } from "../../src/generated/prisma/client";
import { extractOffline } from "../../src/lib/meetings/extract";
import { DAY, daysAgo, daysFromNow, type Db } from "./shared";

/**
 * Phases 14, 16, 19 seed: organization memory, meetings and calendar deadlines.
 * Story: last year's Diwali Gala left lessons and a debrief meeting; this
 * year's Gala planning notes are waiting for someone to review them.
 */

type Item = { kind: string; title: string; body: string; tags: string[]; event?: string; url?: string; when?: Date };

const ITEMS: Item[] = [
  // Lessons
  {
    kind: "LESSON",
    event: "Diwali Gala Night 2025",
    title: "Food ran out at counter 2 by 8 pm",
    body: "Order about 20% more food than the ticket count suggests; counter 2 near the entrance gets the most traffic.",
    tags: ["gala", "food"],
  },
  {
    kind: "LESSON",
    event: "Diwali Gala Night 2025",
    title: "Two entry lanes weren't enough after 7 pm",
    body: "The queue reached 25 minutes at peak. Open a third scanning lane and start check-in 30 minutes earlier.",
    tags: ["gala", "check-in"],
  },
  {
    kind: "LESSON",
    event: "Diwali Gala Night 2025",
    title: "Early-bird tickets sold out in two days",
    body: "Demand was high early; release a second early-bird batch or raise the early-bird quantity next year.",
    tags: ["gala", "tickets", "pricing"],
  },
  {
    kind: "LESSON",
    event: "Spring Gala 2026",
    title: "Book the sound vendor six weeks ahead",
    body: "Last-minute booking cost about 30% more. Sonic Sound & Lights offers a student rate if booked early.",
    tags: ["gala", "sound", "vendor"],
  },
  {
    kind: "LESSON",
    event: "Spring Gala 2026",
    title: "The photo booth was the most-shared moment",
    body: "Over 200 photos tagged the society on Instagram. Keep the booth and look for a sponsor for it.",
    tags: ["gala", "social media", "sponsor"],
  },
  {
    kind: "LESSON",
    event: "Freshers' Welcome Mixer",
    title: "WhatsApp reminders the day before cut no-shows",
    body: "Sending a reminder 24 hours before reduced no-shows from about 25% to 12%.",
    tags: ["freshers", "attendance", "reminders"],
  },
  {
    kind: "LESSON",
    event: "Tech Fest Hackathon 2026",
    title: "Every table needs a power strip",
    body: "Teams lost time hunting for sockets. Rent 40 power strips with the venue.",
    tags: ["hackathon", "logistics"],
  },
  {
    kind: "LESSON",
    event: "Beach Clean-up Drive",
    title: "Keep a monsoon backup date for outdoor events",
    body: "The clean-up was cancelled because of heavy rain. Check the forecast a week ahead and announce a backup date with the event.",
    tags: ["outdoor", "weather"],
  },
  {
    kind: "LESSON",
    title: "M and L hoodies sell out first",
    body: "M and L made up about 55% of hoodie sales. Order sizes roughly 10% XS, 20% S, 30% M, 25% L, 15% XL+.",
    tags: ["merch", "hoodie", "sizes"],
  },
  {
    kind: "LESSON",
    title: "Pre-orders reduce leftover stock",
    body: "Taking pre-orders for the Varsity Hoodie left only 6 unsold, compared with 40 the year before.",
    tags: ["merch", "stock"],
  },
  {
    kind: "LESSON",
    title: "UPI QR posters doubled small donations",
    body: "Posters with a UPI QR at every stall doubled donations under ₹200 during the Bake Sale.",
    tags: ["fundraiser", "donations", "upi"],
  },
  // Decisions
  {
    kind: "DECISION",
    title: "Member ticket discount stays at 20%",
    body: "Agreed by the committee: member prices are 20% below public prices for all paid events.",
    tags: ["tickets", "pricing", "members"],
  },
  {
    kind: "DECISION",
    title: "Merch profits go to the event fund",
    body: "Profit from merchandise sales is set aside for event deposits.",
    tags: ["merch", "finance"],
  },
  {
    kind: "DECISION",
    title: "Expenses above ₹5,000 need pre-approval",
    body: "Any purchase above ₹5,000 must be approved by the treasurer before it is made, not just reimbursed after.",
    tags: ["finance", "expenses", "policy"],
  },
  {
    kind: "DECISION",
    title: "Gala venue: Lakeside Banquets",
    body: "The Diwali Gala moves to Lakeside Banquets for its larger hall and student discount.",
    tags: ["gala", "venue"],
  },
  // Vendors
  {
    kind: "VENDOR",
    title: "Sonic Sound & Lights",
    body: "Reliable sound and lighting. Student rate if booked 6+ weeks ahead. Contact the operations desk; 30% advance.",
    tags: ["sound", "lights", "vendor"],
  },
  {
    kind: "VENDOR",
    title: "Lakeside Banquets",
    body: "10% discount for registered student bodies. 30% deposit, balance 7 days before the event. Hall fits 180.",
    tags: ["venue", "gala", "vendor"],
  },
  {
    kind: "VENDOR",
    title: "Threadcraft Apparel",
    body: "Hoodies and tees; 3-week lead time, minimum 30 pieces per design. Good print quality.",
    tags: ["merch", "hoodie", "vendor"],
  },
  {
    kind: "VENDOR",
    title: "Print Point",
    body: "Same-day posters and flex banners near campus; GST invoice on request.",
    tags: ["printing", "posters", "vendor"],
  },
  // Sponsors
  {
    kind: "SPONSOR",
    title: "Café Coffee Day (campus outlet)",
    body: "Sponsored coffee for Freshers (worth about ₹15,000, in kind). Contact through the store manager; wants a stall mention.",
    tags: ["sponsor", "freshers", "food"],
  },
  {
    kind: "SPONSOR",
    title: "Zenith Tech",
    body: "Title sponsor for Tech Fest Hackathon 2026, ₹50,000. Asks for its logo on volunteer t-shirts and a 5-minute talk.",
    tags: ["sponsor", "hackathon", "tech"],
  },
  {
    kind: "SPONSOR",
    title: "City Cooperative Bank",
    body: "Sponsored a stall at Garba Night; interested in student account sign-ups at events.",
    tags: ["sponsor", "garba", "finance"],
  },
  // Documents & notes
  {
    kind: "DOCUMENT",
    title: "Constitution (2024 revision)",
    body: "The society's constitution, including election rules and the treasurer's signing limits.",
    tags: ["governance", "constitution"],
    url: "https://docs.example.org/horizon/constitution-2024",
  },
  {
    kind: "DOCUMENT",
    title: "Venue booking checklist",
    body: "Step-by-step checklist: dean's permission, deposit, security, cleaning, power backup, insurance.",
    tags: ["events", "venue", "checklist"],
    url: "https://docs.example.org/horizon/venue-checklist",
  },
  {
    kind: "DOCUMENT",
    title: "Brand guidelines",
    body: "Logo files, colours and poster templates for events and merch.",
    tags: ["brand", "design", "merch"],
    url: "https://docs.example.org/horizon/brand",
  },
  {
    kind: "NOTE",
    title: "Dean's office needs event permission 3 weeks ahead",
    body: "Submit the event permission form at least 21 days before any on-campus event with outside guests.",
    tags: ["events", "permission", "dean"],
  },
];

const DEBRIEF_NOTES = `Diwali Gala 2025 debrief
Attendees: Ishita, Rohan, Priya, Arjun, Kavya
- Decided: next year's gala stays on the first Saturday of November
- Decided: open a third entry lane from 6:30 pm
- Agreed to order 20% more food for counter 2
- Action: @Kavya to collect vendor feedback forms by 20 Nov
- Rohan will write the gala report by 25 Nov
- Can we find a sponsor for the photo booth?
- Open question: should VIP tables include dinner?`;

const PLANNING_NOTES = `Diwali Gala 2026 planning
Attendees: Ishita, Rohan, Priya, Arjun
- Decided: ticket price stays at ₹800 for members
- We agreed to book Lakeside Banquets for the gala
[00:12:30] Rohan: Can we get a sponsor for the photo booth?
- Action: @Priya to send the sponsor deck to 3 companies by Friday
- Arjun will confirm the DJ booking by 10 Oct
- TODO: update the event page with the final menu (owner: Rohan) by tomorrow
- Should we sell tickets at the door?
- General chat about last year's gala and the food queue`;

export async function seedMemory(db: Db) {
  const [events, president, treasurer, committee] = await Promise.all([
    db.event.findMany({ select: { id: true, title: true, startsAt: true } }),
    db.user.findFirst({ where: { roles: { some: { role: { key: "president" } } } }, select: { id: true } }),
    db.user.findFirst({ where: { roles: { some: { role: { key: "treasurer" } } } }, select: { id: true } }),
    db.committee.findFirst({ where: { name: { contains: "Cultural" } }, select: { id: true } }),
  ]);
  const event = (t?: string) => (t ? events.find((e) => e.title === t) : undefined);

  // ── Memory ──
  await db.memoryItem.createMany({
    data: ITEMS.map((i, n) => {
      const e = event(i.event);
      return {
        kind: i.kind,
        title: i.title,
        body: i.body,
        tags: i.tags,
        eventId: e?.id ?? null,
        url: i.url ?? null,
        happenedAt: e ? new Date(e.startsAt.getTime() + 3 * DAY) : daysAgo(40 + n * 9),
        createdById: president?.id ?? null,
      };
    }),
  });

  // ── Meetings: last year's debrief (confirmed) and this year's planning (waiting for review) ──
  const lastGala = event("Diwali Gala Night 2025");
  const debriefAt = lastGala ? new Date(lastGala.startsAt.getTime() + 5 * DAY) : daysAgo(330);
  const debrief = extractOffline(DEBRIEF_NOTES, debriefAt, "Diwali Gala 2025 debrief");
  const confirmed = await db.meeting.create({
    data: {
      title: "Diwali Gala 2025 debrief",
      heldAt: debriefAt,
      committeeId: committee?.id ?? null,
      notes: DEBRIEF_NOTES,
      status: "CONFIRMED",
      source: "rules",
      confirmedAt: debriefAt,
      extracted: {
        summary: "The team reviewed the 2025 gala: strong sales, a long entry queue after 7 pm and food running short at one counter.",
        decisions: debrief.decisions,
        questions: debrief.questions,
        actions: debrief.actions.map((a) => ({ task: a.task, ownerId: null, due: a.due, created: true })),
      } as Prisma.InputJsonValue,
      createdById: president?.id ?? null,
    },
  });
  await db.memoryItem.createMany({
    data: debrief.decisions.map((d) => ({
      kind: "DECISION",
      title: d.slice(0, 140),
      body: `${d} (decided at "Diwali Gala 2025 debrief")`,
      tags: ["meeting", "gala"],
      happenedAt: debriefAt,
      meetingId: confirmed.id,
      createdById: president?.id ?? null,
    })),
  });
  await db.meeting.create({
    data: {
      title: "Diwali Gala 2026 planning",
      heldAt: new Date(daysAgo(0).getTime() - 6 * 3_600_000), // yesterday evening
      committeeId: committee?.id ?? null,
      notes: PLANNING_NOTES,
      createdById: president?.id ?? null,
    },
  });

  // ── Calendar deadlines ──
  const at = (days: number, hour: number) => new Date(daysFromNow(days).getTime() + hour * 3_600_000);
  await db.calendarEntry.createMany({
    data: [
      { title: "Submit Freshers report to the Dean", kind: "DEADLINE", startsAt: at(5, 17), notes: "Use Reports → Event report" },
      { title: "Lakeside Banquets deposit due (Diwali Gala)", kind: "DEADLINE", startsAt: at(9, 12), notes: "30% of the hall fee" },
      { title: "Merch pre-order closes", kind: "DEADLINE", startsAt: at(12, 23) },
      { title: "Monthly budget review", kind: "REMINDER", startsAt: at(14, 18) },
      { title: "Event permission form for Diwali Gala", kind: "DEADLINE", startsAt: at(1, 16), notes: "Dean's office needs 3 weeks" },
      { title: "Annual report draft due", kind: "DEADLINE", startsAt: at(40, 17) },
      { title: "Sponsor follow-up calls", kind: "REMINDER", startsAt: at(3, 11) },
      { title: "Volunteer briefing for Garba Night", kind: "OTHER", startsAt: at(8, 18) },
    ].map((c, i) => ({ ...c, createdById: (i % 2 ? treasurer?.id : president?.id) ?? null })),
  });

  return { memories: ITEMS.length + debrief.decisions.length, meetings: 2, deadlines: 8 };
}
