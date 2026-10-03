"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect } from "@/components/form/field";
import { PERIODS, PERIOD_KEYS } from "@/lib/reports/types";
import { generateReport } from "../actions";

type Option = { id: string; label: string };

export function GenerateForm({
  types,
  initialType,
  initialSubject,
  events,
  fundraisers,
  ai,
}: {
  types: { key: string; label: string; subject: "event" | "fundraiser" | "period" | "none" }[];
  initialType: string;
  initialSubject?: string;
  events: Option[];
  fundraisers: Option[];
  ai: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState(initialType);
  const [subjectId, setSubjectId] = useState(initialSubject ?? "");
  const [period, setPeriod] = useState("month");
  const [useAi, setUseAi] = useState(ai);
  const [pending, startTransition] = useTransition();
  const kind = types.find((t) => t.key === type)!.subject;
  const options = kind === "event" ? events : kind === "fundraiser" ? fundraisers : [];

  return (
    <form
      className="bg-card grid max-w-xl gap-4 rounded-xl border p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await generateReport({ type, subjectId, period: kind === "period" ? period : undefined, useAi });
          if (!res.ok) return void toast.error(res.fieldErrors?.subjectId?.[0] ?? res.error);
          toast.success(res.message);
          router.push(`/reports/${res.data.id}`);
        });
      }}
    >
      <Field id="type" label="Report">
        <NativeSelect
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setSubjectId("");
          }}
        >
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {(kind === "event" || kind === "fundraiser") && (
        <Field id="subject" label={kind === "event" ? "Which event?" : "Which fundraiser?"} required>
          <NativeSelect value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      {kind === "period" && (
        <Field id="period" label="Period">
          <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIOD_KEYS.map((p) => (
              <option key={p} value={p}>
                {PERIODS[p]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      {kind === "none" && (
        <p className="text-muted-foreground text-sm">
          The handover pulls together membership, money, upcoming events, vendors, sponsors, open tasks, stock, volunteers, lessons learned
          and past reports — everything the next committee needs.
        </p>
      )}

      {ai && (
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={useAi} onCheckedChange={(c) => setUseAi(c === true)} />
          <SparklesIcon className="text-primary size-4" /> Let AI polish the wording (numbers are never changed)
        </Label>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending || ((kind === "event" || kind === "fundraiser") && !subjectId)}
        className="justify-self-start"
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Building…" : "Generate"}
      </Button>
    </form>
  );
}
