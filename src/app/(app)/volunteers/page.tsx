import type { Metadata } from "next";
import { HandHeartIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SLOTS } from "@/lib/volunteers/rules";
import { volunteerHours } from "@/lib/volunteers/load";

export const metadata: Metadata = { title: "Volunteers" };

export default async function VolunteersPage() {
  await requirePermission("volunteers.view");
  const profiles = await db.volunteerProfile.findMany({
    where: { isActive: true },
    orderBy: { user: { name: "asc" } },
    select: {
      userId: true,
      skills: true,
      availability: true,
      user: { select: { name: true, tasksAssigned: { where: { status: { not: "DONE" } }, select: { id: true } } } },
    },
  });
  const hours = await volunteerHours(profiles.map((p) => p.userId));
  const slotLabel = (k: string) =>
    SLOTS.find((s) => s.key === k)?.label.replace(/^Week(day|end) /, (m) => (m.startsWith("Weekday") ? "Wkday " : "Wkend ")) ?? k;

  return (
    <>
      <PageHeader title="Volunteers" description={`${profiles.length} people have signed up to help.`} />
      {profiles.length === 0 ? (
        <EmptyState icon={HandHeartIcon} title="No volunteers yet">
          Members can sign up from their Volunteering page.
        </EmptyState>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Good at</TableHead>
                <TableHead className="hidden md:table-cell">Usually free</TableHead>
                <TableHead className="text-right">Open tasks</TableHead>
                <TableHead className="pr-4 text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell className="pl-4 font-medium">{p.user.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                    {p.skills.slice(0, 3).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                    {p.availability.slice(0, 2).map(slotLabel).join(", ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.user.tasksAssigned.length}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{Math.round(hours.get(p.userId) ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
