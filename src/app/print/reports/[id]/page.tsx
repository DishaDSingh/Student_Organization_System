import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { fmtDate } from "@/lib/format";
import { REPORT_TYPES, type ReportType, type Section } from "@/lib/reports/types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print report" };

/** A clean, app-shell-free page: use the browser's Print → Save as PDF. */
export default async function PrintReportPage(props: PageProps<"/print/reports/[id]">) {
  await requirePermission("reports.view");
  const { id } = await props.params;
  const [r, org] = await Promise.all([
    db.report.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } }),
    db.organization.findFirst({ select: { name: true } }),
  ]);
  if (!r) notFound();
  const sections = r.sections as Section[];

  return (
    <main className="mx-auto max-w-[46rem] bg-white px-6 py-10 text-[15px] leading-relaxed text-neutral-900 print:px-0 print:py-0">
      <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-neutral-500">Use Print → “Save as PDF” to export.</p>
        <PrintButton />
      </div>
      <p className="text-sm tracking-wide text-neutral-500 uppercase">{org?.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{r.title}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {REPORT_TYPES[r.type as ReportType]?.label}
        {r.periodFrom && r.periodTo && ` · ${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}`} · Prepared by {r.createdBy?.name ?? "—"} ·{" "}
        {fmtDate(r.updatedAt)}
        {r.status !== "FINAL" && " · DRAFT"}
      </p>
      <hr className="my-6 border-neutral-200" />
      {sections.map((s, i) => (
        <section key={i} className="mb-6 break-inside-avoid">
          <h2 className="mb-2 text-lg font-semibold">{s.heading}</h2>
          <Body text={s.body} />
        </section>
      ))}
    </main>
  );
}

/** Lines starting with "- " become a list; everything else is a paragraph. */
function Body({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const list = line.startsWith("- ");
    const last = blocks.at(-1);
    if (!line.trim()) continue;
    if (last && last.list === list) last.lines.push(list ? line.slice(2) : line);
    else blocks.push({ list, lines: [list ? line.slice(2) : line] });
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="mb-2 list-disc space-y-0.5 pl-5">
            {b.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mb-2">
            {b.lines.join(" ")}
          </p>
        ),
      )}
    </>
  );
}
