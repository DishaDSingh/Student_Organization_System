"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { CopyIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { RoleBadge } from "@/components/common";
import { createUserSchema, updateUserSchema } from "@/lib/validation/schemas";
import { createUser, updateUser } from "./actions";

type Option = { id: string; name: string };
type RoleOption = Option & { color: string; description: string | null; grantable: boolean };

export function CreateUserForm({ departments, roles }: { departments: Option[]; roles: RoleOption[] | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ id: string; tempPassword: string } | null>(null);
  const general = roles?.find((r) => r.name === "General Member");
  const form = useForm<z.input<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", studentId: "", departmentId: "", roleIds: general ? [general.id] : [] },
  });
  const e = form.formState.errors;
  const selected = useWatch({ control: form.control, name: "roleIds" }) ?? [];

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await createUser(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        toast.error(res.error);
        return;
      }
      setCreated(res.data);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="bg-card grid content-start gap-4 rounded-xl border p-4 sm:p-5">
        <h2 className="font-medium">Profile</h2>
        <ProfileFields form={form} errors={e} departments={departments} />
      </div>

      <div className="grid content-start gap-4">
        {roles && (
          <fieldset className="bg-card rounded-xl border p-4 sm:p-5">
            <legend className="sr-only">Roles</legend>
            <h2 className="font-medium">Roles</h2>
            <p className="text-muted-foreground mt-0.5 mb-3 text-sm">You can only assign roles whose permissions you hold.</p>
            <ul className="grid gap-2">
              {roles.map((r) => (
                <li key={r.id}>
                  <label className="flex items-start gap-2.5 text-sm has-disabled:opacity-50">
                    <Checkbox
                      className="mt-0.5"
                      disabled={!r.grantable}
                      checked={selected.includes(r.id)}
                      onCheckedChange={(c) =>
                        form.setValue("roleIds", c ? [...selected, r.id] : selected.filter((x) => x !== r.id), { shouldDirty: true })
                      }
                    />
                    <span>
                      <RoleBadge name={r.name} color={r.color} />
                      {r.description && <span className="text-muted-foreground mt-0.5 block text-xs">{r.description}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="bg-muted/40 text-muted-foreground rounded-xl border p-4 text-sm">
          The account starts as <span className="text-foreground font-medium">Invited</span> with a temporary password you share with the
          person. It becomes Active on first sign-in.
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Create account
        </Button>
      </div>

      <TempPasswordDialog
        password={created?.tempPassword ?? null}
        title="Account created"
        onClose={() => router.push(`/admin/users/${created!.id}`)}
      />
    </form>
  );
}

export function EditProfileForm({
  user,
  departments,
  disabled,
}: {
  user: { id: string; name: string; email: string; phone: string | null; studentId: string | null; departmentId: string | null };
  departments: Option[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof updateUserSchema>>({
    resolver: zodResolver(updateUserSchema),
    mode: "onTouched",
    defaultValues: {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone?.replace(/^\+91/, "") ?? "",
      studentId: user.studentId ?? "",
      departmentId: user.departmentId ?? "",
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await updateUser(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      form.reset(values);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset disabled={disabled} className="grid gap-4">
        <ProfileFields form={form} errors={form.formState.errors} departments={departments} />
      </fieldset>
      {!disabled && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save profile
          </Button>
        </div>
      )}
    </form>
  );
}

type ProfileShape = { name?: unknown; email?: unknown; phone?: unknown; studentId?: unknown; departmentId?: unknown };

function ProfileFields({
  form,
  errors,
  departments,
}: {
  // Both create and edit forms share these five fields.
  form: { register: (name: "name" | "email" | "phone" | "studentId" | "departmentId") => object };
  errors: Partial<Record<keyof ProfileShape, { message?: string }>>;
  departments: Option[];
}) {
  return (
    <>
      <Field id="name" label="Full name" required error={errors.name?.message}>
        <Input autoComplete="off" {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label="Email" required error={errors.email?.message}>
          <Input type="email" autoComplete="off" {...form.register("email")} />
        </Field>
        <Field id="phone" label="Mobile" error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" placeholder="98200 12345" {...form.register("phone")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="studentId" label="Roll / enrollment no." error={errors.studentId?.message}>
          <Input placeholder="HIT24CS001" className="uppercase placeholder:normal-case" {...form.register("studentId")} />
        </Field>
        <Field id="departmentId" label="Department" error={errors.departmentId?.message}>
          <NativeSelect {...form.register("departmentId")}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </>
  );
}

/** Shows a generated password exactly once. It is never stored in plain text. */
export function TempPasswordDialog({ password, title, onClose }: { password: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={!!password} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Share this temporary password privately. It won&apos;t be shown again — the person should change it after signing in.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/50 flex items-center gap-2 rounded-lg border p-3 font-mono text-lg tracking-wide">
          <span className="flex-1 select-all">{password}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Copy password"
            onClick={() => {
              navigator.clipboard.writeText(password ?? "");
              toast.success("Copied");
            }}
          >
            <CopyIcon />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
