"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect } from "@/components/form/field";
import { draftAnnouncement } from "../actions";

export function DraftForm({ ai, brief: initialBrief, audience: initialAudience }: { ai: boolean; brief: string; audience: string }) {
  const router = useRouter();
  const [brief, setBrief] = useState(initialBrief);
  const [audience, setAudience] = useState(initialAudience);
  const [useAi, setUseAi] = useState(ai);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="bg-card grid max-w-xl gap-4 rounded-xl border p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await draftAnnouncement({ brief, audience, useAi });
          if (!res.ok) return void setError(res.fieldErrors?.brief?.[0] ?? res.error);
          toast.success(res.message);
          router.push(`/announcements/${res.data.id}`);
        });
      }}
    >
      <Field
        id="brief"
        label="What's it about?"
        required
        error={error}
        hint="e.g. Diwali Gala tickets on sale, ₹800 for members, 7 Nov at Lakeside Banquets"
      >
        <Textarea rows={4} value={brief} onChange={(e) => (setBrief(e.target.value), setError(undefined))} />
      </Field>
      <Field id="audience" label="Who should get it?">
        <NativeSelect value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="MEMBERS">Active members</option>
          <option value="EXPIRING">Members whose membership ends this week</option>
          <option value="VOLUNTEERS">Volunteers</option>
          <option value="ALL">Everyone with an account</option>
        </NativeSelect>
      </Field>
      {ai && (
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={useAi} onCheckedChange={(c) => setUseAi(c === true)} />
          <SparklesIcon className="text-primary size-4" /> Let AI write the first draft
        </Label>
      )}
      <Button type="submit" size="lg" disabled={pending} className="justify-self-start">
        {pending && <Loader2Icon className="animate-spin" />}
        Create draft
      </Button>
    </form>
  );
}
