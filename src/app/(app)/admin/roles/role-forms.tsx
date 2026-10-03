"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RoleBadge } from "@/components/common";
import { ROLE_COLORS } from "@/lib/rbac/presets";
import { createRoleSchema, updateRoleSchema } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";
import { createRole, deleteRole, setRolePermissions, updateRole } from "./actions";

function ColorPicker({ value, onChange }: { value: string; onChange: (c: (typeof ROLE_COLORS)[number]) => void }) {
  return (
    <div role="radiogroup" aria-label="Badge color" className="flex flex-wrap gap-1.5">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={cn("rounded-md p-0.5 ring-2 ring-transparent", value === c && "ring-ring")}
        >
          <RoleBadge name={c} color={c} />
        </button>
      ))}
    </div>
  );
}

export function CreateRoleDialog({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof createRoleSchema>>({
    resolver: zodResolver(createRoleSchema),
    mode: "onTouched",
    defaultValues: { name: "", description: "", color: "slate", cloneFromId: "" },
  });
  const e = form.formState.errors;
  const color = useWatch({ control: form.control, name: "color" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await createRole(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      router.push(`/admin/roles/${res.data.id}`);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New role
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New custom role</DialogTitle>
            <DialogDescription>Start empty or copy an existing role, then fine-tune its permissions.</DialogDescription>
          </DialogHeader>
          <Field id="role-name" label="Name" required error={e.name?.message}>
            <Input placeholder="e.g. Sponsorship Lead" {...form.register("name")} />
          </Field>
          <Field id="role-desc" label="Description" error={e.description?.message}>
            <Textarea rows={2} placeholder="What is this role responsible for?" {...form.register("description")} />
          </Field>
          <Field id="role-clone" label="Start from" error={e.cloneFromId?.message}>
            <NativeSelect {...form.register("cloneFromId")}>
              <option value="">No permissions (empty role)</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  Copy of {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Badge color</span>
            <ColorPicker value={color} onChange={(c) => form.setValue("color", c)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoleDetailsForm({
  role,
  editable,
}: {
  role: { id: string; name: string; description: string | null; color: string; isSystem: boolean };
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof updateRoleSchema>>({
    resolver: zodResolver(updateRoleSchema),
    mode: "onTouched",
    defaultValues: {
      roleId: role.id,
      name: role.name,
      description: role.description ?? "",
      color: role.color as (typeof ROLE_COLORS)[number],
    },
  });
  const e = form.formState.errors;
  const color = useWatch({ control: form.control, name: "color" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await updateRole(values);
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
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset disabled={!editable} className="grid gap-4">
        <Field id="name" label="Name" required error={e.name?.message} hint={role.isSystem ? "Built-in roles keep their name" : undefined}>
          <Input readOnly={role.isSystem} {...form.register("name")} />
        </Field>
        <Field id="description" label="Description" error={e.description?.message}>
          <Textarea rows={3} {...form.register("description")} />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Badge color</span>
          <ColorPicker value={color} onChange={(c) => form.setValue("color", c, { shouldDirty: true })} />
        </div>
      </fieldset>
      {editable && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save details
          </Button>
        </div>
      )}
    </form>
  );
}

type Module = {
  key: string;
  label: string;
  description: string;
  permissions: { key: string; label: string; description: string; isSensitive: boolean }[];
};

/** Module-by-module permission editor. Permissions you don't hold are locked. */
export function PermissionEditor({
  roleId,
  modules,
  initial,
  editable,
  grantable,
  holders,
}: {
  roleId: string;
  modules: Module[];
  initial: string[];
  editable: boolean;
  grantable: string[];
  holders: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(initial));
  const [pending, startTransition] = useTransition();
  const canGrant = useMemo(() => new Set(grantable), [grantable]);
  const initialSet = useMemo(() => new Set(initial), [initial]);
  const added = [...selected].filter((k) => !initialSet.has(k));
  const removed = initial.filter((k) => !selected.has(k));
  const dirty = added.length + removed.length > 0;

  const toggle = (key: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  const save = () =>
    startTransition(async () => {
      const res = await setRolePermissions({ roleId, permissions: [...selected] });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {modules.map((m) => {
          const keys = m.permissions.map((p) => p.key);
          const count = keys.filter((k) => selected.has(k)).length;
          const allOn = count === keys.length;
          const modLocked = !editable || keys.some((k) => !canGrant.has(k));
          return (
            <fieldset key={m.key} className="rounded-lg border p-3">
              <legend className="sr-only">{m.label}</legend>
              <div className="mb-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-muted-foreground text-xs">{m.description}</p>
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={modLocked}
                    onClick={() => keys.forEach((k) => toggle(k, !allOn))}
                  >
                    {allOn ? "None" : "All"}
                  </Button>
                )}
              </div>
              <ul className="grid gap-1.5">
                {m.permissions.map((p) => {
                  const locked = !editable || !canGrant.has(p.key);
                  const changed = selected.has(p.key) !== initialSet.has(p.key);
                  return (
                    <li key={p.key}>
                      <label
                        className={cn(
                          "flex items-start gap-2 rounded-md px-1 py-0.5 text-sm",
                          changed && "bg-primary/5",
                          locked && editable && "opacity-55",
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(p.key)}
                          disabled={locked}
                          onCheckedChange={(c) => toggle(p.key, !!c)}
                        />
                        <span>
                          {p.label}
                          {p.isSensitive && <span className="text-destructive ml-1.5 text-xs font-medium">Sensitive</span>}
                          <span className="text-muted-foreground block text-xs">{p.description}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>

      {editable && (
        <div className="bg-background/95 sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-sm backdrop-blur">
          <p className="text-muted-foreground text-sm">
            {dirty ? (
              <>
                <span className="text-success">+{added.length}</span> / <span className="text-destructive">−{removed.length}</span> changes
                · applies to {holders} {holders === 1 ? "person" : "people"} immediately
              </>
            ) : (
              `${selected.size} permissions selected`
            )}
          </p>
          <div className="ml-auto flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setSelected(new Set(initial))}>
                Discard
              </Button>
            )}
            <Button onClick={save} disabled={!dirty || pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Save permissions
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeleteRoleButton({ roleId, name, holders }: { roleId: string; name: string; holders: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={pending}>
          <Trash2Icon /> Delete role
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {holders > 0 ? `${holders} ${holders === 1 ? "person loses" : "people lose"} this role and its permissions immediately. ` : ""}
            This can&apos;t be undone, but it will be recorded in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const res = await deleteRole({ roleId });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message);
                router.push("/admin/roles");
              })
            }
          >
            Delete role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
