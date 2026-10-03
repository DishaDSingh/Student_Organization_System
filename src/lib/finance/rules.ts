/**
 * Finance rules. Money in = paid Payment rows; money out = approved or
 * reimbursed Expense rows. Pure functions so totals are easy to test.
 */

export const EXPENSE_CATEGORIES = [
  "Event costs",
  "Food & refreshments",
  "Printing & stationery",
  "Merch production",
  "Travel",
  "Decorations",
  "Software & subscriptions",
  "Donations paid out",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_STATUS_LABEL = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REIMBURSED: "Paid back",
} as const;
export type ExpenseStatusKey = keyof typeof EXPENSE_STATUS_LABEL;

/** Expenses that count as money spent. */
export const SPENT_STATUSES = ["APPROVED", "REIMBURSED"] as const satisfies readonly ExpenseStatusKey[];

export const INCOME_LABEL = {
  MEMBERSHIP: "Membership dues",
  TICKET: "Ticket sales",
  MERCH: "Merch sales",
  DONATION: "Donations",
  OTHER: "Other income",
} as const;

export function balance(inPaise: number, outPaise: number) {
  return { in: inPaise, out: outPaise, left: inPaise - outPaise };
}

/** Group rows into labelled totals, biggest first — for the simple bar lists. */
export function breakdown<K extends string>(rows: { key: K; paise: number }[]) {
  const total = rows.reduce((s, r) => s + r.paise, 0);
  return rows
    .filter((r) => r.paise > 0)
    .sort((a, b) => b.paise - a.paise)
    .map((r) => ({ ...r, pct: total ? Math.round((r.paise / total) * 100) : 0 }));
}

/** Four-eyes rule: nobody approves their own claim. */
export const canReview = (expense: { status: string; submittedById: string | null }, reviewerId: string) =>
  expense.status === "PENDING" && expense.submittedById !== reviewerId;

// ─── Receipt reading (offline fallback) ──────────────────────────────────────

const CATEGORY_HINTS: [RegExp, ExpenseCategory][] = [
  [/swiggy|zomato|cafe|restaurant|food|bakery|snack|pizza|tea|coffee|caterer|catering/i, "Food & refreshments"],
  [/print|xerox|stationer|paper|flex|banner|poster/i, "Printing & stationery"],
  [/uber|ola|rapido|irctc|rail|bus|taxi|cab|fuel|petrol|metro/i, "Travel"],
  [/decor|flower|balloon|light|florist/i, "Decorations"],
  [/t-?shirt|hoodie|apparel|merch|embroider|screen ?print/i, "Merch production"],
  [/canva|google|zoom|notion|figma|subscription|domain|hosting/i, "Software & subscriptions"],
  [/venue|hall|sound|dj|stage|tent|rental/i, "Event costs"],
];

export function guessCategory(text: string): ExpenseCategory {
  return CATEGORY_HINTS.find(([re]) => re.test(text))?.[1] ?? "Other";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDate(text: string): string | null {
  // 03/10/2026, 03-10-26 (Indian receipts are day-first)
  let m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/\b(\d{1,2})[ -]([a-z]{3})[a-z]*[ ,-]+(\d{4})\b/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const money = (s: string) => Number(s.replace(/,/g, ""));
const AMOUNT = String.raw`(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)`;

export type ReceiptGuess = {
  vendor: string | null;
  date: string | null;
  totalRupees: number | null;
  taxRupees: number | null;
  category: ExpenseCategory;
};

/**
 * Best-effort reading of receipt text without AI: first line = shop name,
 * "Total"/"Grand total"/"Amount" line = amount, GST/tax lines = tax.
 * Anything it can't find is left empty for the person to fill in.
 */
export function parseReceiptText(text: string): ReceiptGuess {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const vendor = lines.find((l) => /[a-z]{3}/i.test(l) && !/receipt|invoice|bill|tax|gst|date/i.test(l)) ?? null;

  const totals = [
    ...text.matchAll(new RegExp(String.raw`(?:grand\s*total|net\s*amount|total\s*amount|amount\s*paid|total)\s*:?\s*` + AMOUNT, "gi")),
  ]
    .map((m) => money(m[1]))
    .filter((n) => n > 0);
  // "GSTIN" and "Tax invoice" are headings, not amounts.
  const taxes = [
    ...text.matchAll(
      new RegExp(String.raw`(?:[csi]?gst(?!\s*in)|tax(?!\s*inv))[^\n\d]*?(?:\s*\d{1,2}(?:\.\d+)?\s*%)?\s*:?\s*` + AMOUNT, "gi"),
    ),
  ]
    .map((m) => money(m[1]))
    .filter((n) => n > 0);

  return {
    vendor: vendor?.slice(0, 80) ?? null,
    date: parseDate(text),
    // The largest "total" is the grand total (sub-totals are smaller).
    totalRupees: totals.length ? Math.max(...totals) : null,
    taxRupees: taxes.length ? Math.round(taxes.reduce((s, n) => s + n, 0) * 100) / 100 : null,
    category: guessCategory(text),
  };
}
