import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, SparklesIcon, XIcon } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { aiConfigured, AI_MODEL } from "@/lib/ai/claude";

export const metadata: Metadata = { title: "How AI works here" };

/** Phase 24 — every AI feature, what it may do, and where a person decides. */
const FEATURES = [
  {
    name: "Ask (copilot)",
    href: "/copilot",
    ai: "Works out which question you asked.",
    human: "Reads the answer and its sources.",
    never: "Never makes up a number — every figure is computed from the database.",
    offline: "Keyword matching.",
  },
  {
    name: "Insights & pulse",
    href: "/insights",
    ai: "No AI — clear rules with stated thresholds.",
    human: "Decides whether and how to act.",
    never: "Never changes data; suggested announcements open as drafts.",
    offline: "Always works offline.",
  },
  {
    name: "Receipt scanner",
    href: "/finance/new",
    ai: "Reads the receipt and fills in the expense form.",
    human: "Checks and submits; the treasurer approves.",
    never: "Never submits or approves an expense.",
    offline: "Paste receipt text; a local reader fills the form.",
  },
  {
    name: "Reports & summaries",
    href: "/reports",
    ai: "Rewrites the factual draft into clearer prose.",
    human: "Edits, marks final, exports.",
    never: "Rewrites that change any number are rejected automatically.",
    offline: "Factual template text.",
  },
  {
    name: "Meeting intelligence",
    href: "/meetings",
    ai: "Finds decisions, action items and open questions.",
    human: "Reviews owners and dates, then confirms.",
    never: "Never creates tasks or saves decisions before you confirm.",
    offline: "Reads cues like “Decided:”, “Action:”, “@name”.",
  },
  {
    name: "Announcements",
    href: "/announcements",
    ai: "Writes a first draft from your brief.",
    human: "Edits; a publisher confirms the exact recipient count.",
    never: "Never sends anything by itself.",
    offline: "Simple template from your brief.",
  },
  {
    name: "Organization memory",
    href: "/memory",
    ai: "Answers using only the retrieved sources, with citations.",
    human: "Opens the sources to check.",
    never: "Never answers beyond what the sources say.",
    offline: "Ranked search results.",
  },
  {
    name: "Merch studio",
    href: "/merch/studio",
    ai: "Generates print artwork (sanitised SVG).",
    human: "A second person approves the design before it becomes a product.",
    never: "Never publishes a product or changes prices.",
    offline: "Template designer.",
  },
  {
    name: "What if?",
    href: "/simulate",
    ai: "No AI — transparent formulas on a copy of the data.",
    human: "Changes assumptions and compares.",
    never: "Has no way to change live data at all.",
    offline: "Always works offline.",
  },
];

export default async function AiPage() {
  await requireUser();
  const on = aiConfigured();
  return (
    <>
      <PageHeader title="How AI works here" description="AI helps people decide — it never quietly takes decisions for them." />

      <Section title="The rule for every AI feature" className="mb-6">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {["Analyze", "Propose", "Human reviews", "Confirm", "Execute"].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={
                  i === 2 || i === 3
                    ? "bg-primary text-primary-foreground rounded-full px-3 py-1 font-medium"
                    : "bg-muted rounded-full px-3 py-1"
                }
              >
                {s}
              </span>
              {i < 4 && <span className="text-muted-foreground">→</span>}
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-3 text-sm">
          Sending announcements, approving expenses, changing money records, deleting data, publishing events and changing permissions
          always need a person with the right role to confirm. AI suggestions are logged in the audit trail, and so is the human decision
          that follows.
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-sm">
          <SparklesIcon className="text-primary size-4" />
          {on
            ? `AI is on (${AI_MODEL}). Every feature still works offline if it's unreachable.`
            : "AI is off on this server — every feature is running in its offline mode."}
        </p>
      </Section>

      <div className="bg-card overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th className="px-4 py-2 font-medium">Feature</th>
              <th className="px-4 py-2 font-medium">What AI does</th>
              <th className="px-4 py-2 font-medium">What a person does</th>
              <th className="px-4 py-2 font-medium">Guardrail</th>
              <th className="px-4 py-2 font-medium">Without AI</th>
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {FEATURES.map((f) => (
              <tr key={f.name}>
                <td className="px-4 py-3 font-medium">
                  <Link href={f.href} className="hover:underline">
                    {f.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{f.ai}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex gap-1.5">
                    <CheckIcon className="text-success mt-0.5 size-4 shrink-0" /> {f.human}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex gap-1.5">
                    <XIcon className="text-destructive mt-0.5 size-4 shrink-0" /> {f.never}
                  </span>
                </td>
                <td className="text-muted-foreground px-4 py-3">{f.offline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground mt-4 text-xs">
        No facial recognition, no tracking of individuals, and no selling or sharing of member data with AI providers beyond the request
        being answered.
      </p>
    </>
  );
}
