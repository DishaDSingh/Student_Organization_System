import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Extracted } from "@/lib/meetings/extract";
import { ExtractButton, ReviewForm } from "./review";

export const metadata: Metadata = { title: "Meeting" };

type Stored = Extracted & { actions: (Extracted["actions"][number] & { ownerId?: string | null; created?: boolean })[] };

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const user = await requirePermission("calendar.view");
  const { id } = await props.params;
  const m = await db.meeting.findUnique({
    where: { id },
    include: {
      committee: { select: { name: true } },
      tasks: { select: { id: true, title: true, status: true, dueAt: true, assignee: { select: { name: true } } } },
    },
  });
  if (!m) notFound();
  const x = m.extracted as Stored | null;
  const manage = can(user, "calendar.manage");
  const people =
    manage && x && m.status !== "CONFIRMED"
      ? await db.user.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];

  return (
    <>
      <PageHeader
        title={m.title}
        description={[fmtDateTime(m.heldAt), m.committee?.name, m.status === "CONFIRMED" ? "Confirmed" : "Needs review"]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/meetings", label: "Meetings" }}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="grid content-start gap-6 lg:col-span-3">
          {m.status === "CONFIRMED" && x ? (
            <>
              <Section title="Summary">
                <p className="text-sm">{x.summary}</p>
              </Section>
              <Section title="Decisions" description="Saved to organization memory.">
                <List items={x.decisions} empty="No decisions recorded." />
              </Section>
              <Section title="Tasks created">
                {m.tasks.length ? (
                  <ul className="grid gap-2 text-sm">
                    {m.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <CheckCircle2Icon className={t.status === "DONE" ? "text-success size-4" : "text-muted-foreground size-4"} />
                        <span className="flex-1">{t.title}</span>
                        <span className="text-muted-foreground text-xs">
                          {t.assignee?.name ?? "Unassigned"}
                          {t.dueAt && ` · ${fmtDate(t.dueAt)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">No tasks were created.</p>
                )}
              </Section>
              <Section title="Open questions">
                <List items={x.questions} empty="None." />
              </Section>
            </>
          ) : x && manage ? (
            <ReviewForm meetingId={m.id} initial={x} people={people} source={m.source} />
          ) : manage ? (
            <Section title="Next step">
              <p className="text-muted-foreground mb-4 text-sm">
                Find the decisions, action items and open questions in these notes. You&apos;ll review and edit them before anything is
                created.
              </p>
              <ExtractButton meetingId={m.id} />
            </Section>
          ) : (
            <p className="text-muted-foreground text-sm">This meeting hasn&apos;t been reviewed yet.</p>
          )}
        </div>
        <Section title="Notes" className="lg:col-span-2">
          <pre className="text-muted-foreground max-h-[32rem] overflow-auto font-sans text-sm whitespace-pre-wrap">{m.notes}</pre>
          {m.status === "CONFIRMED" && (
            <p className="mt-3 text-xs">
              <Link href="/memory" className="text-primary hover:underline">
                Search organization memory →
              </Link>
            </p>
          )}
        </Section>
      </div>
    </>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((d, i) => (
        <li key={i}>{d}</li>
      ))}
    </ul>
  ) : (
    <p className="text-muted-foreground text-sm">{empty}</p>
  );
}
