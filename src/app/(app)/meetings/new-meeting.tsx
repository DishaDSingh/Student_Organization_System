"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { meetingSchema } from "@/lib/validation/schemas";
import { createMeeting } from "./actions";

type Values = z.input<typeof meetingSchema>;

export function NewMeetingDialog({ committees, today }: { committees: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(meetingSchema),
    mode: "onTouched",
    defaultValues: { title: "", heldAt: `${today}T17:00`, committeeId: "", notes: "" },
  });
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Add meeting notes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) =>
            startTransition(async () => {
              const res = await createMeeting(v);
              if (!res.ok) {
                applyServerErrors(res.fieldErrors, form.setError);
                return void toast.error(res.error);
              }
              toast.success(res.message);
              router.push(`/meetings/${res.data.id}`);
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Add meeting notes</DialogTitle>
            <DialogDescription>
              Paste typed notes, a chat export or a transcript. You&apos;ll review everything before tasks are made.
            </DialogDescription>
          </DialogHeader>
          <Field id="m-title" label="Meeting" required error={e.title?.message}>
            <Input placeholder="Diwali Gala planning" {...form.register("title")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="m-when" label="When" required error={e.heldAt?.message}>
              <Input type="datetime-local" {...form.register("heldAt")} />
            </Field>
            <Field id="m-committee" label="Committee">
              <NativeSelect {...form.register("committeeId")}>
                <option value="">None</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field
            id="m-notes"
            label="Notes or transcript"
            required
            error={e.notes?.message}
            hint="Tip: “Decided: …”, “Action: @Priya … by Friday” and “?” help the offline reader."
          >
            <Textarea rows={9} {...form.register("notes")} />
          </Field>
          <label className="text-primary inline-flex cursor-pointer items-center gap-1.5 justify-self-start text-sm hover:underline">
            <UploadIcon className="size-4" /> Load a .txt transcript
            <input
              type="file"
              accept=".txt,.md,.vtt,.srt,text/plain"
              className="sr-only"
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                if (!f) return;
                if (f.size > 500_000) return void toast.error("That file is too large (max 500 KB).");
                // Subtitle formats: drop cue numbers and timing lines.
                const text = (await f.text())
                  .split(/\r?\n/)
                  .filter((l) => !/^\d+$/.test(l.trim()) && !/-->/.test(l) && l.trim() !== "WEBVTT")
                  .join("\n");
                form.setValue("notes", text, { shouldValidate: true });
                if (!form.getValues("title")) form.setValue("title", f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save notes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
