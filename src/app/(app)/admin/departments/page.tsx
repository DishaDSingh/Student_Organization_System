import type { Metadata } from "next";
import Link from "next/link";
import { NetworkIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DepartmentDialog } from "./department-dialog";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const user = await requirePermission("departments.view");
  const manage = can(user, "departments.manage");
  const departments = await db.department.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      head: { select: { id: true, name: true, email: true } },
      _count: { select: { members: true, committees: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Departments"
        description="The permanent functional areas of your organization, each with a head."
        actions={manage && <DepartmentDialog />}
      />
      {departments.length === 0 ? (
        <EmptyState icon={NetworkIcon} title="No departments yet">
          Create departments like Finance, Events and Merchandise to organize people.
        </EmptyState>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Department</TableHead>
                <TableHead>Head</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Committees</TableHead>
                {manage && <TableHead className="w-12 pr-4" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 whitespace-normal">
                    <span className="font-medium">{d.name}</span>
                    <span className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 font-mono text-xs">{d.code}</span>
                    {d.description && <p className="text-muted-foreground mt-0.5 max-w-md text-xs">{d.description}</p>}
                  </TableCell>
                  <TableCell>
                    {d.head ? (
                      can(user, "users.view") ? (
                        <Link href={`/admin/users/${d.head.id}`} className="hover:underline">
                          {d.head.name}
                        </Link>
                      ) : (
                        d.head.name
                      )
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {can(user, "users.view") ? (
                      <Link href={`/admin/users?dept=${d.id}`} className="hover:underline">
                        {d._count.members}
                      </Link>
                    ) : (
                      d._count.members
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{d._count.committees}</TableCell>
                  {manage && (
                    <TableCell className="pr-4 text-right">
                      <DepartmentDialog department={d} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
