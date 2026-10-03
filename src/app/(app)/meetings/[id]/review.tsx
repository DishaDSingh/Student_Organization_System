"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, PlusIcon, SparklesIcon, WandSparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Section } from "@/components/common";
import { NativeSelect } from "@/components/form/field";
import type { Extracted } from "@/lib/meetings/extract";
import { confirmMeeting, extractFromMeeting } from "../actions";

export function ExtractButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await extractFromMeeting({ meetingId });
          if (!res.ok) return void toast.error(res.error);
          if (res.data.notice) toast.info(res.data.notice);
          toast.success(res.message);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
      {pending ? "Reading the notes…" : "Find decisions & action items"}
    </Button>
  );
}

type Action = { task: string; owner: string | null; ownerId?: string | null; due: string | null; create: boolean };

/** Human review: everything is editable, nothing is created until "Confirm". */
export function ReviewForm({
  meetingId,
  initial,
  people,
  source,
}: {
  meetingId: string;
  initial: Extracted & { actions: (Extracted["actions"][number] & { ownerId?: string | null })[] };
  people: { id: string; name: string }[];
  source: string | null;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial.summary);
  const [decisions, setDecisions] = useState(initial.decisions);
  const [questions, setQuestions] = useState(initial.questions);
  const [actions, setActions] = useState<Action[]>(initial.actions.map((a) => ({ ...a, create: true })));
  const [pending, startTransition] = useTransition();
  const chosen = actions.filter((a) => a.create).length;

  const setAction = (i: number, patch: Partial<Action>) => setActions((l) => l.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
        {source === "ai" && <SparklesIcon className="text-primary size-4" />}
        {source === "ai" ? "AI read the notes." : "Read offline from the notes."} Check and edit everything below — nothing is created until
        you confirm.
      </p>

      <Section title="Summary">
        <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Summary" />
      </Section>

      <Section
        title={`Action items (${chosen} selected)`}
        description="Ticked items become tasks. Owners and dates are suggestions — change them if needed."
      >
        {actions.length === 0 && <p className="text-muted-foreground mb-3 text-sm">No action items were found.</p>}
        <ul className="grid gap-3">
          {actions.map((a, i) => (
            <li key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr]">
              <Checkbox
                checked={a.create}
                onCheckedChange={(c) => setAction(i, { create: c === true })}
                aria-label={`Create task: ${a.task}`}
                className="mt-2"
              />
              <div className="grid gap-2">
                <Input value={a.task} onChange={(e) => setAction(i, { task: e.target.value })} aria-label="Task" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <NativeSelect
                    value={a.ownerId ?? ""}
                    onChange={(e) => setAction(i, { ownerId: e.target.value || null })}
                    aria-label="Owner"
                  >
                    <option value="">{a.owner ? `Unassigned (notes say “${a.owner}”)` : "Unassigned"}</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    type="date"
                    value={a.due ?? ""}
                    onChange={(e) => setAction(i, { due: e.target.value || null })}
                    aria-label="Due date"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setActions((l) => [...l, { task: "", owner: null, ownerId: null, due: null, create: true }])}
        >
          <PlusIcon /> Add action item
        </Button>
      </Section>

      <EditableList title="Decisions" hint="Saved to organization memory when you confirm." items={decisions} onChange={setDecisions} />
      <EditableList title="Open questions" items={questions} onChange={setQuestions} />

      <div className="bg-background sticky bottom-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
        <p className="text-muted-foreground mr-auto text-sm">
          Will create {chosen} task{chosen === 1 ? "" : "s"} and save {decisions.filter(Boolean).length} decision
          {decisions.length === 1 ? "" : "s"}.
        </p>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await confirmMeeting({
                meetingId,
                summary,
                decisions: decisions.map((d) => d.trim()).filter(Boolean),
                questions: questions.map((q) => q.trim()).filter(Boolean),
                actions: actions
                  .filter((a) => a.task.trim())
                  .map((a) => ({ task: a.task, ownerId: a.ownerId ?? "", due: a.due ?? "", create: a.create })),
              });
              if (!res.ok) return void toast.error(res.fieldErrors ? "Each ticked task needs a short description." : res.error);
              toast.success(res.message);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Confirm
        </Button>
      </div>
    </div>
  );
}

function EditableList({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint?: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Section title={title} description={hint}>
      <ul className="grid gap-2">
        {items.map((d, i) => (
          <li key={i} className="flex gap-2">
            <Input
              value={d}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`${title} ${i + 1}`}
            />
            <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <XIcon />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...items, ""])}>
        <PlusIcon /> Add
      </Button>
    </Section>
  );
}
