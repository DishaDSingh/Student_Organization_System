"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, SendIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Field, NativeSelect } from "@/components/form/field";
import { publishAnnouncement, saveAnnouncement } from "../actions";

type Audience = "MEMBERS" | "EXPIRING" | "VOLUNTEERS" | "ALL";
const LABEL: Record<Audience, string> = {
  MEMBERS: "active members",
  EXPIRING: "members whose membership ends this week",
  VOLUNTEERS: "volunteers",
  ALL: "everyone with an account",
};

export function AnnouncementEditor({
  announcement: a,
  counts,
  canEdit,
  canPublish,
}: {
  announcement: { id: string; title: string; body: string; audience: Audience; source: string };
  counts: Record<Audience, number>;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [audience, setAudience] = useState<Audience>(a.audience);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const placeholders = (body.match(/\[add[^\]]*\]/gi) ?? []).length;

  const save = () =>
    startTransition(async () => {
      const res = await saveAnnouncement({ announcementId: a.id, title, body, audience });
      if (!res.ok) return void toast.error(res.fieldErrors ? Object.values(res.fieldErrors)[0]?.[0] : res.error);
      toast.success(res.message);
      setDirty(false);
      router.refresh();
    });

  const publish = () =>
    startTransition(async () => {
      const res = await publishAnnouncement({ announcementId: a.id, confirmRecipients: counts[audience] });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.push("/announcements");
    });

  return (
    <div className="grid max-w-2xl gap-4">
      {a.source === "ai" && (
        <p className="text-primary flex items-center gap-1.5 text-sm">
          <SparklesIcon className="size-4" /> AI wrote this draft — check every detail before sending.
        </p>
      )}
      <div className="bg-card grid gap-4 rounded-xl border p-4 sm:p-6">
        <Field id="a-title" label="Title">
          <Input value={title} disabled={!canEdit} onChange={(e) => (setTitle(e.target.value), setDirty(true))} />
        </Field>
        <Field
          id="a-body"
          label="Message"
          hint={placeholders ? `${placeholders} “[add …]” placeholder${placeholders > 1 ? "s" : ""} still to fill in` : undefined}
        >
          <Textarea rows={10} value={body} disabled={!canEdit} onChange={(e) => (setBody(e.target.value), setDirty(true))} />
        </Field>
        <Field id="a-aud" label="Send to">
          <NativeSelect value={audience} disabled={!canEdit} onChange={(e) => (setAudience(e.target.value as Audience), setDirty(true))}>
            {(Object.keys(LABEL) as Audience[]).map((k) => (
              <option key={k} value={k}>
                {LABEL[k][0].toUpperCase() + LABEL[k].slice(1)} ({counts[k]})
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="outline" disabled={pending || !dirty} onClick={save}>
            Save draft
          </Button>
        )}
        {canPublish ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={pending || dirty || placeholders > 0}>
                <SendIcon /> Send…
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send to {counts[audience]} people?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{title}” will be posted and every one of the {counts[audience]} {LABEL[audience]} gets a notification. This can&apos;t be
                  unsent.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not yet</AlertDialogCancel>
                <AlertDialogAction onClick={publish}>
                  {pending && <Loader2Icon className="animate-spin" />}
                  Yes, send it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <p className="text-muted-foreground text-sm">Someone with publish rights needs to send this.</p>
        )}
        {(dirty || placeholders > 0) && canPublish && (
          <p className="text-muted-foreground text-xs">
            {dirty ? "Save your changes before sending." : "Fill in the placeholders before sending."}
          </p>
        )}
      </div>
    </div>
  );
}
