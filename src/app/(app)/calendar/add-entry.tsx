"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { calendarEntrySchema } from "@/lib/validation/schemas";
import { addCalendarEntry } from "./actions";

type Values = z.input<typeof calendarEntrySchema>;

export function AddEntryDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(calendarEntrySchema),
    mode: "onTouched",
    defaultValues: { title: "", kind: "DEADLINE", startsAt: "", notes: "", remind: true },
  });
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Add deadline
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) =>
            startTransition(async () => {
              const res = await addCalendarEntry(v);
              if (!res.ok) {
                applyServerErrors(res.fieldErrors, form.setError);
                return void toast.error(res.error);
              }
              toast.success(res.message);
              setOpen(false);
              form.reset();
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Add to calendar</DialogTitle>
            <DialogDescription>Deadlines and reminders notify you a day before.</DialogDescription>
          </DialogHeader>
          <Field id="c-title" label="What" required error={e.title?.message}>
            <Input placeholder="Submit Gala report to the dean" {...form.register("title")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-when" label="When" required error={e.startsAt?.message}>
              <Input type="datetime-local" {...form.register("startsAt")} />
            </Field>
            <Field id="c-kind" label="Type">
              <NativeSelect {...form.register("kind")}>
                <option value="DEADLINE">Deadline</option>
                <option value="REMINDER">Reminder</option>
                <option value="OTHER">Other</option>
              </NativeSelect>
            </Field>
          </div>
          <Field id="c-notes" label="Notes" error={e.notes?.message}>
            <Input {...form.register("notes")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
