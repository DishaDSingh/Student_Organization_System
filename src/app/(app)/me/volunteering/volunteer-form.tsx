"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SKILLS, SLOTS } from "@/lib/volunteers/rules";
import { saveMyVolunteerProfile } from "../../volunteers/actions";

function Chips({
  options,
  value,
  onChange,
}: {
  options: readonly { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.key) : [...value, o.key])}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Three questions: what you're good at, when you're free, how much time you have. */
export function VolunteerForm({
  initial,
  submitLabel,
}: {
  initial: { skills: string[]; availability: string[]; maxHoursPerWeek: number };
  submitLabel: string;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState(initial.skills);
  const [availability, setAvailability] = useState(initial.availability);
  const [hours, setHours] = useState(String(initial.maxHoursPerWeek));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await saveMyVolunteerProfile({
            skills,
            availability,
            interests: [],
            maxHoursPerWeek: hours,
            isActive: true,
          } as never);
          if (!res.ok) return setError(Object.values(res.fieldErrors ?? {})[0]?.[0] ?? res.error);
          setError(null);
          toast.success(res.message);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-2">
        <p className="text-sm font-medium">What are you good at?</p>
        <Chips options={SKILLS.map((s) => ({ key: s, label: s }))} value={skills} onChange={setSkills} />
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">When are you usually free?</p>
        <Chips options={SLOTS} value={availability} onChange={setAvailability} />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="font-medium">Hours per week I can give</span>
        <Input type="number" min={1} max={40} value={hours} onChange={(e) => setHours(e.target.value)} className="w-20" />
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending && <Loader2Icon className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
