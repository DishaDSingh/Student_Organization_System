import type { Metadata } from "next";
import Link from "next/link";
import { NotebookPenIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";
import { fmtDateTime, toDateInput } from "@/lib/format";
import { NewMeetingDialog } from "./new-meeting";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const user = await requirePermission("calendar.view");
  const [meetings, committees] = await Promise.all([
    db.meeting.findMany({
      orderBy: { heldAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        heldAt: true,
        status: true,
        committee: { select: { name: true } },
        _count: { select: { tasks: true } },
      },
    }),
    db.committee.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Paste notes or a transcript — get decisions, action items and open questions. Tasks are created only after you confirm."
        actions={can(user, "calendar.manage") && <NewMeetingDialog committees={committees} today={toDateInput(new Date())} />}
      />
      {meetings.length === 0 ? (
        <EmptyState icon={NotebookPenIcon} title="No meetings yet" />
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/meetings/${m.id}`} className="hover:bg-muted/50 flex items-center gap-4 px-4 py-3 transition-colors sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {[fmtDateTime(m.heldAt), m.committee?.name, m._count.tasks ? `${m._count.tasks} tasks` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={cn("text-xs font-medium", m.status === "CONFIRMED" ? "text-success" : "text-amber-700 dark:text-amber-300")}
                >
                  {m.status === "CONFIRMED" ? "Confirmed" : "Needs review"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
