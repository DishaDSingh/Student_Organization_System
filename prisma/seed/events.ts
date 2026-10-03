import type { Prisma } from "../../src/generated/prisma/client";
import { DAY, TODAY, bySize, faker, type Db } from "./shared";

/**
 * Phase 4 seed: ~55 events over 18 months with ticket types, orders, payments,
 * QR tickets, check-ins, refunds and incidents.
 *
 * Demo stories:
 *  - Spring Gala 2025 & 2026 (past, big) — history for Organization Memory
 *  - Diwali Gala Night 2026 in ~5 weeks — sales started strong then SLOWED
 *  - Freshers' Welcome Mixer is LIVE today — the command center has real arrivals
 *  - one cancelled event with refunds; open incidents on the live event
 */

type TypeSpec = { name: string; member: number; pub: number; qty: number; membersOnly?: boolean; description?: string };
type EventSpec = {
  title: string;
  category: string;
  venue: string;
  dayOffset: number; // relative to today
  startHour: number;
  hours: number;
  capacity: number;
  fill: number; // share of capacity sold
  attendance: number; // share of sold that check in
  types: TypeSpec[];
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
  description: string;
  salesOpenDaysBefore?: number;
  slowdown?: boolean;
  live?: boolean;
  cancelledReason?: string;
};

const GALA_TYPES = (scale = 1): TypeSpec[] => [
  { name: "Early Bird", member: 499, pub: 799, qty: Math.round(150 * scale), description: "Entry + dinner. Limited." },
  { name: "General", member: 599, pub: 899, qty: Math.round(380 * scale), description: "Entry + dinner" },
  {
    name: "VIP Table",
    member: 1299,
    pub: 1599,
    qty: Math.round(40 * scale),
    description: "Reserved table, welcome drink, front-row seating",
  },
];

const BIG_EVENTS: EventSpec[] = [
  {
    title: "Spring Gala 2025",
    category: "Gala",
    venue: "Main Auditorium & Lawns",
    dayOffset: -567,
    startHour: 19,
    hours: 5,
    capacity: 600,
    fill: 0.93,
    attendance: 0.9,
    types: GALA_TYPES(1),
    salesOpenDaysBefore: 35,
    description: "The biggest night of the year — dinner, live band, awards and the dance floor till late. Formal dress.",
  },
  {
    title: "Diwali Gala Night 2025",
    category: "Gala",
    venue: "Main Auditorium",
    dayOffset: -330,
    startHour: 19,
    hours: 4,
    capacity: 500,
    fill: 0.88,
    attendance: 0.92,
    types: GALA_TYPES(0.85),
    salesOpenDaysBefore: 30,
    description: "Diyas, rangoli, a cultural showcase and festive dinner. Traditional wear encouraged.",
  },
  {
    title: "Spring Gala 2026",
    category: "Gala",
    venue: "Main Auditorium & Lawns",
    dayOffset: -203,
    startHour: 19,
    hours: 5,
    capacity: 650,
    fill: 0.94,
    attendance: 0.91,
    types: GALA_TYPES(1.08),
    salesOpenDaysBefore: 35,
    description: "Our biggest Spring Gala yet — dinner, live band, awards and fireworks. Formal dress.",
  },
  {
    title: "Diwali Gala Night 2026",
    category: "Gala",
    venue: "Main Auditorium",
    dayOffset: 35,
    startHour: 19,
    hours: 4,
    capacity: 550,
    fill: 0.53,
    attendance: 0,
    types: GALA_TYPES(0.95),
    salesOpenDaysBefore: 59, // opened 24 days ago
    slowdown: true,
    description: "Diyas, rangoli, a cultural showcase and festive dinner under the lights. Traditional wear encouraged.",
  },
  {
    title: "Freshers' Welcome Mixer",
    category: "Social",
    venue: "Student Activity Centre",
    dayOffset: 0,
    startHour: 10,
    hours: 13,
    capacity: 300,
    fill: 0.86,
    attendance: 0.62,
    live: true,
    types: [
      { name: "Member", member: 0, pub: 0, qty: 200, membersOnly: true },
      { name: "General", member: 149, pub: 149, qty: 100 },
    ],
    salesOpenDaysBefore: 14,
    description: "Meet the council, find your clubs, music and snacks all day. First-years welcome!",
  },
  {
    title: "Beach Clean-up Drive",
    category: "Fundraiser",
    venue: "Juhu Beach",
    dayOffset: 9,
    startHour: 7,
    hours: 3,
    capacity: 120,
    fill: 0.5,
    attendance: 0,
    status: "CANCELLED",
    cancelledReason: "Cancelled due to the heavy-rain warning from IMD. We'll reschedule after the monsoon.",
    types: [{ name: "Volunteer kit", member: 99, pub: 149, qty: 120, description: "Gloves, T-shirt, refreshments" }],
    salesOpenDaysBefore: 20,
    description: "Join 100+ students to clean up Juhu beach. Kit and breakfast included.",
  },
];

