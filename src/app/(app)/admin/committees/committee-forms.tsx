"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon, UserMinusIcon } from "lucide-react";
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
import { committeeSchema } from "@/lib/validation/schemas";
import { addCommitteeMember, deleteCommittee, removeCommitteeMember, saveCommittee } from "./actions";

type Committee = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  chair: PickedUser | null;
  termStart: string;
  termEnd: string;
  isActive: boolean;
};

export function CommitteeDialog({ committee, departments }: { committee?: Committee; departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chair, setChair] = useState<PickedUser | null>(committee?.chair ?? null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof committeeSchema>>({
    resolver: zodResolver(committeeSchema),
    mode: "onTouched",
    defaultValues: {
      committeeId: committee?.id ?? "",
      name: committee?.name ?? "",
      description: committee?.description ?? "",
      departmentId: committee?.departmentId ?? "",
      chairId: committee?.chair?.id ?? "",
      termStart: committee?.termStart ?? new Date().toISOString().slice(0, 10),
      termEnd: committee?.termEnd ?? "",
      isActive: committee?.isActive ?? true,
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveCommittee(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (committee) router.refresh();
      else router.push(`/admin/committees/${res.data.id}`);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {committee ? (
          <Button variant="outline">
            <PencilIcon /> Edit
          </Button>
        ) : (
          <Button>
            <PlusIcon /> New committee
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{committee ? "Edit committee" : "New committee"}</DialogTitle>
            <DialogDescription>Committees are working groups with a term, a chair and members.</DialogDescription>
          </DialogHeader>
          <Field id="c-name" label="Name" required error={e.name?.message}>
            <Input placeholder="Spring Gala Committee 2027" {...form.register("name")} />
          </Field>
          <Field id="c-desc" label="Purpose" error={e.description?.message}>
            <Textarea rows={2} {...form.register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-dept" label="Department" error={e.departmentId?.message}>
              <NativeSelect {...form.register("departmentId")}>
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Controller
              control={form.control}
              name="chairId"
              render={({ field }) => (
                <Field id="c-chair" label="Chair" error={e.chairId?.message}>
                  <UserPicker
                    value={chair}
                    onChange={(u) => {
                      setChair(u);
                      field.onChange(u?.id ?? "");
                    }}
                    placeholder="No chair"
                  />
                </Field>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-start" label="Term starts" required error={e.termStart?.message}>
              <Input type="date" {...form.register("termStart")} />
            </Field>
            <Field id="c-end" label="Term ends" error={e.termEnd?.message}>
              <Input type="date" {...form.register("termEnd")} />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span>
                  <span className="font-medium">Active</span>
                  <span className="text-muted-foreground block">Past committees stay for history and handover.</span>
                </span>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {committee ? "Save" : "Create committee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const POSITIONS = ["Member", "Coordinator", "Co-chair", "Volunteer Lead", "Treasurer", "Secretary"];

export function AddMemberForm({ committeeId }: { committeeId: string }) {
  const router = useRouter();
  const [person, setPerson] = useState<PickedUser | null>(null);
  const [position, setPosition] = useState("Member");
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      if (!person) return void toast.error("Pick a person first.");
      const res = await addCommitteeMember({ committeeId, userId: person.id, position });
      if (!res.ok) return void toast.error(res.fieldErrors?.position?.[0] ?? res.error);
      toast.success(res.message);
      setPerson(null);
      router.refresh();
    });

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
      <UserPicker value={person} onChange={setPerson} placeholder="Add a person…" />
      <NativeSelect value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
        {POSITIONS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </NativeSelect>
      <Button onClick={add} disabled={pending || !person}>
        {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
      </Button>
    </div>
  );
}

export function RemoveMemberButton({ committeeId, userId, name }: { committeeId: string; userId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await removeCommitteeMember({ committeeId, userId });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
          router.refresh();
        })
      }
    >
      <UserMinusIcon />
    </Button>
  );
}

export function DeleteCommitteeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={pending}>
          <Trash2Icon /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Prefer marking it inactive — past committees are useful for handover. Deleting removes its member list permanently.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const res = await deleteCommittee({ id });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message);
                router.push("/admin/committees");
              })
            }
          >
            Delete committee
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
