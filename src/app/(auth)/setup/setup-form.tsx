"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";
import { setupSchema } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";
import { completeSetup } from "../actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ORG_FIELDS = ["org.name", "org.shortName", "org.institution", "org.email", "org.academicYearStart"] as const;

export function SetupForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    mode: "onTouched",
    defaultValues: {
      org: { name: "", shortName: "", institution: "", email: "", academicYearStart: 7 },
      admin: { name: "", email: "", phone: "", password: "", confirmPassword: "" },
    },
  });
  const e = form.formState.errors;

  const next = async () => {
    if (await form.trigger(ORG_FIELDS)) setStep(2);
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(null);
      const res = await completeSetup(values);
      if (!res.ok) return setError(res.error);
      router.replace("/dashboard");
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8">
      <ol className="mb-6 flex gap-2 text-xs font-medium" aria-label="Setup progress">
        {["Organization", "Master Admin"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "flex-1 border-t-2 pt-2",
              step >= i + 1 ? "border-primary text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className={cn("grid gap-4", step !== 1 && "hidden")}>
        <Field id="org-name" label="Organization name" required error={e.org?.name?.message}>
          <Input placeholder="Horizon Student Association" {...form.register("org.name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="org-short" label="Short name" required hint="Shown in the sidebar" error={e.org?.shortName?.message}>
            <Input placeholder="HSA" {...form.register("org.shortName")} />
          </Field>
          <Field id="org-year" label="Academic year starts" error={e.org?.academicYearStart?.message}>
            <NativeSelect {...form.register("org.academicYearStart")}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field id="org-inst" label="Institution" error={e.org?.institution?.message}>
          <Input placeholder="Horizon Institute of Technology" {...form.register("org.institution")} />
        </Field>
        <Field id="org-email" label="Organization email" error={e.org?.email?.message}>
          <Input type="email" placeholder="council@college.edu" {...form.register("org.email")} />
        </Field>
        <Button type="button" size="lg" onClick={next} className="mt-2">
          Continue
        </Button>
      </div>

      <div className={cn("grid gap-4", step !== 2 && "hidden")}>
        <Field id="admin-name" label="Your full name" required error={e.admin?.name?.message}>
          <Input autoComplete="name" {...form.register("admin.name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="admin-email" label="Email" required error={e.admin?.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("admin.email")} />
          </Field>
          <Field id="admin-phone" label="Mobile" error={e.admin?.phone?.message}>
            <Input type="tel" inputMode="tel" placeholder="98200 12345" {...form.register("admin.phone")} />
          </Field>
        </div>
        <Field id="admin-pw" label="Password" required hint="8+ characters with a letter and a number" error={e.admin?.password?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("admin.password")} />
        </Field>
        <Field id="admin-pw2" label="Confirm password" required error={e.admin?.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("admin.confirmPassword")} />
        </Field>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
            <ArrowLeftIcon /> Back
          </Button>
          <Button type="submit" size="lg" disabled={pending} className="flex-1">
            {pending && <Loader2Icon className="animate-spin" />}
            Create organization
          </Button>
        </div>
      </div>
    </form>
  );
}