const VENUES = [
  "Seminar Hall A",
  "Seminar Hall B",
  "Lecture Theatre 3",
  "Open-Air Theatre",
  "Sports Complex",
  "Innovation Lab",
  "Library Auditorium",
  "Student Activity Centre",
  "Main Auditorium",
];
const SMALL_TEMPLATES: {
  title: string;
  category: string;
  cap: [number, number];
  types: () => TypeSpec[];
  attendance: number;
  description: string;
}[] = [
  {
    title: "Resume & LinkedIn Clinic",
    category: "Workshop",
    cap: [60, 90],
    types: () => [{ name: "Seat", member: 0, pub: 100, qty: 90 }],
    attendance: 0.78,
    description: "Get your CV reviewed by alumni recruiters.",
  },
  {
    title: "Intro to Machine Learning",
    category: "Workshop",
    cap: [80, 120],
    types: () => [{ name: "Seat", member: 0, pub: 150, qty: 120 }],
    attendance: 0.74,
    description: "Hands-on with Python, scikit-learn and real datasets.",
  },
  {
    title: "Public Speaking Bootcamp",
    category: "Workshop",
    cap: [40, 60],
    types: () => [{ name: "Seat", member: 99, pub: 199, qty: 60 }],
    attendance: 0.8,
    description: "Two hours to beat stage fear.",
  },
  {
    title: "Startup Founders Panel",
    category: "Talk",
    cap: [120, 200],
    types: () => [{ name: "Free pass", member: 0, pub: 0, qty: 200 }],
    attendance: 0.62,
    description: "Alumni founders on building in India.",
  },
  {
    title: "Mental Health Matters",
    category: "Talk",
    cap: [100, 150],
    types: () => [{ name: "Free pass", member: 0, pub: 0, qty: 150 }],
    attendance: 0.6,
    description: "A candid conversation with campus counsellors.",
  },
  {
    title: "Tech Fest Hackathon",
    category: "Tech",
    cap: [150, 220],
    types: () => [
      { name: "Participant", member: 0, pub: 150, qty: 200 },
      { name: "Spectator", member: 0, pub: 0, qty: 40 },
    ],
    attendance: 0.86,
    description: "24 hours, 40 teams, prizes worth ₹1.5 lakh.",
  },
  {
    title: "Robotics Expo",
    category: "Tech",
    cap: [150, 250],
    types: () => [{ name: "Entry", member: 0, pub: 50, qty: 250 }],
    attendance: 0.7,
    description: "Student-built robots, drones and live demos.",
  },
  {
    title: "Cultural Night: Rang",
    category: "Cultural",
    cap: [300, 450],
    types: () => [
      { name: "General", member: 99, pub: 199, qty: 400 },
      { name: "Front Rows", member: 199, pub: 299, qty: 50 },
    ],
    attendance: 0.88,
    description: "Music, dance and drama from every corner of India.",
  },
  {
    title: "Garba Night",
    category: "Cultural",
    cap: [400, 500],
    types: () => [{ name: "Entry", member: 149, pub: 249, qty: 500 }],
    attendance: 0.9,
    description: "Dandiya sticks provided. Come dressed to twirl.",
  },
  {
    title: "Open Mic Night",
    category: "Cultural",
    cap: [80, 120],
    types: () => [{ name: "Entry", member: 0, pub: 50, qty: 120 }],
    attendance: 0.72,
    description: "Poetry, stand-up and acoustic sets.",
  },
  {
    title: "Inter-College Sports Meet",
    category: "Sports",
    cap: [300, 500],
    types: () => [{ name: "Spectator", member: 0, pub: 50, qty: 500 }],
    attendance: 0.66,
    description: "Football, basketball and athletics finals.",
  },
  {
    title: "Box Cricket League Finals",
    category: "Sports",
    cap: [100, 150],
    types: () => [{ name: "Spectator", member: 0, pub: 30, qty: 150 }],
    attendance: 0.7,
    description: "Department teams battle for the cup.",
  },
  {
    title: "Movie Night Under the Stars",
    category: "Social",
    cap: [150, 220],
    types: () => [{ name: "Entry", member: 49, pub: 99, qty: 220 }],
    attendance: 0.82,
    description: "Bean bags, popcorn and a classic on the big screen.",
  },
  {
    title: "Alumni Homecoming",
    category: "Social",
    cap: [200, 300],
    types: () => [
      { name: "Alumni", member: 499, pub: 699, qty: 200 },
      { name: "Student", member: 199, pub: 299, qty: 100 },
    ],
    attendance: 0.85,
    description: "Reconnect with graduates across ten batches.",
  },
  {
    title: "Charity Bake Sale",
    category: "Fundraiser",
    cap: [100, 150],
    types: () => [{ name: "Tasting pass", member: 49, pub: 79, qty: 150 }],
    attendance: 0.75,
    description: "All proceeds to the Akshaya Patra mid-day meal programme.",
  },
];

