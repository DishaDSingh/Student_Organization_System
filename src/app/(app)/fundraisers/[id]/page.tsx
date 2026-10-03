import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { Meter } from "@/components/events";
import { Button } from "@/components/ui/button";
import { daysAgo, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { fundraiserProgress, isOverdue } from "@/lib/volunteers/rules";
import { raisedByFundraiser } from "@/lib/fundraisers";
import { DonationDialog, QuickAddTask, SuggestButton, TaskDoneCheckbox } from "../fundraiser-forms";

export const metadata: Metadata = { title: "Fundraiser" };

export default async function FundraiserPage(props: PageProps<"/fundraisers/[id]">) {
  const user = await requirePermission("fundraisers.view");
  const { id } = await props.params;
  const f = await db.fundraiser.findUnique({
    where: { id },
    include: {
      lead: { select: { name: true } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { assignee: { select: { name: true } } } },
    },
  });
  if (!f) notFound();

  const [raised, donations] = await Promise.all([
    raisedByFundraiser([id]),
    db.payment.findMany({
      where: { fundraiserId: id, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 6,
      select: { id: true, amountPaise: true, paidAt: true, notes: true, payer: { select: { name: true } } },
    }),
  ]);
  const r = raised.get(id) ?? 0;
  const pct = fundraiserProgress(r, f.goalPaise);
  const manage = can(user, "fundraisers.manage");
  const assign = manage || can(user, "volunteers.assign_tasks");
  const now = daysAgo(0);
  const daysLeft = Math.ceil((f.endsAt.getTime() - now.getTime()) / 86_400_000);
  const open = f.tasks.filter((t) => t.status !== "DONE");
  const done = f.tasks.length - open.length;

  return (
    <>
      <PageHeader
        back={{ href: "/fundraisers", label: "Fundraisers" }}
        title={f.title}
        description={`${f.cause} · led by ${f.lead?.name ?? "—"} · ${fmtDate(f.startsAt)} – ${fmtDate(f.endsAt)}`}
        actions={
          manage && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/fundraisers/${id}/edit`}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
              {(manage || can(user, "finance.record_income")) && f.status !== "CANCELLED" && <DonationDialog fundraiserId={id} />}
            </>
          )
        }
      />

      {/* The one number that matters most, front and centre. */}
      <section className="bg-card mb-6 rounded-xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p>
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatINR(r)}</span>
            <span className="text-muted-foreground"> raised of {formatINR(f.goalPaise)}</span>
          </p>
          <p className="text-muted-foreground text-sm">
            {f.status === "COMPLETED" ? "Completed" : daysLeft >= 0 ? `${daysLeft} days left` : "Ended"} · {done}/{f.tasks.length} tasks
            done
          </p>
        </div>
        <Meter value={pct} max={100} className="mt-3 h-3" tone={pct >= 100 ? "bg-success" : "bg-primary/70"} />
        {f.description && <p className="text-muted-foreground mt-4 max-w-2xl text-sm">{f.description}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Section title="Tasks" description={open.length ? `${open.length} left to do` : "All done!"}>
          {assign && (
            <div className="mb-4">
              <QuickAddTask fundraiserId={id} />
            </div>
          )}
          {f.tasks.length ? (
            <ul className="divide-y">
              {f.tasks.map((t) => {
                const late = isOverdue(t, new Date(now.getTime() + 86_400_000 - 1));
                const mine = t.assigneeId === user.id;
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    {(assign || mine) && <TaskDoneCheckbox taskId={t.id} done={t.status === "DONE"} label={t.title} />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {t.requiredSkills[0] && `${t.requiredSkills[0]} · `}
                        {t.dueAt ? (
                          <span className={cn(late && "text-destructive font-medium")}>
                            {late ? "Overdue · " : "Due "}
                            {fmtDate(t.dueAt)}
                          </span>
                        ) : (
                          "No due date"
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      {t.assignee ? (
                        <span>{t.assignee.name}</span>
                      ) : assign && t.status !== "DONE" ? (
                        <SuggestButton taskId={t.id} title={t.title} />
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No tasks yet.</p>
          )}
        </Section>

        <Section title="Recent donations">
          {donations.length ? (
            <ul className="grid gap-2.5 text-sm">
              {donations.map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span className="truncate">{d.payer?.name ?? d.notes?.match(/^Donor: ([^·]+)/)?.[1]?.trim() ?? "Anonymous"}</span>
                  <span className="shrink-0 font-medium tabular-nums">{formatINR(d.amountPaise)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No donations yet.</p>
          )}
        </Section>
      </div>
    </>
  );
}
