import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { fmtDate, fmtDateTime, toDateInput } from "@/lib/format";
import { AddMemberForm, CommitteeDialog, DeleteCommitteeButton, RemoveMemberButton } from "../committee-forms";

export const metadata: Metadata = { title: "Committee" };

const POSITION_ORDER = ["Chair", "Co-chair", "Coordinator", "Treasurer", "Secretary", "Volunteer Lead", "Member"];

export default async function CommitteePage(props: PageProps<"/admin/committees/[id]">) {
  const user = await requirePermission("committees.view");
  const { id } = await props.params;
  const manage = can(user, "committees.manage");

  const c = await db.committee.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      departmentId: true,
      termStart: true,
      termEnd: true,
      isActive: true,
      department: { select: { name: true } },
      chair: { select: { id: true, name: true, email: true } },
      members: { select: { position: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!c) notFound();

  const [departments, history] = await Promise.all([
    manage ? db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    can(user, "audit.view")
      ? db.auditLog.findMany({
          where: { entityType: "Committee", entityId: id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, summary: true, actorName: true, createdAt: true },
        })
      : null,
  ]);

  const members = [...c.members].sort(
    (a, b) =>
      (POSITION_ORDER.indexOf(a.position) + 1 || 99) - (POSITION_ORDER.indexOf(b.position) + 1 || 99) ||
      a.user.name.localeCompare(b.user.name),
  );

  return (
    <>
      <PageHeader
        back={{ href: "/admin/committees", label: "Committees" }}
        title={c.name}
        description={
          <>
            {c.department?.name && `${c.department.name} · `}
            {fmtDate(c.termStart)} – {c.termEnd ? fmtDate(c.termEnd) : "ongoing"} · {c.isActive ? "Active" : "Past"}
          </>
        }
        actions={
          manage && (
            <>
              <CommitteeDialog
                departments={departments}
                committee={{
                  id: c.id,
                  name: c.name,
                  description: c.description,
                  departmentId: c.departmentId,
                  chair: c.chair,
                  termStart: toDateInput(c.termStart),
                  termEnd: toDateInput(c.termEnd),
                  isActive: c.isActive,
                }}
              />
              <DeleteCommitteeButton id={c.id} name={c.name} />
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Section title={`Members (${members.length})`} description={c.description ?? undefined}>
          {manage && (
            <div className="mb-4">
              <AddMemberForm committeeId={c.id} />
            </div>
          )}
          {members.length ? (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.user.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 text-sm">
                    {can(user, "users.view") ? (
                      <Link href={`/admin/users/${m.user.id}`} className="font-medium hover:underline">
                        {m.user.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{m.user.name}</span>
                    )}
                    <span className="text-muted-foreground block truncate text-xs">{m.user.email}</span>
                  </div>
                  <span className={m.position === "Chair" ? "text-primary text-sm font-medium" : "text-muted-foreground text-sm"}>
                    {m.position}
                  </span>
                  {manage && m.user.id !== c.chair?.id && <RemoveMemberButton committeeId={c.id} userId={m.user.id} name={m.user.name} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No members yet.</p>
          )}
        </Section>

        {history && (
          <Section title="History">
            {history.length ? (
              <ol className="grid gap-3 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <p>{h.summary}</p>
                    <p className="text-muted-foreground text-xs">
                      {h.actorName} · {fmtDateTime(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">No changes recorded yet.</p>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
