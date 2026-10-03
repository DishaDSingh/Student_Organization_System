"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, applyServerErrors } from "@/components/form/field";
import { UserPicker, type PickedUser } from "@/components/form/user-picker";
import { departmentSchema } from "@/lib/validation/schemas";
import { deleteDepartment, saveDepartment } from "./actions";

type Dept = { id: string; name: string; code: string; description: string | null; head: PickedUser | null };

export function DepartmentDialog({ department }: { department?: Dept }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [head, setHead] = useState<PickedUser | null>(department?.head ?? null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof departmentSchema>>({
    resolver: zodResolver(departmentSchema),
    mode: "onTouched",
    defaultValues: {
      departmentId: department?.id ?? "",
      name: department?.name ?? "",
      code: department?.code ?? "",
      description: department?.description ?? "",
      headId: department?.head?.id ?? "",
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveDepartment(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!department) form.reset();
      router.refresh();
    }),
  );

  const remove = () =>
    startTransition(async () => {
      if (!department || !confirm(`Delete the ${department.name} department? Members are kept but unlinked.`)) return;
      const res = await deleteDepartment({ id: department.id });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {department ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${department.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon /> New department
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{department ? `Edit ${department.name}` : "New department"}</DialogTitle>
            <DialogDescription>Departments are the permanent functional areas of your organization.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field id="dept-name" label="Name" required error={e.name?.message}>
              <Input placeholder="Finance" {...form.register("name")} />
            </Field>
            <Field id="dept-code" label="Code" required error={e.code?.message}>
              <Input placeholder="FIN" className="uppercase" maxLength={6} {...form.register("code")} />
            </Field>
          </div>
          <Field id="dept-desc" label="Description" error={e.description?.message}>
            <Textarea rows={2} {...form.register("description")} />
          </Field>
          <Controller
            control={form.control}
            name="headId"
            render={({ field }) => (
              <Field id="dept-head" label="Head" error={e.headId?.message}>
                <UserPicker
                  value={head}
                  onChange={(u) => {
                    setHead(u);
                    field.onChange(u?.id ?? "");
                  }}
                  placeholder="No head assigned"
                />
              </Field>
            )}
          />
          <DialogFooter className="sm:justify-between">
            {department ? (
              <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
                <Trash2Icon /> Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {department ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
