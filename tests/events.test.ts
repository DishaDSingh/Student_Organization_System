import { describe, expect, it } from "vitest";
import { attendanceRate, canCheckIn, eventPhase, priceOrder, salesState, type PricedType } from "@/lib/events/rules";
import { doorSaleSchema, eventSchema, ticketTypeSchema } from "@/lib/validation/schemas";

const NOW = new Date("2026-10-03T12:00:00");
const h = (hours: number) => new Date(NOW.getTime() + hours * 3600_000);
const event = (over: Partial<Parameters<typeof salesState>[0]> = {}) => ({
  status: "PUBLISHED" as const,
  startsAt: h(48),
  endsAt: h(52),
  capacity: 100,
  allocated: 10,
  salesOpenAt: null,
  salesCloseAt: null,
  ...over,
});

const general: PricedType = { id: "gen", name: "General", memberPricePaise: 59900, publicPricePaise: 89900, membersOnly: false };
const vip: PricedType = { id: "vip", name: "VIP", memberPricePaise: 129900, publicPricePaise: 159900, membersOnly: false };
const memberOnly: PricedType = { id: "mem", name: "Member", memberPricePaise: 0, publicPricePaise: 0, membersOnly: true };

describe("event phase & sales window", () => {
  it("derives the phase from status and time", () => {
    expect(eventPhase(event(), NOW)).toBe("UPCOMING");
    expect(eventPhase(event({ startsAt: h(-1), endsAt: h(2) }), NOW)).toBe("LIVE");
    expect(eventPhase(event({ startsAt: h(-5), endsAt: h(-1) }), NOW)).toBe("ENDED");
    expect(eventPhase(event({ status: "DRAFT" }), NOW)).toBe("DRAFT");
  });

  it("knows when tickets can be bought", () => {
    expect(salesState(event(), NOW)).toBe("OPEN");
    expect(salesState(event({ salesOpenAt: h(5) }), NOW)).toBe("NOT_YET");
    expect(salesState(event({ salesCloseAt: h(-1) }), NOW)).toBe("CLOSED");
    expect(salesState(event({ allocated: 100 }), NOW)).toBe("SOLD_OUT");
    expect(salesState(event({ status: "CANCELLED" }), NOW)).toBe("UNAVAILABLE");
  });

  it("opens check-in two hours before the start", () => {
    expect(canCheckIn(event({ startsAt: h(1), endsAt: h(4) }), NOW)).toBe(true);
    expect(canCheckIn(event({ startsAt: h(3), endsAt: h(6) }), NOW)).toBe(false);
    expect(canCheckIn(event({ startsAt: h(-5), endsAt: h(-1) }), NOW)).toBe(false);
  });

  it("computes attendance", () => {
    expect(attendanceRate(91, 100)).toBe(91);
    expect(attendanceRate(0, 0)).toBe(0);
  });
});

describe("priceOrder", () => {
  it("gives a member the member price on one ticket only", () => {
    const r = priceOrder([{ type: general, quantity: 2 }], { isActiveMember: true, memberTicketAlreadyUsed: false });
    expect(r.ok && r.totalPaise).toBe(59900 + 89900);
    expect(r.ok && r.tickets.filter((t) => t.isMemberPrice)).toHaveLength(1);
  });

  it("puts the member discount on the ticket where it saves the most", () => {
    const r = priceOrder(
      [
        { type: general, quantity: 1 },
        { type: vip, quantity: 1 },
      ],
      { isActiveMember: true, memberTicketAlreadyUsed: false },
    );
    // Both save ₹300, so either is fine — but never both.
    expect(r.ok && r.totalPaise).toBe(59900 + 159900);
  });

  it("charges the public price when the member already used their discount", () => {
    const r = priceOrder([{ type: general, quantity: 1 }], { isActiveMember: true, memberTicketAlreadyUsed: true });
    expect(r.ok && r.totalPaise).toBe(89900);
  });

  it("charges non-members the public price", () => {
    const r = priceOrder([{ type: general, quantity: 3 }], { isActiveMember: false, memberTicketAlreadyUsed: false });
    expect(r.ok && r.totalPaise).toBe(3 * 89900);
  });

  it("enforces members-only ticket types", () => {
    expect(priceOrder([{ type: memberOnly, quantity: 1 }], { isActiveMember: false, memberTicketAlreadyUsed: false }).ok).toBe(false);
    expect(priceOrder([{ type: memberOnly, quantity: 2 }], { isActiveMember: true, memberTicketAlreadyUsed: false }).ok).toBe(false);
    expect(priceOrder([{ type: memberOnly, quantity: 1 }], { isActiveMember: true, memberTicketAlreadyUsed: false }).ok).toBe(true);
  });

  it("rejects empty orders", () => {
    expect(priceOrder([], { isActiveMember: true, memberTicketAlreadyUsed: false }).ok).toBe(false);
  });
});

describe("event validation", () => {
  const base = {
    title: "Diwali Gala",
    category: "Gala",
    venue: "Main Auditorium",
    startsAt: "2026-11-07T19:00",
    endsAt: "2026-11-07T23:00",
    capacity: "550",
  };

  it("rejects an event that ends before it starts", () => {
    const r = eventSchema.safeParse({ ...base, endsAt: "2026-11-07T18:00" });
    expect(r.error?.issues[0].path).toEqual(["endsAt"]);
  });

  it("rejects sales closing after the event ends", () => {
    expect(eventSchema.safeParse({ ...base, salesCloseAt: "2026-11-08T10:00" }).success).toBe(false);
  });

  it("won't let member price exceed the public price", () => {
    const r = ticketTypeSchema.safeParse({
      eventId: "e",
      name: "General",
      memberPriceRupees: "900",
      publicPriceRupees: "800",
      quantity: "100",
      maxPerOrder: "4",
    });
    expect(r.error?.issues[0].path).toEqual(["memberPriceRupees"]);
  });

  it("caps orders at 10 tickets and drops zero lines", () => {
    const lines = [
      { ticketTypeId: "a", quantity: 6 },
      { ticketTypeId: "b", quantity: 6 },
    ];
    expect(doorSaleSchema.safeParse({ eventId: "e", buyerName: "Asha Rao", lines, method: "CASH" }).success).toBe(false);
    const ok = doorSaleSchema.parse({
      eventId: "e",
      buyerName: "Asha Rao",
      lines: [
        { ticketTypeId: "a", quantity: 2 },
        { ticketTypeId: "b", quantity: 0 },
      ],
      method: "CASH",
    });
    expect(ok.lines).toEqual([{ ticketTypeId: "a", quantity: 2 }]);
  });

  it("requires a buyer name or a member at the door", () => {
    expect(doorSaleSchema.safeParse({ eventId: "e", lines: [{ ticketTypeId: "a", quantity: 1 }], method: "CASH" }).success).toBe(false);
    expect(
      doorSaleSchema.safeParse({ eventId: "e", memberId: "u1", lines: [{ ticketTypeId: "a", quantity: 1 }], method: "CASH" }).success,
    ).toBe(true);
  });
});
