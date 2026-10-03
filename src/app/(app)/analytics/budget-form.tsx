"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/form/field";
import { setBudget } from "./actions";

/** One line: pick a category, type a monthly limit (0 removes it). */
export function BudgetForm({ categories, current }: { categories: string[]; current: Record<string, number> }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]);
  const [amount, setAmount] = useState(String(current[categories[0]] ?? ""));
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-5 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_9rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await setBudget({ category, monthlyRupees: amount });
          if (!res.ok) return void toast.error(res.fieldErrors?.monthlyRupees?.[0] ?? res.error);
          toast.success(res.message);
          router.refresh();
        });
      }}
    >
      <NativeSelect
        aria-label="Category"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setAmount(String(current[e.target.value] ?? ""));
        }}
      >
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </NativeSelect>
      <Input
        aria-label="Monthly limit (₹)"
        type="number"
        inputMode="numeric"
        min={0}
        step={500}
        placeholder="₹ per month"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button type="submit" variant="outline" disabled={pending || amount === ""}>
        {pending && <Loader2Icon className="animate-spin" />}
        Set budget
      </Button>
    </form>
  );
}
