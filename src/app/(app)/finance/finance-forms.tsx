"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { CameraIcon, CheckIcon, FileTextIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { EXPENSE_CATEGORIES, parseReceiptText } from "@/lib/finance/rules";
import { expenseSchema } from "@/lib/validation/schemas";
import { markReimbursed, reviewExpense, scanReceipt, submitExpense } from "./actions";

type Option = { id: string; title: string };
type Values = z.input<typeof expenseSchema>;

// ─── Submit an expense ───────────────────────────────────────────────────────

export function ExpenseForm({ today, events, fundraisers }: { today: string; events: Option[]; fundraisers: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<{ id: string; name: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ai: boolean } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<Values>({
    resolver: zodResolver(expenseSchema),
    mode: "onTouched",
    defaultValues: {
      description: "",
      category: "Other",
      vendor: "",
      amountRupees: "",
      taxRupees: "",
      spentAt: today,
      needsReimbursement: true,
      eventId: "",
      fundraiserId: "",
      receiptUploadId: "",
      source: "manual",
    },
  });
  const e = form.formState.errors;

  /** Put what the scanner read into the form; the person still checks every field. */
  function fill(g: {
    vendor: string | null;
    date: string | null;
    totalRupees: number | null;
    taxRupees: number | null;
    category: string;
    description?: string;
  }) {
    const opts = { shouldValidate: true, shouldDirty: true } as const;
    if (g.vendor) form.setValue("vendor", g.vendor, opts);
    if (g.date) form.setValue("spentAt", g.date, opts);
    if (g.totalRupees) form.setValue("amountRupees", g.totalRupees, opts);
    if (g.taxRupees) form.setValue("taxRupees", g.taxRupees, opts);
    if (g.category !== "Other") form.setValue("category", g.category as Values["category"], opts);
    if (g.description && !form.getValues("description")) form.setValue("description", g.description, opts);
  }

  async function onFile(file: File) {
    setScanning(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("purpose", "receipt");
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) return void toast.error(json.error ?? "Upload failed");
      setReceipt({ id: json.id, name: json.filename });
      form.setValue("receiptUploadId", json.id);

      const scan = await scanReceipt({ uploadId: json.id });
      if (!scan.ok) return void toast.error(scan.error);
      fill(scan.data);
      if (scan.data.source === "ai") form.setValue("source", "scan");
      setNotice({ text: scan.data.notice, ai: scan.data.source === "ai" });
      if (scan.data.source !== "ai") setPasteOpen(true);
    } finally {
      setScanning(false);
    }
  }

  return (
    <form
      noValidate
      className="bg-card grid max-w-xl gap-4 rounded-xl border p-4 sm:p-6"
      onSubmit={form.handleSubmit((v) =>
        startTransition(async () => {
          const res = await submitExpense(v);
          if (!res.ok) {
            applyServerErrors(res.fieldErrors, form.setError);
            return void toast.error(res.error);
          }
          toast.success(res.message);
          router.push("/finance");
        }),
      )}
    >
      {/* Step 1: the receipt. Optional, but it fills the form for you. */}
      <div className="bg-muted/40 grid gap-3 rounded-lg border border-dashed p-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          capture="environment"
          className="sr-only"
          aria-label="Receipt photo or PDF"
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            if (f) void onFile(f);
            ev.target.value = "";
          }}
        />
        {receipt ? (
          <div className="flex items-center gap-2 text-sm">
            <FileTextIcon className="text-muted-foreground size-4" />
            <a href={`/api/uploads/${receipt.id}`} target="_blank" rel="noreferrer" className="text-primary truncate hover:underline">
              {receipt.name}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove receipt"
              onClick={() => {
                setReceipt(null);
                setNotice(null);
                form.setValue("receiptUploadId", "");
                form.setValue("source", "manual");
              }}
            >
              <XIcon />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={scanning} onClick={() => fileRef.current?.click()}>
              {scanning ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
              {scanning ? "Reading receipt…" : "Add receipt photo"}
            </Button>
            <p className="text-muted-foreground text-sm">We&apos;ll fill in the form from it.</p>
          </div>
        )}
        {notice && (
          <p className={notice.ai ? "text-primary flex items-start gap-1.5 text-sm" : "text-muted-foreground text-sm"}>
            {notice.ai && <SparklesIcon className="mt-0.5 size-4 shrink-0" />}
            {notice.text}
          </p>
        )}
        {pasteOpen ? (
          <PasteReceiptText
            onRead={(text) => {
              const g = parseReceiptText(text);
              fill(g);
              const found = [g.vendor && "shop", g.date && "date", g.totalRupees && "total", g.taxRupees && "tax"].filter(Boolean);
              toast[found.length ? "success" : "info"](
                found.length ? `Found ${found.join(", ")} — please check` : "Couldn't find anything — fill it in below",
              );
              setPasteOpen(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="text-muted-foreground justify-self-start text-xs hover:underline"
            onClick={() => setPasteOpen(true)}
          >
            No photo? Paste the receipt text instead
          </button>
        )}
      </div>

      {/* Step 2: the details. */}
      <Field id="description" label="What was it for?" required error={e.description?.message}>
        <Input placeholder="Snacks for Freshers volunteers" {...form.register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="amountRupees" label="Total paid (₹)" required error={e.amountRupees?.message}>
          <Input type="number" inputMode="decimal" min={1} step="0.01" {...form.register("amountRupees")} />
        </Field>
        <Field id="spentAt" label="Date" required error={e.spentAt?.message}>
          <Input type="date" max={today} {...form.register("spentAt")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label="Category" error={e.category?.message}>
          <NativeSelect {...form.register("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="vendor" label="Shop / vendor" error={e.vendor?.message}>
          <Input {...form.register("vendor")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="eventId" label="For an event?" error={e.eventId?.message}>
          <NativeSelect {...form.register("eventId")}>
            <option value="">No</option>
            {events.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="fundraiserId" label="For a fundraiser?" error={e.fundraiserId?.message}>
          <NativeSelect {...form.register("fundraiserId")}>
            <option value="">No</option>
            {fundraisers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id="taxRupees" label="GST included (₹)" hint="Optional — on the receipt as GST / CGST + SGST" error={e.taxRupees?.message}>
        <Input type="number" inputMode="decimal" min={0} step="0.01" className="sm:max-w-48" {...form.register("taxRupees")} />
      </Field>
      <Controller
        control={form.control}
        name="needsReimbursement"
        render={({ field }) => (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />I paid from my own pocket — pay me back
          </Label>
        )}
      />
      <Button type="submit" size="lg" disabled={pending || scanning} className="justify-self-start">
        {pending && <Loader2Icon className="animate-spin" />}
        Send to treasurer
      </Button>
    </form>
  );
}

function PasteReceiptText({ onRead }: { onRead: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="grid gap-2">
      <Textarea
        rows={4}
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        aria-label="Receipt text"
        placeholder={"Tip: your phone camera can copy text from a photo.\nPaste it here, e.g.\nSharma Sweets\n03/10/2026\nTotal: ₹1,250.00"}
      />
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={!text.trim()} onClick={() => onRead(text)}>
        Read text
      </Button>
    </div>
  );
}

// ─── Treasurer: review ───────────────────────────────────────────────────────

export function ReviewDialog({
  expense,
}: {
  expense: { id: string; description: string; amountRupees: number; category: string; submitter: string; receiptUrl: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(expense.amountRupees));
  const [category, setCategory] = useState(expense.category);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (decision: "APPROVE" | "REJECT") =>
    startTransition(async () => {
      const res = await reviewExpense({
        expenseId: expense.id,
        decision,
        amountRupees: decision === "APPROVE" ? amount : undefined,
        category: decision === "APPROVE" ? category : undefined,
        note,
      });
      if (!res.ok) return void toast.error(res.fieldErrors?.note?.[0] ?? res.fieldErrors?.amountRupees?.[0] ?? res.error);
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Review</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense.description}</DialogTitle>
          <DialogDescription>
            From {expense.submitter}.{" "}
            {expense.receiptUrl ? (
              <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Open receipt
              </a>
            ) : (
              "No receipt attached."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="r-amount" label="Amount (₹)" hint="Fix it if it doesn't match the receipt">
            <Input type="number" inputMode="decimal" min={1} step="0.01" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
          </Field>
          <Field id="r-category" label="Category">
            <NativeSelect value={category} onChange={(ev) => setCategory(ev.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field id="r-note" label="Note" hint="Required when rejecting">
          <Textarea rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => decide("REJECT")}>
            <XIcon /> Reject
          </Button>
          <Button disabled={pending} onClick={() => decide("APPROVE")}>
            {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReimburseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await markReimbursed({ expenseId });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
          router.refresh();
        })
      }
    >
      {pending && <Loader2Icon className="animate-spin" />}
      Mark paid back
    </Button>
  );
}
