import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { daysAgo, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/volunteers/rules";
import { TaskDoneCheckbox } from "../../fundraisers/fundraiser-forms";
import { VolunteerForm } from "./volunteer-form";

export const metadata: Metadata = { title: "Volunteering" };

export default async function MyVolunteeringPage() {
  const user = await requireUser();
  const [profile, tasks] = await Promise.all([
    db.volunteerProfile.findUnique({ where: { userId: user.id } }),
    db.task.findMany({
      where: { assigneeId: user.id },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 30,
      include: { fundraiser: { select: { id: true, title: true } }, event: { select: { id: true, title: true } } },
    }),
  ]);
  const now = daysAgo(0);
  const open = tasks.filter((t) => t.status !== "DONE");
  const hours =
    tasks.reduce((s, t) => s + t.loggedHours, 0) +
    tasks.filter((t) => t.status === "DONE").reduce((s, t) => s + (t.loggedHours ? 0 : (t.estimatedHours ?? 0)), 0);

  if (!profile) {
    return (
      <>
        <PageHeader title="Volunteering" description="Help run events and fundraisers. Coordinators will suggest tasks that fit you." />
        <Section title="Become a volunteer">
          <VolunteerForm initial={{ skills: [], availability: [], maxHoursPerWeek: 4 }} submitLabel="Sign me up" />
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Volunteering"
        description={`${open.length} task${open.length === 1 ? "" : "s"} to do · about ${Math.round(hours)} hours contributed. Thank you!`}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Section title="My tasks">
          {tasks.length ? (
            <ul className="divide-y">
              {tasks.map((t) => {
                const late = isOverdue(t, new Date(now.getTime() + 86_400_000 - 1));
                const parent = t.fundraiser ?? t.event;
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <TaskDoneCheckbox taskId={t.id} done={t.status === "DONE"} label={t.title} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {parent && (
                          <Link
                            href={t.fundraiser ? `/fundraisers/${t.fundraiser.id}` : `/events/${t.event!.id}`}
                            className="hover:underline"
                          >
                            {parent.title}
                          </Link>
                        )}
                        {t.dueAt && (
                          <span className={cn(late && "text-destructive font-medium")}>
                            {" "}
                            · {late ? "Overdue" : "Due"} {fmtDate(t.dueAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No tasks yet — you&apos;ll get a notification when someone assigns you one.</p>
          )}
        </Section>
        <Section title="My volunteer profile">
          <VolunteerForm initial={profile} submitLabel="Save" />
        </Section>
      </div>
    </>
  );
}
