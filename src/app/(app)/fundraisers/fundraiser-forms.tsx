"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { HandCoinsIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { Suggestions } from "@/components/volunteers/suggestions";
import { FUNDRAISER_CAUSES, SKILLS } from "@/lib/volunteers/rules";
import { donationSchema, fundraiserSchema } from "@/lib/validation/schemas";
import { PaymentFields } from "../members/member-forms";
import { assignTask, recordDonation, saveFundraiser, saveTask, setTaskStatus, suggestForTask } from "./actions";

// ─── Fundraiser ──────────────────────────────────────────────────────────────

export function FundraiserForm({ defaults }: { defaults: z.input<typeof fundraiserSchema> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof fundraiserSchema>>({
    resolver: zodResolver(fundraiserSchema),
    mode: "onTouched",
    defaultValues: defaults,
  });
  const e = form.formState.errors;

  return (
    <form
      noValidate
      className="bg-card grid max-w-xl gap-4 rounded-xl border p-4 sm:p-6"
      onSubmit={form.handleSubmit((v) =>
        startTransition(async () => {
          const res = await saveFundraiser(v);
          if (!res.ok) {
            applyServerErrors(res.fieldErrors, form.setError);
            return void toast.error(res.error);
          }
          toast.success(res.message);
          router.push(`/fundraisers/${res.data.id}`);
        }),
      )}
    >
      <Field id="title" label="Name" required error={e.title?.message}>
        <Input placeholder="Charity Bake Sale" {...form.register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="goalRupees" label="Goal (₹)" required error={e.goalRupees?.message}>
          <Input type="number" inputMode="numeric" min={500} step={500} {...form.register("goalRupees")} />
        </Field>
        <Field id="cause" label="Cause">
          <NativeSelect {...form.register("cause")}>
            {FUNDRAISER_CAUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="startsAt" label="Starts" required error={e.startsAt?.message}>
          <Input type="date" {...form.register("startsAt")} />
        </Field>
        <Field id="endsAt" label="Ends" required error={e.endsAt?.message}>
          <Input type="date" {...form.register("endsAt")} />
        </Field>
      </div>
      <Field id="description" label="What's it for?" error={e.description?.message}>
        <Textarea rows={3} {...form.register("description")} />
      </Field>
      {!!defaults.fundraiserId && (
        <Field id="status" label="Status">
          <NativeSelect {...form.register("status")}>
            <option value="PLANNING">Planning</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </NativeSelect>
        </Field>
      )}
      <Button type="submit" size="lg" disabled={pending} className="justify-self-start">
        {pending && <Loader2Icon className="animate-spin" />}
        {defaults.fundraiserId ? "Save" : "Create fundraiser"}
      </Button>
    </form>
  );
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

/** One-line "add a task" form: what, (optional) skill, due date. */
export function QuickAddTask({ fundraiserId }: { fundraiserId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [skill, setSkill] = useState("");
  const [due, setDue] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_11rem_10rem_auto]"
      onSubmit={(ev) => {
        ev.preventDefault();
        startTransition(async () => {
          const res = await saveTask({
            fundraiserId,
            title,
            requiredSkills: skill ? [skill] : [],
            dueAt: due ? `${due}T18:00` : "",
            priority: "MEDIUM",
            estimatedHours: 2,
          } as never);
          if (!res.ok) return void toast.error(res.fieldErrors?.title?.[0] ?? res.error);
          setTitle("");
          setSkill("");
          setDue("");
          router.refresh();
        });
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task, e.g. Bake 40 brownies" aria-label="Task" />
      <NativeSelect value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill needed">
        <option value="">Any skill</option>
        {SKILLS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </NativeSelect>
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      <Button type="submit" disabled={pending || title.trim().length < 3}>
        {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
      </Button>
    </form>
  );
}

export function TaskDoneCheckbox({ taskId, done, label }: { taskId: string; done: boolean; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Checkbox
      checked={done}
      disabled={pending}
      aria-label={`Mark "${label}" ${done ? "not done" : "done"}`}
      onCheckedChange={(c) =>
        startTransition(async () => {
          const res = await setTaskStatus({ taskId, status: c ? "DONE" : "TODO" });
          if (!res.ok) return void toast.error(res.error);
          router.refresh();
        })
      }
    />
  );
}

export function SuggestButton({ taskId, title, label = "Suggest someone" }: { taskId: string; title: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const load = useCallback(() => suggestForTask({ taskId }), [taskId]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-primary text-sm hover:underline">
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Who should do “{title}”?</DialogTitle>
          <DialogDescription>Based on skills, free time and how busy people are.</DialogDescription>
        </DialogHeader>
        {open && (
          <Suggestions
            load={load}
            onAssign={async (userId) => {
              const res = await assignTask({ taskId, assigneeId: userId });
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Donations ───────────────────────────────────────────────────────────────

export function DonationDialog({ fundraiserId }: { fundraiserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof donationSchema>>({
    resolver: zodResolver(donationSchema),
    mode: "onTouched",
    defaultValues: {
      fundraiserId,
      memberId: "",
      donorName: "",
      anonymous: false,
      amountRupees: "",
      method: "UPI",
      reference: "",
      note: "",
    },
  });
  const method = useWatch({ control: form.control, name: "method" });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <HandCoinsIcon /> Record donation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) =>
            startTransition(async () => {
              const res = await recordDonation({ ...v, anonymous: !v.donorName });
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
            <DialogTitle>Record a donation</DialogTitle>
            <DialogDescription>A receipt is issued automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="d-amount" label="Amount (₹)" required error={e.amountRupees?.message}>
              <Input type="number" inputMode="decimal" min={1} {...form.register("amountRupees")} />
            </Field>
            <Field id="d-name" label="Donor" hint="Leave empty for anonymous" error={e.donorName?.message}>
              <Input {...form.register("donorName")} />
            </Field>
          </div>
          <PaymentFields register={form.register as never} errors={e} method={method} />
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
