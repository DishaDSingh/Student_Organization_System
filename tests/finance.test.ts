import { describe, expect, it } from "vitest";
import { balance, breakdown, canReview, guessCategory, parseReceiptText } from "@/lib/finance/rules";
import { expenseSchema, reviewExpenseSchema } from "@/lib/validation/schemas";

describe("finance totals", () => {
  it("computes what's left, including going negative", () => {
    expect(balance(100_00, 30_00)).toEqual({ in: 100_00, out: 30_00, left: 70_00 });
    expect(balance(10_00, 30_00).left).toBe(-20_00);
  });

  it("sorts the breakdown biggest first and drops zero rows", () => {
    const rows = breakdown([
      { key: "Food", paise: 100 },
      { key: "Travel", paise: 0 },
      { key: "Events", paise: 300 },
    ]);
    expect(rows.map((r) => r.key)).toEqual(["Events", "Food"]);
    expect(rows.map((r) => r.pct)).toEqual([75, 25]);
  });
});

describe("four-eyes approval", () => {
  it("never lets someone approve their own claim, or re-decide one", () => {
    expect(canReview({ status: "PENDING", submittedById: "a" }, "b")).toBe(true);
    expect(canReview({ status: "PENDING", submittedById: "a" }, "a")).toBe(false);
    expect(canReview({ status: "APPROVED", submittedById: "a" }, "b")).toBe(false);
  });
});

describe("offline receipt reading", () => {
  const receipt = `SHARMA SWEETS & SNACKS
GSTIN: 27ABCDE1234F1Z5
Tax Invoice No: 4512
Date: 03/10/2026
Samosa x 40      800.00
Tea x 20         400.00
Sub Total       1200.00
CGST @2.5%        30.00
SGST @2.5%        30.00
Grand Total   ₹ 1,260.00`;

  it("finds the shop, day-first date, grand total and tax", () => {
    const g = parseReceiptText(receipt);
    expect(g.vendor).toBe("SHARMA SWEETS & SNACKS");
    expect(g.date).toBe("2026-10-03");
    expect(g.totalRupees).toBe(1260);
    // GSTIN and the invoice number are not tax amounts.
    expect(g.taxRupees).toBe(60);
    expect(g.category).toBe("Food & refreshments");
  });

  it("reads the tax amount, not the GST rate", () => {
    const g = parseReceiptText("PRINT POINT\n02/10/2026\nCGST 9%    81.00\nSGST 9%    81.00\nTotal   1,062.00");
    expect(g.taxRupees).toBe(162);
    expect(g.totalRupees).toBe(1062);
  });

  it("reads written-out dates and leaves unknowns empty", () => {
    expect(parseReceiptText("Print Point\n5 Sep 2026\nTotal: Rs. 450").date).toBe("2026-09-05");
    const g = parseReceiptText("hello world");
    expect(g.totalRupees).toBeNull();
    expect(g.date).toBeNull();
    expect(g.category).toBe("Other");
  });

  it("guesses a category from the vendor", () => {
    expect(guessCategory("Uber trip")).toBe("Travel");
    expect(guessCategory("Shree Xerox")).toBe("Printing & stationery");
  });
});

describe("expense validation", () => {
  const valid = { description: "Posters", category: "Printing & stationery", amountRupees: "450", spentAt: "2026-10-01" };

  it("accepts a normal claim and rejects bad ones", () => {
    expect(expenseSchema.safeParse(valid).success).toBe(true);
    expect(expenseSchema.safeParse({ ...valid, amountRupees: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, taxRupees: "500" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, spentAt: "2099-01-01" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, category: "Party" }).success).toBe(false);
  });

  it("requires a reason to reject", () => {
    expect(reviewExpenseSchema.safeParse({ expenseId: "x", decision: "REJECT" }).success).toBe(false);
    expect(reviewExpenseSchema.safeParse({ expenseId: "x", decision: "REJECT", note: "No receipt" }).success).toBe(true);
    expect(reviewExpenseSchema.safeParse({ expenseId: "x", decision: "APPROVE" }).success).toBe(true);
  });
});
