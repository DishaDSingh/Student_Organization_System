/**
 * Offline question router for the Organization Copilot. Picks which data
 * question is being asked and pulls out the subject ("Gala", "hoodies") and
 * period. Claude does the same job better when configured; either way the
 * numbers come from code, never from the model.
 */

export const INTENTS = [
  "attention",
  "active_members",
  "expiring_memberships",
  "pending_reimbursements",
  "top_attendance",
  "event_money",
  "stock_left",
  "fundraiser_progress",
  "finance_summary",
  "upcoming_events",
  "my_tasks",
  "help",
] as const;
export type Intent = (typeof INTENTS)[number];
export type Period = "today" | "week" | "month" | "year";
export type Route = { intent: Intent; subject: string | null; period: Period | null };

export const INTENT_HELP: Record<Intent, string> = {
  attention: "What needs my attention today? (alerts and to-dos)",
  active_members: "How many active members do we have?",
  expiring_memberships: "Which memberships expire this week / this month?",
  pending_reimbursements: "Show pending reimbursements and expense claims.",
  top_attendance: "Which event had the highest attendance?",
  event_money: "How much money did <event> make? (ticket sales, costs, net)",
  stock_left: "How many <hoodies / tees / caps> are left?",
  fundraiser_progress: "How is <fundraiser> doing?",
  finance_summary: "How much came in / went out this month?",
  upcoming_events: "What events are coming up?",
  my_tasks: "What tasks are assigned to me?",
  help: "Anything else — shows what I can answer.",
};

const RULES: [Intent, RegExp][] = [
  ["my_tasks", /\bmy (open )?tasks?\b|assigned to me|what (should|do) i (do|work on)/],
  ["attention", /attention|to-?do|priorit|urgent|anything wrong|alerts?\b|today\b.*(need|do)/],
  ["pending_reimbursements", /reimburs|pay(ing)? back|paid back|owed|pending (claims?|expenses?)|expense claims?/],
  ["expiring_memberships", /expir|renewals? due|lapsing/],
  ["active_members", /how many .*members|member count|active members|number of members|membership (count|numbers)/],
  ["top_attendance", /(highest|most|best|biggest|top).*(attend|turnout|crowd)|attendance/],
  ["stock_left", /\b(left|stock|inventory|remaining)\b/],
  ["fundraiser_progress", /fundrais|donation|drive\b|bake sale|appeal/],
  [
    "event_money",
    /(money|revenue|earn|made|make|profit|income|sales).*\b(gala|night|fest|mixer|event|workshop|panel|expo|meet|concert|party|clinic|bootcamp)/,
  ],
  ["finance_summary", /income|expenses?|spen[dt]|balance|cash ?flow|money (in|out)|finances?|how much (came|did we)/],
  ["upcoming_events", /upcoming|next events?|coming up|what events|events? (this|next)/],
];

const STOP = new Set(
  "how much many did does do the a an of for to in on at we our us is are was were what which who make made earn money revenue left stock remaining show me tell about this last year's year years total have has from with event events ticket tickets sales doing going fundraiser progress".split(
    " ",
  ),
);

export function extractSubject(question: string): string | null {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return words.length ? words.join(" ") : null;
}

export function extractPeriod(q: string): Period | null {
  if (/\btoday\b/.test(q)) return "today";
  if (/\bweek\b/.test(q)) return "week";
  if (/\bmonth\b/.test(q)) return "month";
  if (/\byear\b|annual/.test(q)) return "year";
  return null;
}

export function routeOffline(question: string): Route {
  const q = question.toLowerCase();
  const intent = RULES.find(([, re]) => re.test(q))?.[0] ?? "help";
  const needsSubject = intent === "event_money" || intent === "stock_left" || intent === "fundraiser_progress";
  return { intent, subject: needsSubject ? extractSubject(question) : null, period: extractPeriod(q) };
}

/** How well a title matches a free-text subject: share of subject words found in the title. */
export function matchScore(subject: string, title: string) {
  const t = title.toLowerCase();
  const words = subject
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/s$/, "")); // "hoodies" → "hoodie", "galas" → "gala"
  if (!words.length) return 0;
  return words.filter((w) => t.includes(w)).length / words.length;
}

/** Start of a period ("this week" = last 7 days, "this month" = calendar month, …). */
export function periodStart(p: Period, now = new Date()) {
  if (p === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "week") return new Date(now.getTime() - 7 * 86_400_000);
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

export const PERIOD_LABEL: Record<Period, string> = { today: "today", week: "in the last 7 days", month: "this month", year: "this year" };
