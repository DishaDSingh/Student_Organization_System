"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { loginSchema } from "@/lib/validation/schemas";
import { login } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(null);
      const res = await login(values);
      if (!res.ok) return setError(res.error);
      router.replace(next);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-4">
      {error && (
        <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" autoFocus placeholder="you@college.edu" {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending && <Loader2Icon className="animate-spin" />}
        Sign in
      </Button>
      <p className="text-muted-foreground text-xs">Forgot your password? Ask an admin to reset it.</p>
      <p className="border-t pt-4 text-sm">
        New here?{" "}
        <a href="/join" className="text-primary font-medium hover:underline">
          Become a member
        </a>
      </p>
    </form>
  );
}
