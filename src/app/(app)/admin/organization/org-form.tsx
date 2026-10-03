"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { organizationSchema } from "@/lib/validation/schemas";
import { updateOrganization } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Org = z.input<typeof organizationSchema>;

export function OrganizationForm({ org, editable }: { org: Org; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<Org>({ resolver: zodResolver(organizationSchema), mode: "onTouched", defaultValues: org });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await updateOrganization(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      form.reset(values);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <fieldset disabled={!editable} className="grid gap-6 lg:grid-cols-2">
        <div className="bg-card grid content-start gap-4 rounded-xl border p-4 sm:p-5">
          <h2 className="font-medium">Identity</h2>
          <Field id="name" label="Organization name" required error={e.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="shortName" label="Short name" required error={e.shortName?.message}>
              <Input {...form.register("shortName")} />
            </Field>
            <Field id="academicYearStart" label="Academic year starts" error={e.academicYearStart?.message}>
              <NativeSelect {...form.register("academicYearStart")}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field id="institution" label="Institution" error={e.institution?.message}>
            <Input {...form.register("institution")} />
          </Field>
          <Field id="description" label="About" error={e.description?.message}>
            <Textarea rows={3} {...form.register("description")} />
          </Field>
        </div>
        <div className="bg-card grid content-start gap-4 rounded-xl border p-4 sm:p-5">
          <h2 className="font-medium">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email" error={e.email?.message}>
              <Input type="email" {...form.register("email")} />
            </Field>
            <Field id="phone" label="Phone" error={e.phone?.message}>
              <Input type="tel" {...form.register("phone")} />
            </Field>
          </div>
          <Field id="website" label="Website" error={e.website?.message}>
            <Input type="url" placeholder="https://" {...form.register("website")} />
          </Field>
          <Field id="address" label="Address" error={e.address?.message}>
            <Textarea rows={3} {...form.register("address")} />
          </Field>
        </div>
      </fieldset>
      {editable && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save settings
          </Button>
        </div>
      )}
    </form>
  );
}