const INCIDENTS: { title: string; severity: "LOW" | "MEDIUM" | "HIGH"; location: string; resolution: string }[] = [
  { title: "Long queue at main entry", severity: "MEDIUM", location: "Gate A", resolution: "Opened a second scanning lane" },
  { title: "Sound system cut out for 4 minutes", severity: "MEDIUM", location: "Stage", resolution: "Swapped to backup mixer" },
  { title: "Lost wallet reported", severity: "LOW", location: "Lawns", resolution: "Found and returned to owner" },
  {
    title: "Guest felt faint — first aid given",
    severity: "HIGH",
    location: "Dance floor",
    resolution: "Seen by campus nurse, recovered, sent home with a friend",
  },
  { title: "Overcrowding near the stage", severity: "MEDIUM", location: "Front of stage", resolution: "Volunteers created a barrier line" },
  {
    title: "Person without ticket tried to enter",
    severity: "LOW",
    location: "Gate B",
    resolution: "Directed to door sales; bought a ticket",
  },
  { title: "Power fluctuation in hall", severity: "MEDIUM", location: "Hall", resolution: "Generator switched in by maintenance" },
  {
    title: "Spilled drinks — slippery floor",
    severity: "LOW",
    location: "Food counter",
    resolution: "Housekeeping cleaned and placed signage",
  },
  { title: "Scanner phone battery died", severity: "LOW", location: "Gate A", resolution: "Switched to manual lookup; power bank arrived" },
  {
    title: "Argument between two attendees",
    severity: "MEDIUM",
    location: "Parking",
    resolution: "Security separated them; no further issue",
  },
  { title: "Food ran out early at counter 2", severity: "LOW", location: "Food court", resolution: "Caterer sent extra trays in 15 min" },
  { title: "Projector failed during awards", severity: "MEDIUM", location: "Stage", resolution: "Moved slides to the LED wall" },
];

const at = (dayOffset: number, hour: number, minute = 0) => new Date(TODAY.getTime() + dayOffset * DAY + hour * 3600_000 + minute * 60_000);

