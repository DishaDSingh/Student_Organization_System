import "server-only";
import { db } from "@/lib/db";
import type { Candidate } from "./rules";

/** Matching candidates: volunteer profiles plus experience and current workload. */
export async function loadCandidates(): Promise<Candidate[]> {
  const profiles = await db.volunteerProfile.findMany({
    where: { isActive: true, user: { status: "ACTIVE" } },
    select: {
      userId: true,
      skills: true,
      interests: true,
      availability: true,
      maxHoursPerWeek: true,
      user: { select: { name: true, tasksAssigned: { select: { status: true, estimatedHours: true } } } },
    },
  });
  return profiles.map((p) => {
    const tasks = p.user.tasksAssigned;
    const open = tasks.filter((t) => t.status !== "DONE");
    return {
      userId: p.userId,
      name: p.user.name,
      skills: p.skills,
      interests: p.interests,
      availability: p.availability,
      maxHoursPerWeek: p.maxHoursPerWeek,
      completedTasks: tasks.filter((t) => t.status === "DONE").length,
      completedShifts: 0,
      // Open tasks are assumed to be spread over about two weeks.
      committedHours: Math.round((open.reduce((h, t) => h + Math.min(t.estimatedHours ?? 2, 6), 0) / 2) * 10) / 10,
      openTasks: open.length,
    };
  });
}

/** Hours each person has logged on tasks. */
export async function volunteerHours(userIds?: string[]) {
  const rows = await db.task.groupBy({
    by: ["assigneeId"],
    where: { assigneeId: userIds ? { in: userIds } : { not: null } },
    _sum: { loggedHours: true },
  });
  return new Map(rows.filter((r) => r.assigneeId).map((r) => [r.assigneeId!, r._sum.loggedHours ?? 0]));
}
