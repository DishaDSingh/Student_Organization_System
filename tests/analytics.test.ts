import { describe, expect, it } from "vitest";
import {
  change,
  describe as describeChange,
  monthBuckets,
  parseRange,
  periodTotals,
  rank,
  ratio,
  seriesByMonth,
  trend,
  windows,
} from "@/lib/analytics/rules";
import { budgetSchema } from "@/lib/validation/schemas";

const now = new Date(2026, 9, 3, 12); // 3 Oct 2026

describe("periods", () => {
  it("uses whole calendar months, including the current one", () => {
    const w = windows(3, now);
    expect(w.start).toEqual(new Date(2026, 7, 1)); // 1 Aug
    expect(w.end).toEqual(new Date(2026, 10, 1)); // 1 Nov (exclusive)
    expect(w.prevStart).toEqual(new Date(2026, 4, 1)); // 1 May
    expect(monthBuckets(w).map((b) => b.label)).toEqual(
      ["Aug", "Sept", "Oct"].map((m) => expect.stringMatching(new RegExp(`^${m.slice(0, 3)}`))),
    );
  });

  it("only accepts the offered ranges", () => {
    expect(parseRange("12")).toBe(12);
    expect(parseRange("7")).toBe(6);
    expect(parseRange(undefined)).toBe(6);
  });

  it("buckets rows by month and splits current vs previous totals", () => {
    const w = windows(3, now);
    const rows = [
      { at: new Date(2026, 9, 1), v: 5 },
      { at: new Date(2026, 9, 2), v: 1 },
      { at: new Date(2026, 7, 15), v: 2 },
      { at: new Date(2026, 5, 10), v: 7 }, // previous window
      { at: new Date(2025, 0, 1), v: 100 }, // too old — ignored
    ];
    expect(
      seriesByMonth(
        rows,
        (r) => r.at,
        w,
        (r) => r.v,
      ).map((s) => s.value),
    ).toEqual([2, 0, 6]);
    expect(
      periodTotals(
        rows,
        (r) => r.at,
        w,
        (r) => r.v,
      ),
    ).toEqual({ current: 8, previous: 7 });
  });
});

describe("comparisons", () => {
  it("computes change, treating small moves as flat and no baseline as unknown", () => {
    expect(change(120, 100)).toEqual({ pct: 20, direction: "up" });
    expect(change(80, 100)).toEqual({ pct: -20, direction: "down" });
    expect(change(102, 100).direction).toBe("flat");
    expect(change(5, 0)).toEqual({ pct: null, direction: "up" });
  });

  it("detects a trend across the whole series, not just the last month", () => {
    expect(trend([10, 12, 15, 18, 22, 25])).toBe("rising");
    expect(trend([30, 26, 20, 15, 12, 9])).toBe("falling");
    expect(trend([10, 11, 9, 10, 11, 10])).toBe("steady");
    expect(trend([0, 0, 0])).toBe("steady");
    // One spike in a noisy series is not a trend.
    expect(trend([69, 49, 81, 18, 162])).toBe("steady");
  });

  it("ranks keys with their share", () => {
    const r = rank([
      { key: "M", value: 3 },
      { key: "L", value: 1 },
      { key: "M", value: 3 },
      { key: "S", value: 0 },
    ]);
    expect(r).toEqual([
      { key: "M", value: 6, pct: 86 },
      { key: "L", value: 1, pct: 14 },
    ]);
    expect(ratio(1, 0)).toBe(0);
  });

  it("phrases highlights with the right tone", () => {
    expect(describeChange("Spending", change(150, 100), { months: 6, goodWhen: "down" })).toEqual({
      text: "Spending rose 50% compared with the previous 6 months.",
      tone: "bad",
    });
    expect(describeChange("Tickets sold", change(150, 100), { months: 3 }).tone).toBe("good");
  });
});

describe("budgets", () => {
  it("accepts a whole-rupee monthly limit and 0 to remove", () => {
    expect(budgetSchema.safeParse({ category: "Travel", monthlyRupees: "3000" }).success).toBe(true);
    expect(budgetSchema.safeParse({ category: "Travel", monthlyRupees: "0" }).success).toBe(true);
    expect(budgetSchema.safeParse({ category: "Travel", monthlyRupees: "-5" }).success).toBe(false);
    expect(budgetSchema.safeParse({ category: "Pizza", monthlyRupees: "5" }).success).toBe(false);
  });
});
