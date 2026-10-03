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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { MEMORY_KINDS, MEMORY_KIND_KEYS } from "@/lib/memory/rank";
import { memoryItemSchema } from "@/lib/validation/schemas";
import { addMemory } from "./actions";

type Values = z.input<typeof memoryItemSchema>;

export function AddMemoryDialog({ events }: { events: { id: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(memoryItemSchema),
    mode: "onTouched",
    defaultValues: { kind: "LESSON", title: "", body: "", tags: "", happenedAt: "", eventId: "", url: "" },
  });
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Add to memory
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) =>
            startTransition(async () => {
              const res = await addMemory(v);
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
            <DialogTitle>Add to organization memory</DialogTitle>
            <DialogDescription>Something the next committee should know.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="mm-kind" label="Type">
              <NativeSelect {...form.register("kind")}>
                {MEMORY_KIND_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {MEMORY_KINDS[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="mm-date" label="When" error={e.happenedAt?.message}>
              <Input type="date" {...form.register("happenedAt")} />
            </Field>
          </div>
          <Field id="mm-title" label="Title" required error={e.title?.message}>
            <Input placeholder="Book the sound vendor 6 weeks ahead" {...form.register("title")} />
          </Field>
          <Field id="mm-body" label="Details" required error={e.body?.message}>
            <Textarea rows={4} {...form.register("body")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="mm-event" label="Related event">
              <NativeSelect {...form.register("eventId")}>
                <option value="">None</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="mm-tags" label="Tags" hint="Comma separated" error={e.tags?.message}>
              <Input placeholder="gala, sound, vendor" {...form.register("tags")} />
            </Field>
          </div>
          <Field id="mm-url" label="Link (document, folder…)" error={e.url?.message}>
            <Input type="url" placeholder="https://" {...form.register("url")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
