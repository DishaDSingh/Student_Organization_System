import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, HistoryIcon } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, Pagination } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/form/field";
import { fmtDateTime, pageParam, param } from "@/lib/format";
import { auditWhere } from "@/lib/audit-query";

export const metadata: Metadata = { title: "Audit log" };
const PAGE_SIZE = 30;

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  const user = await requirePermission("audit.view");
  const sp = await props.searchParams;
  const page = pageParam(sp.page);
  const where = auditWhere(sp);

  const [logs, total, types] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
  ]);
  const query = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => typeof v === "string" && v && k !== "page") as [string, string][],
  );
  const filtered = query.size > 0;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of every important action: who, what, when, from where, and what changed."
        actions={
          can(user, "audit.export") && (
            <Button variant="outline" asChild>
              <a href={`/api/audit/export?${query}`}>
                <DownloadIcon /> Export CSV
              </a>
            </Button>
          )
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_10rem_10rem_auto]" role="search">
        <Input name="q" defaultValue={param(sp.q)} placeholder="Search actions or people" aria-label="Search audit log" />
        <NativeSelect name="type" defaultValue={param(sp.type) ?? ""} aria-label="Record type">
          <option value="">All records</option>
          {types.map((t) => (
            <option key={t.entityType}>{t.entityType}</option>
          ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={param(sp.from)} aria-label="From date" />
        <Input type="date" name="to" defaultValue={param(sp.to)} aria-label="To date" />
        <div className="flex gap-2">
          {param(sp.entity) && <input type="hidden" name="entity" value={param(sp.entity)} />}
          {param(sp.actor) && <input type="hidden" name="actor" value={param(sp.actor)} />}
          <Button type="submit" variant="secondary" className="flex-1">
            Filter
          </Button>
          {filtered && (
            <Button variant="ghost" asChild>
              <Link href="/admin/audit">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {logs.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No matching activity" />
      ) : (
        <ol className="bg-card divide-y overflow-hidden rounded-xl border">
          {logs.map((l) => {
            const hasDiff = (l.before && Object.keys(l.before).length > 0) || (l.after && Object.keys(l.after).length > 0);
            return (
              <li key={l.id} className="px-4 py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                  <time className="text-muted-foreground shrink-0 text-xs tabular-nums sm:w-36" dateTime={l.createdAt.toISOString()}>
                    {fmtDateTime(l.createdAt)}
                  </time>
                  <div className="min-w-0 flex-1 text-sm">
                    <p>{l.summary}</p>
                    <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      <Link href={`/admin/audit?actor=${l.actorId ?? ""}`} className="hover:underline">
                        {l.actorName}
                      </Link>
                      <span className="font-mono">{l.action}</span>
                      {l.ip && <span>IP {l.ip}</span>}
                    </p>
                    {hasDiff && (
                      <details className="group mt-2">
                        <summary className="text-primary cursor-pointer text-xs select-none">Show changes</summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <DiffBlock label="Before" value={l.before} />
                          <DiffBlock label="After" value={l.after} />
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} searchParams={sp} />
    </>
  );
}

function DiffBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg border p-2">
      <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">{label}</p>
      <pre className="overflow-x-auto font-mono text-xs break-all whitespace-pre-wrap">
        {value && Object.keys(value as object).length ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
