import { describe, expect, it } from "vitest";
import {
  formatINR,
  nextTermStart,
  rupeesToPaise,
  standing,
  termDates,
  termState,
  verificationResult,
  type Term,
} from "@/lib/membership/rules";
import { confirmPaymentSchema, joinSchema, planSchema, registerMemberSchema } from "@/lib/validation/schemas";

const NOW = new Date("2026-10-03T10:00:00");
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000);
const term = (start: number, end: number, status: Term["status"] = "ACTIVE"): Term => ({
  status,
  startDate: day(start),
  endDate: day(end),
});

describe("term dates", () => {
  it("covers exactly N months, ending the millisecond before", () => {
    const { startDate, endDate } = termDates(new Date("2026-01-15T14:30:00"), 12);
    expect(startDate).toEqual(new Date("2026-01-15T00:00:00"));
    expect(endDate).toEqual(new Date(new Date("2027-01-15T00:00:00").getTime() - 1));
  });
});

describe("termState", () => {
  it("derives expired / expiring / active from dates", () => {
    expect(termState(term(-400, -1), NOW)).toBe("EXPIRED");
    expect(termState(term(-300, 10), NOW)).toBe("EXPIRING");
    expect(termState(term(-30, 200), NOW)).toBe("ACTIVE");
    expect(termState(term(10, 200), NOW)).toBe("UPCOMING");
  });

  it("respects stored pending / cancelled", () => {
    expect(termState({ status: "PENDING_PAYMENT", startDate: null, endDate: null }, NOW)).toBe("PENDING");
    expect(termState(term(-30, 200, "CANCELLED"), NOW)).toBe("CANCELLED");
  });
});

describe("standing", () => {
  it("is NONE with no terms", () => {
    expect(standing([], NOW).state).toBe("NONE");
  });

  it("treats a renewed member as fully active, valid until the renewal ends", () => {
    const s = standing([term(-355, 10), term(11, 376)], NOW);
    expect(s.state).toBe("ACTIVE");
    expect(s.validUntil).toEqual(day(376));
  });

  it("shows expiring when the current term ends soon with no renewal", () => {
    const s = standing([term(-355, 5)], NOW);
    expect(s.state).toBe("EXPIRING");
    expect(s.daysLeft).toBe(5);
  });

  it("prefers a pending request over an old lapsed term", () => {
    const s = standing([term(-400, -40), { status: "PENDING_PAYMENT", startDate: null, endDate: null }], NOW);
    expect(s.state).toBe("PENDING");
  });

  it("ignores cancelled terms when an active one exists", () => {
    expect(standing([term(-10, 300, "CANCELLED"), term(-50, 100)], NOW).state).toBe("ACTIVE");
  });

  it("maps standing to a door check result", () => {
    expect(verificationResult("EXPIRING")).toBe("VALID");
    expect(verificationResult("EXPIRED")).toBe("EXPIRED");
    expect(verificationResult("NONE")).toBe("NOT_MEMBER");
  });
});

describe("nextTermStart", () => {
  it("starts the day after the current term so no days are lost", () => {
    const end = new Date("2026-10-10T23:59:59.999");
    expect(nextTermStart([{ status: "ACTIVE", startDate: new Date("2025-10-11"), endDate: end }], NOW)).toEqual(
      new Date("2026-10-11T00:00:00"),
    );
  });

  it("starts today when lapsed", () => {
    expect(nextTermStart([term(-400, -30)], NOW)).toEqual(new Date("2026-10-03T00:00:00"));
  });
});

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatINR(31440000)).toBe("₹3,14,400");
    expect(formatINR(49950)).toBe("₹499.5");
  });
  it("converts rupees to integer paise without float drift", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });
});

describe("membership validation", () => {
  it("requires a reference for UPI but not cash", () => {
    expect(confirmPaymentSchema.safeParse({ membershipId: "m1", method: "CASH" }).success).toBe(true);
    const r = confirmPaymentSchema.safeParse({ membershipId: "m1", method: "UPI", reference: "" });
    expect(r.error?.issues[0].path).toEqual(["reference"]);
  });

  it("needs name and email for a new person but not for an existing account", () => {
    const base = { planId: "p1", payNow: true, method: "CASH" };
    const r = registerMemberSchema.safeParse(base);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["email", "name"]);
    expect(registerMemberSchema.safeParse({ ...base, existingUserId: "u1" }).success).toBe(true);
  });

  it("rejects prices with more than 2 decimals", () => {
    const plan = { code: "annual", name: "Annual", durationMonths: "12", priceRupees: "499.999" };
    expect(planSchema.safeParse(plan).success).toBe(false);
    expect(planSchema.parse({ ...plan, priceRupees: "499.50" })).toMatchObject({ code: "ANNUAL", durationMonths: 12, priceRupees: 499.5 });
  });

  it("rejects the sign-up honeypot and requires roll no. + mobile", () => {
    const ok = {
      name: "Tanvi Rao",
      email: "t@x.test",
      phone: "9820155555",
      studentId: "HIT25CS900",
      planId: "p1",
      password: "secret123",
      confirmPassword: "secret123",
    };
    expect(joinSchema.safeParse(ok).success).toBe(true);
    expect(joinSchema.safeParse({ ...ok, website: "http://spam" }).success).toBe(false);
    expect(joinSchema.safeParse({ ...ok, studentId: "" }).success).toBe(false);
    expect(joinSchema.safeParse({ ...ok, phone: "" }).success).toBe(false);
  });
});
