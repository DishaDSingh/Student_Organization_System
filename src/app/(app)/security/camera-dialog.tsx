"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { cameraSchema } from "@/lib/validation/schemas";
import { saveCamera } from "./actions";

type Values = z.input<typeof cameraSchema>;

export function CameraDialog({ events, camera }: { events: { id: string; title: string }[]; camera?: Values }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(cameraSchema),
    mode: "onTouched",
    defaultValues: camera ?? { name: "", location: "", streamUrl: "", playbackUrl: "", eventId: "", retentionDays: 30, isActive: true },
  });
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {camera ? (
          <Button variant="outline">
            <SettingsIcon /> Settings
          </Button>
        ) : (
          <Button>
            <PlusIcon /> Add camera
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((v) =>
            startTransition(async () => {
              const res = await saveCamera(v);
              if (!res.ok) {
                applyServerErrors(res.fieldErrors, form.setError);
                return void toast.error(res.error);
              }
              toast.success(res.message);
              setOpen(false);
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>{camera ? "Camera settings" : "Add a camera"}</DialogTitle>
            <DialogDescription>Feeds stay on your network; CampusBuzz only shows them to people with access.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cam-name" label="Name" required error={e.name?.message}>
              <Input placeholder="Main gate" {...form.register("name")} />
            </Field>
            <Field id="cam-loc" label="Location" required error={e.location?.message}>
              <Input placeholder="Auditorium entrance" {...form.register("location")} />
            </Field>
          </div>
          <Field id="cam-live" label="Live feed URL" hint="MJPEG / snapshot image, MP4 or HLS" error={e.streamUrl?.message}>
            <Input type="url" placeholder="http://192.168.1.20/stream.mjpg" {...form.register("streamUrl")} />
          </Field>
          <Field
            id="cam-play"
            label="Recorded footage URL"
            hint="Optional — if your recorder supports playback"
            error={e.playbackUrl?.message}
          >
            <Input type="url" {...form.register("playbackUrl")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cam-event" label="For an event" hint="Event heads see their events' cameras">
              <NativeSelect {...form.register("eventId")}>
                <option value="">Campus (no event)</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="cam-ret" label="Keep footage (days)" required error={e.retentionDays?.message}>
              <Input type="number" min={1} max={90} {...form.register("retentionDays")} />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} /> Camera is online
              </Label>
            )}
          />
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
