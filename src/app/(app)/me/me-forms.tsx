"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { requestMembership, submitReference, withdrawRequest } from "./actions";

type Plan = { id: string; name: string; pricePaise: number; durationMonths: number; description: string | null; benefits: string[] };

export function ChoosePlan({ plans, cta }: { plans: Plan[]; cta: string }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const plan = plans.find((p) => p.id === planId);

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Plan" className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={planId === p.id}
            onClick={() => setPlanId(p.id)}
            className={cn(
              "flex flex-col rounded-xl border p-4 text-left transition-colors",
              planId === p.id ? "border-primary bg-primary/5 ring-primary/30 ring-2" : "hover:bg-muted/40",
            )}
          >
            <span className="font-medium">{p.name}</span>
            <span className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(p.pricePaise)}</span>
            <span className="text-muted-foreground text-xs">{p.durationMonths} months</span>
            {p.benefits.length > 0 && (
              <ul className="text-muted-foreground mt-3 grid gap-0.5 text-xs">
                {p.benefits.slice(0, 4).map((b) => (
                  <li key={b}>✓ {b}</li>
                ))}
                {p.benefits.length > 4 && <li>+ {p.benefits.length - 4} more</li>}
              </ul>
            )}
          </button>
        ))}
      </div>
      <Button
        size="lg"
        className="justify-self-start"
        disabled={pending || !plan}
        onClick={() =>
          startTransition(async () => {
            const res = await requestMembership({ planId });
            if (!res.ok) return void toast.error(res.error);
            toast.success(res.message);
            router.refresh();
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {cta} {plan && `— ${formatINR(plan.pricePaise)}`}
      </Button>
    </div>
  );
}

export function ReferenceForm({ membershipId, current }: { membershipId: string; current: string | null }) {
  const router = useRouter();
  const [reference, setReference] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await submitReference({ membershipId, reference });
          if (!res.ok) return setError(res.fieldErrors?.reference?.[0] ?? res.error);
          setError(null);
          toast.success(res.message);
          router.refresh();
        });
      }}
    >
      <Field
        id="reference"
        label="Paid already? Enter the UPI transaction ID"
        hint="The 12-digit UTR shown in your UPI app"
        error={error ?? undefined}
      >
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 427813650912" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {current ? "Update reference" : "Submit reference"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await withdrawRequest({ membershipId });
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              router.refresh();
            })
          }
        >
          Withdraw request
        </Button>
      </div>
    </form>
  );
}
