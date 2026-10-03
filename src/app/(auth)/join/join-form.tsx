"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { joinSchema } from "@/lib/validation/schemas";
import { join } from "./actions";

type Plan = { id: string; name: string; pricePaise: number; durationMonths: number };

export function JoinForm({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      studentId: "",
      program: "",
      yearOfStudy: "",
      planId: plans[0]?.id ?? "",
      reference: "",
      password: "",
      confirmPassword: "",
      website: "",
    },
  });
  const e = form.formState.errors;
  const planId = useWatch({ control: form.control, name: "planId" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(null);
      const res = await join(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return setError(res.error);
      }
      router.replace("/me");
      router.refresh();
    }),
  );

  if (!plans.length) return <p className="text-muted-foreground mt-6 text-sm">No membership plans are open right now.</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4">
      {error && (
        <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={planId === p.id}
            onClick={() => form.setValue("planId", p.id)}
            className={cn(
              "rounded-lg border p-2.5 text-left",
              planId === p.id ? "border-primary bg-primary/5 ring-primary/30 ring-2" : "hover:bg-muted/40",
            )}
          >
            <span className="block text-sm font-medium">{p.name}</span>
            <span className="block font-semibold tabular-nums">{formatINR(p.pricePaise)}</span>
            <span className="text-muted-foreground text-xs">{p.durationMonths} months</span>
          </button>
        ))}
      </div>

      <Field id="name" label="Full name" required error={e.name?.message}>
        <Input autoComplete="name" {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label="College email" required error={e.email?.message}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </Field>
        <Field id="phone" label="Mobile" required error={e.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="98200 12345" {...form.register("phone")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_6rem]">
        <Field id="studentId" label="Roll no." required error={e.studentId?.message}>
          <Input className="uppercase placeholder:normal-case" placeholder="HIT25CS001" {...form.register("studentId")} />
        </Field>
        <Field id="program" label="Programme" error={e.program?.message}>
          <Input placeholder="B.Tech CE" {...form.register("program")} />
        </Field>
        <Field id="yearOfStudy" label="Year" error={e.yearOfStudy?.message}>
          <NativeSelect {...form.register("yearOfStudy")}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="password" label="Password" required hint="8+ characters with a letter and a number" error={e.password?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field id="confirmPassword" label="Confirm password" required error={e.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </Field>
      </div>
      <Field id="reference" label="Already paid by UPI? Transaction ID" hint="Optional — you can add it later" error={e.reference?.message}>
        <Input placeholder="e.g. 427813650912" {...form.register("reference")} />
      </Field>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" {...form.register("website")} />
        </label>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending && <Loader2Icon className="animate-spin" />}
        Create account & request membership
      </Button>
    </form>
  );
}
