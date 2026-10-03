import { describe, expect, it } from "vitest";
import { bullets, cleanSections, keepsNumbers, periodRange, toMarkdown, vsPrevious } from "@/lib/reports/types";
import { generateReportSchema, saveReportSchema } from "@/lib/validation/schemas";

describe("report periods", () => {
  const now = new Date(2026, 9, 3, 12); // 3 Oct 2026

  it("computes month, last month and semester ranges", () => {
    expect(periodRange("month", now).from).toEqual(new Date(2026, 9, 1));
    const lm = periodRange("last_month", now);
    expect([lm.from, lm.to]).toEqual([new Date(2026, 8, 1), new Date(2026, 9, 1)]);
    expect(periodRange("semester", now).from).toEqual(new Date(2026, 6, 1)); // Jul–Dec
    expect(periodRange("semester", new Date(2026, 2, 1)).from).toEqual(new Date(2026, 0, 1)); // Jan–Jun
  });

  it("gives an equal-length previous period for comparisons", () => {
    const r = periodRange("week", now);
    expect(r.prevTo).toEqual(r.from);
    expect(r.from.getTime() - r.prevFrom.getTime()).toBe(r.to.getTime() - r.from.getTime());
  });
});

describe("report text", () => {
  it("phrases comparisons and bullet lists", () => {
    expect(vsPrevious(120, 100)).toBe(" (up 20% on the previous period)");
    expect(vsPrevious(101, 100)).toBe(" (about the same as the previous period)");
    expect(vsPrevious(5, 0)).toBe("");
    expect(bullets(["a", false, 0, null, "b"])).toBe("- a\n- b");
  });

  it("drops sections without a heading and exports markdown", () => {
    const s = cleanSections([
      { heading: " Summary ", body: "Hi\r\n" },
      { heading: "  ", body: "orphan" },
    ]);
    expect(s).toEqual([{ heading: "Summary", body: "Hi" }]);
    expect(toMarkdown("Gala", "Event report", s)).toBe("# Gala\n\n_Event report_\n\n## Summary\n\nHi\n");
  });

  it("rejects an AI rewrite that loses or changes a number", () => {
    const original = "Sold 412 tickets for ₹1,03,770 (86% of seats).";
    expect(
      keepsNumbers({ heading: "S", body: original }, { heading: "S", body: "We sold 412 tickets, bringing in ₹1,03,770 — 86% of seats." }),
    ).toBe(true);
    expect(keepsNumbers({ heading: "S", body: original }, { heading: "S", body: "We sold about 400 tickets for over ₹1 lakh." })).toBe(
      false,
    );
  });
});

describe("report validation", () => {
  it("needs a subject for event and fundraiser reports", () => {
    expect(generateReportSchema.safeParse({ type: "EVENT" }).success).toBe(false);
    expect(generateReportSchema.safeParse({ type: "EVENT", subjectId: "e1" }).success).toBe(true);
    expect(generateReportSchema.safeParse({ type: "FINANCE", period: "month" }).success).toBe(true);
    expect(generateReportSchema.safeParse({ type: "PIZZA" }).success).toBe(false);
  });

  it("requires a title and at least one section", () => {
    const ok = { reportId: "r", title: "Gala report", sections: [{ heading: "Summary", body: "" }], status: "DRAFT" };
    expect(saveReportSchema.safeParse(ok).success).toBe(true);
    expect(saveReportSchema.safeParse({ ...ok, sections: [] }).success).toBe(false);
    expect(saveReportSchema.safeParse({ ...ok, title: "" }).success).toBe(false);
  });
});
