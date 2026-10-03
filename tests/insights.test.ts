import { describe, expect, it } from "vitest";
import { fundraiserPace, pulseStatus, salesSlowdown, sortInsights } from "@/lib/insights/rules";
import { extractPeriod, matchScore, routeOffline } from "@/lib/copilot/router";

describe("insight thresholds", () => {
  it("flags a real ticket-sales slowdown only while seats remain", () => {
    expect(salesSlowdown(6, 20, 40)).toBe(70);
    expect(salesSlowdown(18, 20, 40)).toBeNull(); // only 10% down
    expect(salesSlowdown(0, 3, 40)).toBeNull(); // too few sales to judge
    expect(salesSlowdown(2, 20, 95)).toBeNull(); // nearly sold out anyway
  });

  it("measures fundraiser pace against the timeline", () => {
    const start = new Date("2026-09-01");
    const end = new Date("2026-10-11");
    const now = new Date("2026-10-01"); // 75% of the time gone
    const p = fundraiserPace(1_240_000, 4_000_000, start, end, now); // 31% raised
    expect(p.behind).toBe(true);
    expect(p.daysLeft).toBe(10);
    expect(p.perDay).toBe(276_000);
    expect(fundraiserPace(3_000_000, 4_000_000, start, end, now).behind).toBe(false);
  });

  it("derives pulse colour only from insight severities", () => {
    expect(pulseStatus([])).toBe("green");
    expect(pulseStatus([{ severity: "opportunity" }])).toBe("green");
    expect(pulseStatus([{ severity: "warning" }, { severity: "info" }])).toBe("orange");
    expect(pulseStatus([{ severity: "warning" }, { severity: "critical" }])).toBe("red");
  });

  it("sorts most urgent first", () => {
    const s = sortInsights([
      { severity: "opportunity", title: "b" },
      { severity: "critical", title: "z" },
      { severity: "warning", title: "a" },
    ]);
    expect(s.map((i) => i.severity)).toEqual(["critical", "warning", "opportunity"]);
  });
});

describe("copilot routing (offline)", () => {
  it.each([
    ["How much money did the Gala make?", "event_money", "gala"],
    ["How many active members do we have?", "active_members", null],
    ["Which memberships expire this month?", "expiring_memberships", null],
    ["Show pending reimbursements.", "pending_reimbursements", null],
    ["Which event had the highest attendance?", "top_attendance", null],
    ["How many hoodies are left?", "stock_left", "hoodies"],
    ["What needs my attention today?", "attention", null],
    ["How is the winter clothes drive doing?", "fundraiser_progress", "winter clothes drive"],
    ["What's the weather?", "help", null],
  ])("%s → %s", (q, intent, subject) => {
    const r = routeOffline(q);
    expect(r.intent).toBe(intent);
    expect(r.subject).toBe(subject);
  });

  it("reads the period", () => {
    expect(extractPeriod("this month")).toBe("month");
    expect(extractPeriod("this week")).toBe("week");
    expect(extractPeriod("so far")).toBeNull();
  });

  it("matches subjects to titles, ignoring plurals", () => {
    expect(matchScore("gala", "Diwali Gala Night 2026")).toBe(1);
    expect(matchScore("hoodies", "Classic Logo Hoodie")).toBe(1);
    expect(matchScore("diwali party", "Diwali Gala Night")).toBe(0.5);
  });
});
