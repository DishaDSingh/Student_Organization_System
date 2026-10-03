import type { Metadata } from "next";
import Link from "next/link";
import { UsersRoundIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader } from "@/components/common";
import { fmtDate, param } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommitteeDialog } from "./committee-forms";

export const metadata: Metadata = { title: "Committees" };

export default async function CommitteesPage(props: PageProps<"/admin/committees">) {
  const user = await requirePermission("committees.view");
  const show = param((await props.searchParams).show) === "past" ? "past" : "active";

  const [committees, counts, departments] = await Promise.all([
    db.committee.findMany({
      where: { isActive: show === "active" },
      orderBy: [{ termStart: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        termStart: true,
        termEnd: true,
        department: { select: { name: true } },
        chair: { select: { name: true } },
        _count: { select: { members: true } },
      },
    }),
    db.committee.groupBy({ by: ["isActive"], _count: true }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const count = (active: boolean) => counts.find((c) => c.isActive === active)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Committees"
        description="Term-bound working groups. Past committees are kept so the next team can learn from them."
        actions={can(user, "committees.manage") && <CommitteeDialog departments={departments} />}
      />

      <nav className="mb-4 flex gap-1 border-b" aria-label="Committee filter">
        {(["active", "past"] as const).map((s) => (
          <Link
            key={s}
            href={s === "active" ? "/admin/committees" : "/admin/committees?show=past"}
            aria-current={show === s ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              show === s ? "border-primary text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {s === "active" ? "Active" : "Past"} <span className="text-muted-foreground tabular-nums">{count(s === "active")}</span>
          </Link>
        ))}
      </nav>

      {committees.length === 0 ? (
        <EmptyState icon={UsersRoundIcon} title={show === "active" ? "No active committees" : "No past committees"} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {committees.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/committees/${c.id}`}
                className="bg-card hover:border-primary/40 flex h-full flex-col rounded-xl border p-4 transition-colors"
              >
                <p className="font-medium">{c.name}</p>
                {c.description && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{c.description}</p>}
                <dl className="mt-auto grid grid-cols-3 gap-2 pt-4 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Chair</dt>
                    <dd className="truncate">{c.chair?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Members</dt>
                    <dd className="tabular-nums">{c._count.members}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Term ends</dt>
                    <dd>{fmtDate(c.termEnd)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
