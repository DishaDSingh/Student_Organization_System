"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { BellRingIcon, Loader2Icon, RefreshCwIcon, RotateCwIcon, WalletIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { UserPicker, type PickedUser } from "@/components/form/user-picker";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import {
  cancelMembershipSchema,
  confirmPaymentSchema,
  memberProfileSchema,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  registerMemberSchema,
  staffRenewSchema,
} from "@/lib/validation/schemas";
import { TempPasswordDialog } from "../admin/users/user-form";
import {
  cancelMembership,
  confirmPayment,
  registerMember,
  renewMember,
  rotatePass,
  sendRemindersNow,
  updateMemberProfile,
} from "./actions";

export type PlanOption = { id: string; name: string; pricePaise: number; durationMonths: number; description: string | null };

export function PaymentFields({
  register,
  errors,
  method,
}: {
  register: (name: "method" | "reference") => object;
  errors: { method?: { message?: string }; reference?: { message?: string } };
  method: string | undefined;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="method" label="Paid by" required error={errors.method?.message}>
        <NativeSelect {...register("method")}>
          <option value="">Choose…</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="reference"
        label="Transaction reference"
        required={!!method && method !== "CASH"}
        hint={method === "CASH" ? "Not needed for cash" : "UPI UTR / transaction ID"}
        error={errors.reference?.message}
      >
        <Input placeholder={method === "CASH" ? "—" : "e.g. 427813650912"} disabled={method === "CASH"} {...register("reference")} />
      </Field>
    </div>
  );
}

