"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, DownloadIcon, Loader2Icon, PlusIcon, PrinterIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Section } from "@/lib/reports/types";
import { saveReport } from "../actions";

type Report = { id: string; title: string; status: "DRAFT" | "FINAL"; source: string; sections: Section[] };

/** Every section is a plain text box — what you see is what gets saved and exported. */
export function ReportEditor({ report, canEdit, canExport }: { report: Report; canEdit: boolean; canExport: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(report.title);
  const [sections, setSections] = useState(report.sections);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const needsInput = sections.filter((s) => s.body.startsWith("(Add")).length;

  const update = (i: number, patch: Partial<Section>) => {
    setSections((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const save = (status: "DRAFT" | "FINAL") =>
    startTransition(async () => {
      const res = await saveReport({ reportId: report.id, title, sections, status });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setDirty(false);
      router.refresh();
    });

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {report.source === "ai" && (
          <p className="text-primary mr-auto flex items-center gap-1.5 text-sm">
            <SparklesIcon className="size-4" /> AI-written draft from live data — please check before sharing.
          </p>
        )}
        <Button variant="outline" size="sm" asChild>
          <a href={`/print/reports/${report.id}`} target="_blank" rel="noreferrer">
            <PrinterIcon /> Print / PDF
          </a>
        </Button>
        {canExport && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/reports/${report.id}/export`}>
              <DownloadIcon /> Download
            </a>
          </Button>
        )}
      </div>

      {needsInput > 0 && canEdit && (
        <p className="bg-warning/10 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {needsInput === 1 ? "1 section needs" : `${needsInput} sections need`} your input — look for “(Add …)”.
        </p>
      )}

      <div className="bg-card grid gap-5 rounded-xl border p-4 sm:p-6">
        {canEdit ? (
          <Input
            value={title}
            onChange={(e) => (setTitle(e.target.value), setDirty(true))}
            aria-label="Report title"
            className="text-lg font-semibold"
          />
        ) : (
          <h2 className="text-lg font-semibold">{title}</h2>
        )}
        {sections.map((s, i) => (
          <section key={i} className="grid gap-1.5">
            {canEdit ? (
              <div className="flex items-center gap-2">
                <Input
                  value={s.heading}
                  onChange={(e) => update(i, { heading: e.target.value })}
                  aria-label="Section heading"
                  className="font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove section ${s.heading}`}
                  onClick={() => {
                    setSections((list) => list.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ) : (
              <h3 className="font-medium">{s.heading}</h3>
            )}
            {canEdit ? (
              <Textarea
                value={s.body}
                onChange={(e) => update(i, { body: e.target.value })}
                rows={Math.min(14, Math.max(3, s.body.split("\n").length + 1))}
                aria-label={`${s.heading} text`}
                className={s.body.startsWith("(Add") ? "border-warning" : undefined}
              />
            ) : (
              <p className="text-sm whitespace-pre-line">{s.body}</p>
            )}
          </section>
        ))}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => {
              setSections((list) => [...list, { heading: "New section", body: "" }]);
              setDirty(true);
            }}
          >
            <PlusIcon /> Add section
          </Button>
        )}
      </div>

      {canEdit && (
        <div className="bg-background sticky bottom-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
          <p className="text-muted-foreground mr-auto text-sm">
            {dirty ? "Unsaved changes" : report.status === "FINAL" ? "Final version" : "Draft"}
          </p>
          <Button variant="outline" disabled={pending || !dirty} onClick={() => save(report.status)}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
          {report.status !== "FINAL" && (
            <Button disabled={pending} onClick={() => save("FINAL")}>
              <CheckIcon /> Save as final
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
