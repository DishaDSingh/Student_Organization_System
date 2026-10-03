"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, applyServerErrors } from "@/components/form/field";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await changePassword(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <Field id="currentPassword" label="Current password" error={e.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </Field>
      <Field id="newPassword" label="New password" hint="8+ characters with a letter and a number" error={e.newPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={e.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Change password
        </Button>
      </div>
    </form>
  );
}