export function PlanPicker({ plans, value, onChange }: { plans: PlanOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Membership plan" className="grid gap-2 sm:grid-cols-2">
      {plans.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            value === p.id ? "border-primary bg-primary/5 ring-primary/30 ring-2" : "hover:bg-muted/40",
          )}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{p.name}</span>
            <span className="font-semibold tabular-nums">{formatINR(p.pricePaise)}</span>
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs">
            {p.durationMonths} months{p.description ? ` · ${p.description}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Register ────────────────────────────────────────────────────────────────

export function RegisterMemberForm({ plans, canCollect }: { plans: PlanOption[]; canCollect: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [person, setPerson] = useState<PickedUser | null>(null);
  const [done, setDone] = useState<{ userId: string; tempPassword: string | null } | null>(null);
  const form = useForm<z.input<typeof registerMemberSchema>>({
    resolver: zodResolver(registerMemberSchema),
    mode: "onTouched",
    defaultValues: {
      existingUserId: "",
      name: "",
      email: "",
      phone: "",
      studentId: "",
      program: "",
      yearOfStudy: "",
      planId: plans[0]?.id ?? "",
      payNow: canCollect,
      method: canCollect ? "UPI" : undefined,
      reference: "",
    },
  });
  const e = form.formState.errors;
  const [planId, payNow, method] = useWatch({ control: form.control, name: ["planId", "payNow", "method"] });
  const plan = plans.find((p) => p.id === planId);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await registerMember(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.data.receipt ? `Registered — receipt ${res.data.receipt}` : "Registered — awaiting payment");
      if (res.data.tempPassword) setDone(res.data);
      else router.push(`/members/${res.data.userId}`);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="grid content-start gap-6">
        <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Who</h2>
            <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm" role="tablist">
              {(["new", "existing"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    form.setValue("existingUserId", m === "existing" ? (person?.id ?? "") : "");
                  }}
                  className={cn("rounded-md px-3 py-1", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                >
                  {m === "new" ? "New person" : "Existing account"}
                </button>
              ))}
            </div>
          </div>

          {mode === "existing" ? (
            <Field id="existing" label="Find their account" required error={e.existingUserId?.message}>
              <UserPicker
                value={person}
                onChange={(u) => {
                  setPerson(u);
                  form.setValue("existingUserId", u?.id ?? "");
                }}
              />
            </Field>
          ) : (
            <>
              <Field id="name" label="Full name" required error={e.name?.message}>
                <Input {...form.register("name")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="email" label="Email" required error={e.email?.message}>
                  <Input type="email" {...form.register("email")} />
                </Field>
                <Field id="phone" label="Mobile" error={e.phone?.message}>
                  <Input type="tel" inputMode="tel" placeholder="98200 12345" {...form.register("phone")} />
                </Field>
              </div>
              <Field id="studentId" label="Roll / enrollment no." error={e.studentId?.message}>
                <Input className="uppercase placeholder:normal-case" placeholder="HIT25CS001" {...form.register("studentId")} />
              </Field>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="program" label="Programme" error={e.program?.message}>
              <Input placeholder="B.Tech Computer Engineering" {...form.register("program")} />
            </Field>
            <Field id="yearOfStudy" label="Year" error={e.yearOfStudy?.message}>
              <NativeSelect {...form.register("yearOfStudy")}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </section>

        <section className="bg-card grid gap-3 rounded-xl border p-4 sm:p-5">
          <h2 className="font-medium">Plan</h2>
          <PlanPicker plans={plans} value={planId} onChange={(id) => form.setValue("planId", id, { shouldValidate: true })} />
          {e.planId?.message && <p className="text-destructive text-xs">{e.planId.message}</p>}
        </section>
      </div>

      <aside className="grid content-start gap-4">
        <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">Dues</h2>
            <span className="text-2xl font-semibold tabular-nums">{plan ? formatINR(plan.pricePaise) : "—"}</span>
          </div>
          <Controller
            control={form.control}
            name="payNow"
            render={({ field }) => (
              <label className={cn("flex items-center justify-between gap-3 text-sm", !canCollect && "opacity-60")}>
                <span>
                  <span className="font-medium">Collected now</span>
                  <span className="text-muted-foreground block">
                    {canCollect ? "Activates immediately with a receipt" : "You can't record payments; it'll wait for the treasurer"}
                  </span>
                </span>
                <Switch checked={!!field.value} disabled={!canCollect} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          {payNow && <PaymentFields register={form.register as never} errors={e} method={method} />}
        </section>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {payNow ? "Register & record payment" : "Register (payment pending)"}
        </Button>
      </aside>

      <TempPasswordDialog
        password={done?.tempPassword ?? null}
        title="Member registered"
        onClose={() => router.push(`/members/${done!.userId}`)}
      />
    </form>
  );
}

// ─── Profile actions ────────────────────────────────────────────────────────

export function ConfirmPaymentDialog({
  membershipId,
  amountPaise,
  planName,
  claimedReference,
}: {
  membershipId: string;
  amountPaise: number;
  planName: string;
  claimedReference: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof confirmPaymentSchema>>({
    resolver: zodResolver(confirmPaymentSchema),
    mode: "onTouched",
    defaultValues: { membershipId, method: claimedReference ? "UPI" : "CASH", reference: claimedReference ?? "", notes: "" },
  });
  const method = useWatch({ control: form.control, name: "method" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await confirmPayment(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <WalletIcon /> Confirm payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Confirm {formatINR(amountPaise)} received</DialogTitle>
            <DialogDescription>
              Activates the {planName} membership and issues a receipt.
              {claimedReference && " The member submitted the reference below — check it against your UPI/bank statement first."}
            </DialogDescription>
          </DialogHeader>
          <PaymentFields register={form.register as never} errors={form.formState.errors} method={method} />
          <Field id="notes" label="Notes" error={form.formState.errors.notes?.message}>
            <Textarea rows={2} {...form.register("notes")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Confirm & activate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenewDialog({ userId, plans, defaultPlanId }: { userId: string; plans: PlanOption[]; defaultPlanId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof staffRenewSchema>>({
    resolver: zodResolver(staffRenewSchema),
    mode: "onTouched",
    defaultValues: { userId, planId: defaultPlanId ?? plans[0]?.id, method: "UPI", reference: "" },
  });
  const [planId, method] = useWatch({ control: form.control, name: ["planId", "method"] });
  const plan = plans.find((p) => p.id === planId);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await renewMember(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCwIcon /> Renew
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Renew membership</DialogTitle>
            <DialogDescription>The new term starts the day after the current one ends, so no days are lost.</DialogDescription>
          </DialogHeader>
          <PlanPicker plans={plans} value={planId} onChange={(id) => form.setValue("planId", id)} />
          <PaymentFields register={form.register as never} errors={form.formState.errors} method={method} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Record {plan ? formatINR(plan.pricePaise) : ""} & renew
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelMembershipDialog({ membershipId, label }: { membershipId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof cancelMembershipSchema>>({
    resolver: zodResolver(cancelMembershipSchema),
    mode: "onTouched",
    defaultValues: { membershipId, reason: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await cancelMembership(values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <XCircleIcon /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{label}?</DialogTitle>
            <DialogDescription>
              The term stays in their history marked as cancelled. Refunds, if any, are handled by the treasurer.
            </DialogDescription>
          </DialogHeader>
          <Field id="reason" label="Reason" required error={form.formState.errors.reason?.message}>
            <Input placeholder="e.g. Duplicate registration" {...form.register("reason")} />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberProfileForm({
  userId,
  program,
  yearOfStudy,
  editable,
}: {
  userId: string;
  program: string | null;
  yearOfStudy: number | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof memberProfileSchema>>({
    resolver: zodResolver(memberProfileSchema),
    mode: "onTouched",
    defaultValues: { userId, program: program ?? "", yearOfStudy: yearOfStudy ?? "" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await updateMemberProfile(values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      form.reset(values);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field id="program" label="Programme" error={e.program?.message}>
          <Input {...form.register("program")} />
        </Field>
        <Field id="yearOfStudy" label="Year" error={e.yearOfStudy?.message}>
          <NativeSelect {...form.register("yearOfStudy")}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </fieldset>
      {editable && form.formState.isDirty && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </form>
  );
}

export function RotatePassButton({ userId, self }: { userId: string; self?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <RotateCwIcon /> New QR code
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Issue a new pass QR?</AlertDialogTitle>
          <AlertDialogDescription>
            {self ? "Your" : "Their"} current QR code — including any screenshots of it — will stop working immediately. Use this if a pass
            was shared or a phone was lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const res = await rotatePass({ userId });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message);
                router.refresh();
              })
            }
          >
            Issue new QR
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SendRemindersButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await sendRemindersNow({});
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} Send renewal reminders
    </Button>
  );
}
