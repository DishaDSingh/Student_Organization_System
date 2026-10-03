"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { aiConfigured } from "@/lib/ai/claude";
import { buildReport } from "@/lib/reports/build";
import { polish } from "@/lib/reports/ai";
import { REPORT_TYPES, cleanSections, type PeriodKey, type ReportType } from "@/lib/reports/types";
import { generateReportSchema, saveReportSchema } from "@/lib/validation/schemas";

export const generateReport = guardedAction({ permission: "reports.generate", schema: generateReportSchema }, async (input, actor) => {
  const type = input.type as ReportType;
  const spec = REPORT_TYPES[type];
  // A report shows an area's data, so you need to be able to see that area.
  if (!actor.permissions.has(spec.needs))
    return fail(`You need access to ${spec.label.toLowerCase().replace(" report", "")} data for this report.`);
  if (type === "EVENT" && !(await db.event.count({ where: { id: input.subjectId } }))) return fail("That event no longer exists.");
  if (type === "FUNDRAISER" && !(await db.fundraiser.count({ where: { id: input.subjectId } })))
    return fail("That fundraiser no longer exists.");

  const built = await buildReport(type, { subjectId: input.subjectId, period: input.period as PeriodKey | undefined });
  const written = input.useAi && aiConfigured() ? await polish(built.title, built.sections) : { sections: built.sections, polished: false };

  const report = await db.$transaction(async (tx) => {
    const r = await tx.report.create({
      data: {
        type,
        title: built.title,
        subjectId: built.subjectId ?? null,
        periodFrom: built.from ?? null,
        periodTo: built.to ?? null,
        sections: written.sections,
        source: written.polished ? "ai" : "template",
        createdById: actor.id,
      },
    });
    await audit(tx, {
      actor,
      action: "report.generate",
      entityType: "Report",
      entityId: r.id,
      summary: `Generated "${r.title}"${written.polished ? " (AI-written draft)" : ""}`,
    });
    return r;
  });
  revalidatePath("/reports");
  return ok({ id: report.id }, written.polished ? "Draft written — check it before sharing" : "Draft ready — edit anything you like");
});

export const saveReport = guardedAction({ permission: "reports.generate", schema: saveReportSchema }, async (input, actor) => {
  const before = await db.report.findUnique({ where: { id: input.reportId }, select: { status: true, title: true } });
  if (!before) return fail("Report not found.");
  const sections = cleanSections(input.sections);
  await db.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: input.reportId },
      data: { title: input.title, sections, status: input.status, updatedById: actor.id },
    });
    await audit(tx, {
      actor,
      action: input.status === "FINAL" && before.status !== "FINAL" ? "report.finalize" : "report.edit",
      entityType: "Report",
      entityId: input.reportId,
      summary: input.status === "FINAL" && before.status !== "FINAL" ? `Marked "${input.title}" as final` : `Edited "${input.title}"`,
      before: { status: before.status },
      after: { status: input.status },
    });
  });
  revalidatePath(`/reports/${input.reportId}`);
  revalidatePath("/reports");
  return ok(undefined, input.status === "FINAL" && before.status !== "FINAL" ? "Marked as final" : "Saved");
});
