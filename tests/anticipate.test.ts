import { describe, expect, it } from "vitest";
import { eventScenario, merchScenario, projectEvent, runway, spendScenario, type EventSnapshot } from "@/lib/simulate/model";
import { cameraScope, canPlayback, canSeeCamera, canWatchLive, feedKind } from "@/lib/cctv/access";
import { deviceLabel } from "@/lib/device";
import { cameraSchema } from "@/lib/validation/schemas";

const gala: EventSnapshot = {
  capacity: 160,
  sold: 80,
  soldRevenuePaise: 6_400_000,
  avgPricePaise: 80_000,
  perDay: 2,
  daysLeft: 30,
  attendanceRate: 0.9,
  fixedCostPaise: 5_100_000,
};
const neutral = { pricePct: 0, capacity: 160, elasticity: 0.8, extraCostPaise: 0, perHeadCostPaise: 0 };
const row = (rows: { label: string; scenario: number; baseline: number }[], label: string) => rows.find((r) => r.label === label)!;

describe("what-if: events", () => {
  it("projects future sales from the recent pace, capped by seats", () => {
    expect(projectEvent(gala, { pricePct: 0, capacity: 160, elasticity: 0.8 })).toEqual({ future: 60, total: 140, price: 80_000 });
    expect(projectEvent(gala, { pricePct: 0, capacity: 100, elasticity: 0.8 }).total).toBe(100);
  });

  it("a price rise sells fewer future tickets; past buyers keep their price", () => {
    const rows = eventScenario(gala, { ...neutral, pricePct: 25 }); // 25% × 0.8 = 20% fewer future sales
    expect(row(rows, "Tickets sold").scenario).toBe(80 + 48);
    expect(row(rows, "Ticket revenue").scenario).toBe(6_400_000 + 48 * 100_000);
  });

  it("baseline equals scenario when nothing changes, and costs follow attendance", () => {
    const rows = eventScenario(gala, { ...neutral, perHeadCostPaise: 10_000 });
    for (const r of rows) expect(r.scenario).toBe(r.baseline);
    expect(row(rows, "Costs").baseline).toBe(5_100_000 + Math.round(140 * 0.9) * 10_000);
  });
});

describe("what-if: spending and merch", () => {
  it("computes runway, infinite when income covers spending", () => {
    expect(runway(1_000_000, 100_000, 300_000)).toBe(5);
    expect(runway(1_000_000, 300_000, 100_000)).toBe(Infinity);
  });

  it("shows the hit to balance and the chosen budget", () => {
    const rows = spendScenario(
      {
        balancePaise: 5_000_000,
        avgMonthlyInPaise: 1_000_000,
        avgMonthlyOutPaise: 1_500_000,
        budgets: [{ category: "Food", monthlyPaise: 200_000, spentPaise: 100_000 }],
      },
      { extraPaise: 2_000_000, category: "Food" },
    );
    expect(row(rows, "Balance").scenario).toBe(3_000_000);
    expect(row(rows, "Runway (months)")).toMatchObject({ baseline: 10, scenario: 6 });
    expect(row(rows, "Food budget used this month")).toMatchObject({ baseline: 50, scenario: 1050 });
  });

  it("says how many to reorder when selling more than is in stock", () => {
    const r = merchScenario(
      { products: [{ id: "h", name: "Hoodie", pricePaise: 120_000, unitCostPaise: 60_000, stock: 70 }] },
      { productId: "h", extraUnits: 100, pricePaise: 120_000 },
    );
    expect(r.reorder).toBe(30);
    expect(row(r.outcomes, "Extra profit").scenario).toBe(100 * 60_000);
  });
});

describe("CCTV access matrix", () => {
  const user = (perms: string[], extra: Partial<{ isMasterAdmin: boolean }> = {}) => ({ id: "me", permissions: new Set(perms), ...extra });
  const mine = { event: { organizerId: "me" } };
  const theirs = { event: { organizerId: "other" } };
  const campus = { event: null };

  it("Security Head: every camera, live and playback", () => {
    const u = user(["cctv.view", "cctv.live", "cctv.playback"]);
    expect(cameraScope(u)).toBe("all");
    expect([canWatchLive(u, campus), canWatchLive(u, theirs), canPlayback(u, theirs)]).toEqual([true, true, true]);
  });

  it("Event Head: live view of their own events' cameras only, no playback", () => {
    const u = user(["cctv.live"]);
    expect(cameraScope(u)).toBe("own-events");
    expect([canSeeCamera(u, mine), canSeeCamera(u, theirs), canSeeCamera(u, campus)]).toEqual([true, false, false]);
    expect([canWatchLive(u, mine), canPlayback(u, mine)]).toEqual([true, false]);
  });

  it("Volunteers and members: nothing; Master Admin: everything", () => {
    const v = user(["events.view", "tickets.checkin"]);
    expect(cameraScope(v)).toBe("none");
    expect(canSeeCamera(v, mine)).toBe(false);
    const admin = user([], { isMasterAdmin: true });
    expect([canWatchLive(admin, campus), canPlayback(admin, theirs)]).toEqual([true, true]);
  });

  it("picks how to show a feed URL", () => {
    expect(feedKind("http://10.0.0.5/stream.mjpg")).toBe("image");
    expect(feedKind("https://rec.local/clip.mp4?t=1")).toBe("video");
    expect(feedKind(null)).toBe("none");
  });

  it("validates camera settings", () => {
    expect(cameraSchema.safeParse({ name: "Gate", location: "Main", retentionDays: "30", streamUrl: "rtsp://x" }).success).toBe(false);
    expect(cameraSchema.safeParse({ name: "Gate", location: "Main", retentionDays: "120" }).success).toBe(false);
    expect(cameraSchema.safeParse({ name: "Gate", location: "Main", retentionDays: "30", streamUrl: "" }).success).toBe(true);
  });
});

describe("audit device labels", () => {
  it("summarises user agents", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toBe(
      "Chrome on Windows",
    );
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect(deviceLabel(null)).toBe("Unknown device");
  });
});