export async function seedEvents(db: Db) {
  const now = new Date();
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      roles: { select: { role: { select: { key: true } } } },
      memberships: { select: { status: true, startDate: true, endDate: true } },
    },
  });
  const hasRole = (u: (typeof users)[number], ...keys: string[]) => u.roles.some((r) => keys.includes(r.role.key));
  const eventHeads = users.filter((u) => hasRole(u, "event_head", "vice_president", "president"));
  const doorStaff = users.filter((u) => hasRole(u, "door_lead", "volunteer", "committee_member", "security_head"));
  const collectors = users.filter((u) => hasRole(u, "treasurer", "finance_associate", "secretary"));
  const reporters = users.filter((u) => hasRole(u, "security_head", "event_head", "door_lead", "committee_member"));
  const committees = await db.committee.findMany({ select: { id: true, name: true } });
  const committeeFor = (title: string) =>
    committees.find((c) =>
      title.includes("Gala")
        ? c.name.startsWith("Spring Gala Committee 2026")
        : title.includes("Tech") || title.includes("Hackathon") || title.includes("Robotics")
          ? c.name.startsWith("Tech Fest")
          : title.includes("Cultural") || title.includes("Garba") || title.includes("Open Mic")
            ? c.name.startsWith("Cultural")
            : title.includes("Sports") || title.includes("Cricket")
              ? c.name.startsWith("Sports")
              : title.includes("Alumni")
                ? c.name.startsWith("Alumni")
                : title.includes("Bake") || title.includes("Beach")
                  ? c.name.startsWith("Fundraising")
                  : false,
    )?.id ?? null;

  // Was a user an active member at time t? (for member pricing on historic orders)
  const memberAt = (u: (typeof users)[number], t: Date) =>
    u.memberships.some((m) => m.status === "ACTIVE" && m.startDate! <= t && m.endDate! >= t);
  const buyers = users.filter((u) => u.status !== "SUSPENDED");

  // ── Event list: big story events + ~48 smaller ones spread over 18 months ──
  const specs: EventSpec[] = [...BIG_EVENTS];
  const smallOffsets = [
    ...Array.from({ length: bySize(22, 42) }, (_, i) => -540 + i * bySize(23, 12) + faker.number.int({ min: 0, max: 6 })),
    5,
    9,
    12,
    20,
    45,
    60,
  ];
  for (const [i, offset] of smallOffsets.entries()) {
    const t = SMALL_TEMPLATES[i % SMALL_TEMPLATES.length];
    const year = new Date(TODAY.getTime() + offset * DAY).getFullYear();
    const cap = faker.number.int({ min: t.cap[0], max: t.cap[1] });
    const upcoming = offset > 0;
    specs.push({
      title: `${t.title}${t.category === "Workshop" || t.category === "Talk" ? ` — ${faker.helpers.arrayElement(["Session", "Edition"])} ${Math.floor(i / SMALL_TEMPLATES.length) + 1}` : ` ${year}`}`,
      category: t.category,
      venue: faker.helpers.arrayElement(VENUES),
      dayOffset: offset,
      startHour: faker.helpers.arrayElement([10, 11, 14, 16, 17, 18, 19]),
      hours: faker.helpers.arrayElement([2, 3, 4]),
      capacity: cap,
      fill: upcoming ? faker.number.float({ min: 0.2, max: 0.6 }) : faker.number.float({ min: 0.55, max: 0.97 }),
      attendance: upcoming ? 0 : t.attendance + faker.number.float({ min: -0.08, max: 0.06 }),
      types: t.types().map((tt) => ({ ...tt, qty: Math.min(tt.qty, cap) })),
      description: t.description,
      salesOpenDaysBefore: faker.number.int({ min: 10, max: 21 }),
    });
  }
  // Drafts the events team is still planning.
  for (const [title, offset] of [
    ["Annual Sports Day 2027", 120],
    ["Spring Gala 2027", 160],
    ["Coding Bootcamp — Winter Edition", 75],
  ] as const) {
    specs.push({
      title,
      category: title.includes("Gala") ? "Gala" : title.includes("Sports") ? "Sports" : "Workshop",
      venue: "TBD",
      dayOffset: offset,
      startHour: 18,
      hours: 4,
      capacity: title.includes("Gala") ? 700 : 150,
      fill: 0,
      attendance: 0,
      status: "DRAFT",
      types: title.includes("Gala") ? GALA_TYPES(1.15) : [{ name: "Seat", member: 0, pub: 200, qty: 150 }],
      description: "Planning in progress.",
    });
  }

  const eventRows: Prisma.EventCreateManyInput[] = [];
  const typeRows: Prisma.TicketTypeCreateManyInput[] = [];
  const orderRows: Prisma.TicketOrderCreateManyInput[] = [];
  const ticketRows: Prisma.TicketCreateManyInput[] = [];
  const paymentRows: Omit<Prisma.PaymentCreateManyInput, "receiptNumber">[] = [];
  const incidentRows: Prisma.EventIncidentCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const orderSeq = new Map<number, number>();

  // Small datasets shrink every event's capacity so ticket volumes stay modest.
  const capScale = bySize(0.3, 1);
  for (const raw of specs) {
    const spec = {
      ...raw,
      capacity: Math.max(20, Math.round(raw.capacity * capScale)),
      types: raw.types.map((t) => ({ ...t, qty: Math.max(10, Math.round(t.qty * capScale)) })),
    };
    const eventId = faker.string.uuid();
    const startsAt = at(spec.dayOffset, spec.startHour);
    const endsAt = new Date(startsAt.getTime() + spec.hours * 3600_000);
    const status = spec.status ?? "PUBLISHED";
    const salesOpenAt = spec.salesOpenDaysBefore ? new Date(startsAt.getTime() - spec.salesOpenDaysBefore * DAY) : null;
    const organizer = faker.helpers.arrayElement(eventHeads);
    const createdAt = new Date((salesOpenAt ?? startsAt).getTime() - faker.number.int({ min: 5, max: 20 }) * DAY);

    eventRows.push({
      id: eventId,
      title: spec.title,
      description: spec.description,
      category: spec.category,
      venue: spec.venue,
      startsAt,
      endsAt,
      capacity: spec.capacity,
      status,
      salesOpenAt,
      organizerId: organizer.id,
      createdById: organizer.id,
      committeeId: committeeFor(spec.title),
      cancelledReason: spec.cancelledReason ?? null,
      publishedAt: status === "DRAFT" ? null : (salesOpenAt ?? createdAt),
      createdAt,
    });
    auditRows.push({
      actorId: organizer.id,
      actorName: organizer.name,
      action: "event.create",
      entityType: "Event",
      entityId: eventId,
      summary: `Created draft event "${spec.title}"`,
      createdAt,
    });
    if (status !== "DRAFT") {
      auditRows.push({
        actorId: organizer.id,
        actorName: organizer.name,
        action: "event.publish",
        entityType: "Event",
        entityId: eventId,
        summary: `Published "${spec.title}" — tickets are on sale`,
        createdAt: salesOpenAt ?? createdAt,
      });
    }

    const types = spec.types.map((t, i) => ({ ...t, id: faker.string.uuid(), sortOrder: i }));
    for (const t of types) {
      typeRows.push({
        id: t.id,
        eventId,
        name: t.name,
        description: t.description ?? null,
        memberPricePaise: t.member * 100,
        publicPricePaise: t.pub * 100,
        quantity: t.qty,
        membersOnly: !!t.membersOnly,
        sortOrder: t.sortOrder,
        maxPerOrder: t.membersOnly ? 1 : 4,
        createdAt,
      });
    }
    if (status === "DRAFT") continue;

    // ── Sales: orders of 1–4 tickets until the fill target ──
    const target = Math.min(
      Math.round(spec.capacity * spec.fill),
      types.reduce((s, t) => s + t.qty, 0),
    );
    const salesEnd =
      spec.status === "CANCELLED"
        ? new Date(Math.min(now.getTime(), startsAt.getTime()))
        : new Date(Math.min(now.getTime(), startsAt.getTime()));
    const salesStart = salesOpenAt ?? new Date(startsAt.getTime() - 14 * DAY);
    const remaining = new Map(types.map((t) => [t.id, t.qty]));
    const memberUsed = new Set<string>();
    let sold = 0;

    while (sold < target) {
      // Sale time. Galas sell fast early; the upcoming gala SLOWS sharply after its first 10 days.
      const span = salesEnd.getTime() - salesStart.getTime();
      let r = faker.number.float();
      if (spec.slowdown) r = faker.datatype.boolean(0.8) ? r * (10 / 24) : 10 / 24 + r * (14 / 24);
      else if (spec.category === "Gala") r = Math.pow(r, 1.6);
      const createdAtOrder = new Date(salesStart.getTime() + r * span);

      const isMemberBuyer = faker.datatype.boolean(0.72);
      const candidates = isMemberBuyer ? buyers.filter((u) => memberAt(u, createdAtOrder) && !memberUsed.has(u.id)) : [];
      const buyer = candidates.length ? faker.helpers.arrayElement(candidates) : null;
      const isMember = !!buyer && memberAt(buyer, createdAtOrder);
      const guestName = `${faker.person.firstName()} ${faker.person.lastName()}`;

      let qty = Math.min(
        target - sold,
        faker.helpers.weightedArrayElement([
          { weight: 55, value: 1 },
          { weight: 28, value: 2 },
          { weight: 11, value: 3 },
          { weight: 6, value: 4 },
        ]),
      );
      const available = types.filter((t) => (remaining.get(t.id) ?? 0) > 0 && (!t.membersOnly || isMember));
      if (!available.length) break;
      const type = faker.helpers.weightedArrayElement(
        available.map((t) => ({
          weight: t.name.includes("VIP") || t.name.includes("Front") ? 1 : t.name.includes("Early") && r < 0.35 ? 6 : 4,
          value: t,
        })),
      );
      if (type.membersOnly) qty = 1;
      qty = Math.min(qty, remaining.get(type.id)!);
      remaining.set(type.id, remaining.get(type.id)! - qty);
      sold += qty;

      const orderId = faker.string.uuid();
      const year = createdAtOrder.getFullYear();
      const n = (orderSeq.get(year) ?? 0) + 1;
      orderSeq.set(year, n);
      const holder = buyer?.name ?? guestName;
      const tickets = Array.from({ length: qty }, (_, i) => {
        const memberPrice = isMember && i === 0 && !memberUsed.has(buyer!.id);
        if (memberPrice) memberUsed.add(buyer!.id);
        return {
          pricePaise: (memberPrice ? type.member : type.pub) * 100,
          isMemberPrice: memberPrice,
          holderName: i === 0 ? holder : `Guest of ${holder}`,
        };
      });
      const total = tickets.reduce((s, t) => s + t.pricePaise, 0);

      // Upcoming events have some unpaid orders still holding seats.
      const pending = spec.dayOffset > 0 && !spec.status && total > 0 && faker.datatype.boolean(0.08);
      const door = spec.dayOffset <= 0 && !pending && faker.datatype.boolean(0.18);
      const refunded = !pending && spec.dayOffset < 0 && total > 0 && faker.datatype.boolean(0.012);
      const cancelledEvent = spec.status === "CANCELLED";
      const orderStatus = pending ? "PENDING_PAYMENT" : refunded || (cancelledEvent && total > 0) ? "REFUNDED" : "PAID";
      const orderTime = door ? new Date(startsAt.getTime() + faker.number.int({ min: -60, max: 45 }) * 60_000) : createdAtOrder;
      if (orderTime > now) continue;

      orderRows.push({
        id: orderId,
        orderNumber: `TKT-${year}-${String(n).padStart(5, "0")}`,
        eventId,
        buyerId: buyer?.id ?? null,
        buyerName: holder,
        buyerEmail: buyer?.email ?? null,
        buyerPhone: buyer?.phone ?? `+91${faker.helpers.arrayElement(["98", "99", "97", "88", "70"])}${faker.string.numeric(8)}`,
        status: orderStatus,
        channel: door ? "DOOR" : "ONLINE",
        totalPaise: total,
        claimedReference: pending && faker.datatype.boolean(0.5) ? faker.string.numeric(12) : null,
        holdUntil: pending ? new Date(orderTime.getTime() + 48 * 3600_000) : null,
        createdAt: orderTime,
      });

      const attendedShare = spec.live
        ? spec.attendance * Math.min(1, Math.max(0, (now.getTime() - startsAt.getTime()) / (6 * 3600_000)))
        : spec.attendance;
      for (const t of tickets) {
        const valid = orderStatus === "PAID";
        const checkIn =
          valid && (spec.dayOffset < 0 || spec.live) && faker.datatype.boolean(Math.max(0, Math.min(1, attendedShare)))
            ? new Date(
                Math.min(now.getTime() - 60_000, startsAt.getTime() + faker.number.int({ min: -40, max: spec.live ? 360 : 100 }) * 60_000),
              )
            : null;
        ticketRows.push({
          code: faker.string.alphanumeric(20),
          orderId,
          eventId,
          ticketTypeId: type.id,
          holderName: t.holderName,
          pricePaise: t.pricePaise,
          isMemberPrice: t.isMemberPrice,
          status: orderStatus === "PAID" ? "VALID" : orderStatus === "PENDING_PAYMENT" ? "RESERVED" : "REFUNDED",
          checkedInAt: checkIn,
          checkedInById: checkIn ? faker.helpers.arrayElement(doorStaff).id : null,
          createdAt: orderTime,
        });
      }

      if (orderStatus !== "PENDING_PAYMENT" && total > 0) {
        const method = door
          ? faker.helpers.weightedArrayElement([
              { weight: 55, value: "CASH" as const },
              { weight: 40, value: "UPI" as const },
              { weight: 5, value: "CARD" as const },
            ])
          : "UPI";
        paymentRows.push({
          purpose: "TICKET",
          payerId: buyer?.id ?? null,
          ticketOrderId: orderId,
          amountPaise: total,
          method,
          reference: method === "UPI" ? faker.string.numeric(12) : method === "CARD" ? `POS${faker.string.numeric(6)}` : null,
          status: orderStatus === "REFUNDED" ? "REFUNDED" : "PAID",
          receivedById: faker.helpers.arrayElement(door ? doorStaff : collectors).id,
          paidAt: door ? orderTime : new Date(orderTime.getTime() + faker.number.int({ min: 5, max: 600 }) * 60_000),
        });
      }
      if (orderStatus === "REFUNDED") {
        const actor = faker.helpers.arrayElement(collectors);
        auditRows.push({
          actorId: actor.id,
          actorName: actor.name,
          action: "ticket.refund",
          entityType: "Event",
          entityId: eventId,
          summary: `Refunded ₹${total / 100} to ${holder} for "${spec.title}" — ${cancelledEvent ? "event cancelled" : "could not attend (medical)"}`,
          createdAt: new Date(Math.min(now.getTime(), startsAt.getTime() + DAY)),
        });
      }
    }

    // ── Incidents ──
    const incidentCount =
      spec.dayOffset < 0 && spec.status !== "CANCELLED"
        ? spec.category === "Gala"
          ? faker.number.int({ min: 4, max: 6 })
          : faker.helpers.weightedArrayElement([
              { weight: 25, value: 0 },
              { weight: 50, value: 1 },
              { weight: 25, value: 2 },
            ])
        : spec.live
          ? 3
          : 0;
    for (const tpl of faker.helpers.arrayElements(INCIDENTS, incidentCount)) {
      const created = new Date(
        Math.min(now.getTime() - 5 * 60_000, startsAt.getTime() + faker.number.int({ min: 10, max: spec.hours * 55 }) * 60_000),
      );
      const open = spec.live && faker.datatype.boolean(0.5);
      incidentRows.push({
        eventId,
        title: tpl.title,
        severity: tpl.severity,
        location: tpl.location,
        reportedById: faker.helpers.arrayElement(reporters).id,
        createdAt: created,
        resolvedAt: open ? null : new Date(Math.min(now.getTime(), created.getTime() + faker.number.int({ min: 5, max: 40 }) * 60_000)),
        resolution: open ? null : tpl.resolution,
      });
    }
    if (spec.status === "CANCELLED") {
      const head = eventHeads[0];
      auditRows.push({
        actorId: head.id,
        actorName: head.name,
        action: "event.cancel",
        entityType: "Event",
        entityId: eventId,
        summary: `Cancelled "${spec.title}" — ${spec.cancelledReason}`,
        createdAt: new Date(TODAY.getTime() - 2 * DAY),
      });
    }
  }

  await db.event.createMany({ data: eventRows });
  await db.ticketType.createMany({ data: typeRows });
  await db.ticketOrder.createMany({ data: orderRows });
  for (let i = 0; i < ticketRows.length; i += 2000) await db.ticket.createMany({ data: ticketRows.slice(i, i + 2000) });

  // Receipts continue each year's sequence after the membership dues.
  const lastByYear = new Map<number, number>();
  for (const p of await db.payment.findMany({ select: { receiptNumber: true } })) {
    const [, y, n] = p.receiptNumber.split("-");
    lastByYear.set(Number(y), Math.max(lastByYear.get(Number(y)) ?? 0, Number(n)));
  }
  paymentRows.sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
  await db.payment.createMany({
    data: paymentRows.map((p) => {
      const y = (p.paidAt as Date).getFullYear();
      const n = (lastByYear.get(y) ?? 0) + 1;
      lastByYear.set(y, n);
      return { ...p, receiptNumber: `RCP-${y}-${String(n).padStart(5, "0")}` };
    }),
  });
  await db.eventIncident.createMany({ data: incidentRows });
  await db.auditLog.createMany({ data: auditRows });

  // Inventory counters = seats held by valid + reserved tickets (what the app maintains atomically).
  await db.$executeRaw`UPDATE "TicketType" tt SET "allocated" = (SELECT count(*) FROM "Ticket" t WHERE t."ticketTypeId" = tt.id AND t.status IN ('VALID','RESERVED'))`;
  await db.$executeRaw`UPDATE "Event" e SET "allocated" = (SELECT count(*) FROM "Ticket" t WHERE t."eventId" = e.id AND t.status IN ('VALID','RESERVED'))`;

  // Buyers whose tickets were confirmed recently get a notification, like the app sends.
  const recentPaid = orderRows.filter(
    (o) => o.status === "PAID" && o.buyerId && (o.createdAt as Date) > new Date(now.getTime() - 10 * DAY),
  );
  await db.notification.createMany({
    data: recentPaid.slice(0, 120).map((o) => ({
      userId: o.buyerId!,
      type: "ticket.confirmed",
      title: "Tickets confirmed",
      body: `Your tickets for ${eventRows.find((e) => e.id === o.eventId)!.title} are confirmed. Show the QR at the door.`,
      link: "/me/tickets",
      createdAt: o.createdAt,
      readAt: faker.datatype.boolean(0.5) ? new Date() : null,
    })),
  });

  return {
    events: eventRows.length,
    ticketTypes: typeRows.length,
    orders: orderRows.length,
    tickets: ticketRows.length,
    checkIns: ticketRows.filter((t) => t.checkedInAt).length,
    payments: paymentRows.length,
    ticketRevenue: `₹${(paymentRows.filter((p) => p.status === "PAID").reduce((s, p) => s + (p.amountPaise as number), 0) / 100).toLocaleString("en-IN")}`,
    incidents: incidentRows.length,
  };
}
