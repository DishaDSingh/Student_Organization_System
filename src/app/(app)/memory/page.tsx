import type { Metadata } from "next";
import Link from "next/link";
import { BrainIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate, param } from "@/lib/format";
import { aiConfigured } from "@/lib/ai/claude";
import { answerFromMemory, searchMemory } from "@/lib/memory/search";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/memory/rank";
import { AddMemoryDialog } from "./add-memory";

export const metadata: Metadata = { title: "Memory" };

const EXAMPLES = [
  "What happened during last year's Gala?",
  "Which vendors did we use for sound?",
  "What did we decide about ticket prices?",
  "Sponsors",
];

export default async function MemoryPage(props: PageProps<"/memory">) {
  const user = await requirePermission("reports.view");
  const sp = await props.searchParams;
  const q = (param(sp.q) ?? "").trim().slice(0, 300);
  const [{ hits }, recent, events] = await Promise.all([
    q ? searchMemory(q) : Promise.resolve({ words: [], hits: [] }),
    q ? Promise.resolve([]) : db.memoryItem.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    can(user, "reports.generate")
      ? db.event.findMany({ where: { status: "PUBLISHED" }, orderBy: { startsAt: "desc" }, take: 40, select: { id: true, title: true } })
      : [],
  ]);
  const ai = q && aiConfigured() ? await answerFromMemory(q, hits) : null;
  const cited = new Set(ai?.cited ?? []);

  return (
    <>
      <PageHeader
        title="Organization memory"
        description="Past events, reports, decisions, lessons, vendors and sponsors — so nothing is lost when leadership changes."
        actions={can(user, "reports.generate") && <AddMemoryDialog events={events} />}
      />

      <form action="/memory" className="mb-6 flex max-w-2xl gap-2" role="search">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="What happened during last year's Gala?"
            aria-label="Search memory"
            className="pl-9"
            maxLength={300}
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {!q ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Try asking">
            <ul className="grid gap-2 text-sm">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <Link href={`/memory?q=${encodeURIComponent(e)}`} className="text-primary hover:underline">
                    {e}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Recently added">
            {recent.length ? (
              <ul className="grid gap-3 text-sm">
                {recent.map((m) => (
                  <li key={m.id}>
                    <p className="font-medium">{m.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {MEMORY_KINDS[m.kind as MemoryKind] ?? m.kind}
                      {m.happenedAt && ` · ${fmtDate(m.happenedAt)}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nothing saved yet.</p>
            )}
          </Section>
        </div>
      ) : hits.length === 0 ? (
        <EmptyState icon={BrainIcon} title="Nothing found">
          Try different words — e.g. an event name, a vendor or a topic.
        </EmptyState>
      ) : (
        <div className="grid max-w-3xl gap-4">
          {ai && (
            <div className="bg-primary/5 border-primary/20 rounded-xl border p-4 text-sm">
              <p className="text-primary mb-1 flex items-center gap-1.5 text-xs font-medium">
                <SparklesIcon className="size-3.5" /> Answer from the sources below
              </p>
              <p>{ai.answer}</p>
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            {hits.length} result{hits.length === 1 ? "" : "s"}, most relevant first.
          </p>
          <ul className="grid gap-3">
            {hits.map((h, i) => (
              <li key={h.id} className={`bg-card rounded-xl border p-4 ${cited.has(h.id) ? "border-primary/40" : ""}`}>
                <p className="text-muted-foreground mb-1 text-xs">
                  [{i + 1}] {h.kind}
                  {h.date && ` · ${fmtDate(h.date)}`}
                  {cited.has(h.id) && <span className="text-primary"> · cited</span>}
                </p>
                <p className="font-medium">
                  {h.href ? (
                    <Link href={h.href} className="hover:underline">
                      {h.title}
                    </Link>
                  ) : (
                    h.title
                  )}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">{h.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
