"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, applyServerErrors } from "@/components/form/field";
import { benefitSchema, planSchema } from "@/lib/validation/schemas";
import { saveBenefit, savePlan } from "./actions";

type Benefit = { id: string; title: string; description: string | null; isActive: boolean };
type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMonths: number;
  pricePaise: number;
  isActive: boolean;
  benefitIds: string[];
};

function ActiveSwitch({ control, label, hint }: { control: never; label: string; hint: string }) {
  return (
    <Controller
      control={control}
      name={"isActive" as never}
      render={({ field }) => (
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground block">{hint}</span>
          </span>
          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
        </label>
      )}
    />
  );
}

export function PlanDialog({ plan, benefits }: { plan?: Plan; benefits: Benefit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    mode: "onTouched",
    defaultValues: {
      planId: plan?.id ?? "",
      code: plan?.code ?? "",
      name: plan?.name ?? "",
      description: plan?.description ?? "",
      durationMonths: plan?.durationMonths ?? 12,
      priceRupees: plan ? plan.pricePaise / 100 : "",
      isActive: plan?.isActive ?? true,
      benefitIds: plan?.benefitIds ?? [],
    },
  });
  const e = form.formState.errors;
  const selected = useWatch({ control: form.control, name: "benefitIds" }) ?? [];

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await savePlan(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!plan) form.reset();
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {plan ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${plan.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon /> New plan
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{plan ? `Edit ${plan.name}` : "New membership plan"}</DialogTitle>
            <DialogDescription>Price changes apply to new joins and renewals; existing members keep what they paid.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="plan-name" label="Name" required error={e.name?.message}>
              <Input placeholder="Annual" {...form.register("name")} />
            </Field>
            <Field id="plan-code" label="Code" required error={e.code?.message}>
              <Input placeholder="ANNUAL" className="uppercase" {...form.register("code")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="plan-price" label="Price (₹)" required error={e.priceRupees?.message}>
              <Input type="number" inputMode="decimal" step="0.01" min="0" {...form.register("priceRupees")} />
            </Field>
            <Field id="plan-months" label="Duration (months)" required error={e.durationMonths?.message}>
              <Input type="number" inputMode="numeric" min="1" max="60" {...form.register("durationMonths")} />
            </Field>
          </div>
          <Field id="plan-desc" label="Description" error={e.description?.message}>
            <Textarea rows={2} {...form.register("description")} />
          </Field>
          {benefits.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Benefits included</legend>
              {benefits.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(b.id)}
                    onCheckedChange={(c) =>
                      form.setValue("benefitIds", c ? [...selected, b.id] : selected.filter((x) => x !== b.id), { shouldDirty: true })
                    }
                  />
                  {b.title}
                  {!b.isActive && <span className="text-muted-foreground text-xs">(inactive)</span>}
                </label>
              ))}
            </fieldset>
          )}
          <ActiveSwitch
            control={form.control as never}
            label="Available"
            hint="Inactive plans can't be chosen for new joins or renewals."
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {plan ? "Save plan" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BenefitDialog({ benefit }: { benefit?: Benefit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof benefitSchema>>({
    resolver: zodResolver(benefitSchema),
    mode: "onTouched",
    defaultValues: {
      benefitId: benefit?.id ?? "",
      title: benefit?.title ?? "",
      description: benefit?.description ?? "",
      isActive: benefit?.isActive ?? true,
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveBenefit(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!benefit) form.reset();
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {benefit ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${benefit.title}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon /> Add benefit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{benefit ? "Edit benefit" : "New benefit"}</DialogTitle>
            <DialogDescription>Benefits show on members&apos; digital passes for the plans that include them.</DialogDescription>
          </DialogHeader>
          <Field id="b-title" label="Title" required error={e.title?.message}>
            <Input placeholder="20% off event tickets" {...form.register("title")} />
          </Field>
          <Field id="b-desc" label="Details" error={e.description?.message}>
            <Textarea rows={2} {...form.register("description")} />
          </Field>
          <ActiveSwitch control={form.control as never} label="Active" hint="Inactive benefits are hidden from passes." />
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
