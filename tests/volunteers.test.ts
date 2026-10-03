import { describe, expect, it } from "vitest";
import {
  fundraiserProgress,
  isOverdue,
  rankCandidates,
  scoreCandidate,
  slotFor,
  type Candidate,
  type MatchTarget,
} from "@/lib/volunteers/rules";
import { donationSchema, fundraiserSchema } from "@/lib/validation/schemas";

const base: Candidate = {
  userId: "u",
  name: "Asha",
  skills: [],
  interests: [],
  availability: [],
  maxHoursPerWeek: 6,
  completedTasks: 0,
  completedShifts: 0,
  committedHours: 0,
  openTasks: 0,
};
const saturdayEvening = new Date("2026-10-10T19:00:00"); // a Saturday
const task: MatchTarget = { requiredSkills: ["Social media"], interests: ["Charity"], when: saturdayEvening, estimatedHours: 2 };

describe("availability slots", () => {
  it("maps times to weekday/weekend morning/afternoon/evening", () => {
    expect(slotFor(saturdayEvening)).toBe("WEEKEND_EVENING");
    expect(slotFor(new Date("2026-10-07T09:00:00"))).toBe("WEEKDAY_MORNING");
    expect(slotFor(new Date("2026-10-07T14:00:00"))).toBe("WEEKDAY_AFTERNOON");
  });
});

describe("smart volunteer matching", () => {
  it("prefers the volunteer with the right skill, time and interest", () => {
    const good = {
      ...base,
      userId: "good",
      name: "Good",
      skills: ["Social media"],
      availability: ["WEEKEND_EVENING"],
      interests: ["Charity"],
    };
    const meh = { ...base, userId: "meh", name: "Meh", skills: ["Cooking & baking"], availability: ["WEEKDAY_MORNING"] };
    const ranked = rankCandidates(task, [meh, good]);
    expect(ranked[0].userId).toBe("good");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score + 30);
  });

  it("explains every score in plain language", () => {
    const m = scoreCandidate(task, { ...base, skills: ["Social media"], availability: ["WEEKEND_EVENING"] });
    expect(m.reasons.map((r) => r.text)).toEqual(
      expect.arrayContaining(["Has 1/1 skills: Social media", "Usually free on weekend evenings"]),
    );
  });

  it("never pushes work onto someone who is already full", () => {
    const busy = { ...base, userId: "busy", name: "Busy", skills: ["Social media"], availability: ["WEEKEND_EVENING"], committedHours: 6 };
    const free = { ...base, userId: "free", name: "Free", availability: ["WEEKEND_EVENING"] };
    const ranked = rankCandidates(task, [busy, free]);
    expect(ranked.find((r) => r.userId === "busy")!.reasons.some((r) => r.tone === "warn" && r.text.startsWith("Overloaded"))).toBe(true);
    expect(ranked[0].userId).toBe("free");
  });

  it("keeps scores between 0 and 100 and is deterministic", () => {
    const a = scoreCandidate(task, { ...base, committedHours: 50 });
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(scoreCandidate(task, base)).toEqual(scoreCandidate(task, base));
  });
});

describe("fundraisers", () => {
  it("computes progress, capped at 100%", () => {
    expect(fundraiserProgress(1585000, 4000000)).toBe(40);
    expect(fundraiserProgress(5000000, 4000000)).toBe(100);
    expect(fundraiserProgress(100, 0)).toBe(0);
  });

  it("flags overdue tasks only when not done", () => {
    const now = new Date("2026-10-03T12:00:00");
    expect(isOverdue({ status: "TODO", dueAt: new Date("2026-10-01") }, now)).toBe(true);
    expect(isOverdue({ status: "DONE", dueAt: new Date("2026-10-01") }, now)).toBe(false);
    expect(isOverdue({ status: "TODO", dueAt: null }, now)).toBe(false);
  });

  it("validates fundraiser dates and goals", () => {
    const f = { title: "Bake Sale", cause: "Charity", goalRupees: "25000", startsAt: "2026-10-01", endsAt: "2026-10-31", status: "ACTIVE" };
    expect(fundraiserSchema.safeParse(f).success).toBe(true);
    expect(fundraiserSchema.safeParse({ ...f, endsAt: "2026-09-01" }).success).toBe(false);
    expect(fundraiserSchema.safeParse({ ...f, goalRupees: "100" }).success).toBe(false);
  });

  it("requires a donor name unless anonymous, and a reference for UPI", () => {
    const d = { fundraiserId: "f", amountRupees: "500", method: "CASH" };
    expect(donationSchema.safeParse(d).success).toBe(false);
    expect(donationSchema.safeParse({ ...d, anonymous: true }).success).toBe(true);
    expect(donationSchema.safeParse({ ...d, donorName: "Asha Rao", method: "UPI" }).success).toBe(false);
  });
});
