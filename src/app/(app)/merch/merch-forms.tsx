"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { CheckIcon, HandIcon, Loader2Icon, PackagePlusIcon, PencilIcon, PlusIcon, ShoppingBagIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { UserPicker, type PickedUser } from "@/components/form/user-picker";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { APPAREL_SIZES, sizeRank, suggestedMemberPrice } from "@/lib/merch/rules";
import {
  confirmMerchSchema,
  deskMerchSaleSchema,
  newProductSchema,
  productSchema,
  stockAdjustSchema,
  voidMerchSchema,
} from "@/lib/validation/schemas";
import { PaymentFields } from "../members/member-forms";
import {
  adjustStock,
  buyMerch,
  cancelMyMerchOrder,
  confirmMerchPayment,
  createProduct,
  deskMerchSale,
  fulfilMerchOrder,
  setReorderLevel,
  updateProduct,
  voidMerch,
} from "./actions";

const CATEGORIES = ["Hoodie", "T-shirt", "Cap", "Tote", "Mug"] as const;

// ─── Products ────────────────────────────────────────────────────────────────

export function NewProductForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof newProductSchema>>({
    resolver: zodResolver(newProductSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      category: "Hoodie",
      description: "",
      publicPriceRupees: "",
      memberPriceRupees: "",
      unitCostRupees: "",
      status: "DRAFT",
      sizes: ["S", "M", "L", "XL"],
      colors: [{ name: "Black", hex: "#111827" }],
      initialStock: 20,
      reorderLevel: 5,
    },
  });
  const e = form.formState.errors as Record<string, { message?: string } | undefined> & { colors?: { name?: { message?: string } }[] };
  const colors = useFieldArray({ control: form.control, name: "colors" });
  const [category, sizes] = useWatch({ control: form.control, name: ["category", "sizes"] });
  const apparel = category === "Hoodie" || category === "T-shirt";

  return (
    <form
      noValidate
      className="grid gap-6 lg:grid-cols-[1fr_22rem]"
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          const res = await createProduct(values);
          if (!res.ok) {
            applyServerErrors(res.fieldErrors, form.setError);
            return void toast.error(res.error);
          }
          toast.success(res.message);
          router.push(`/merch/${res.data.id}`);
        }),
      )}
    >
      <section className="bg-card grid content-start gap-4 rounded-xl border p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field id="name" label="Product name" required error={e.name?.message}>
            <Input placeholder="Classic Logo Hoodie" {...form.register("name")} />
          </Field>
          <Field id="category" label="Category" required error={e.category?.message}>
            <NativeSelect
              {...form.register("category", {
                onChange: (ev) =>
                  form.setValue("sizes", ev.target.value === "Hoodie" || ev.target.value === "T-shirt" ? ["S", "M", "L", "XL"] : ["ONE"]),
              })}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field id="description" label="Description" error={e.description?.message}>
          <Textarea rows={3} {...form.register("description")} />
        </Field>
        {apparel && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Sizes</legend>
            <div className="flex flex-wrap gap-2">
              {APPAREL_SIZES.map((s) => {
                const on = sizes?.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      form.setValue(
                        "sizes",
                        on ? sizes!.filter((x) => x !== s) : [...(sizes ?? []), s].sort((a, b) => sizeRank(a) - sizeRank(b)),
                        { shouldValidate: true },
                      )
                    }
                    className={cn(
                      "h-9 min-w-11 rounded-lg border px-3 text-sm font-medium",
                      on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {e.sizes?.message && <p className="text-destructive mt-1 text-xs">{e.sizes.message}</p>}
          </fieldset>
        )}
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Colours</legend>
          {colors.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Colour"
                className="h-8 w-10 cursor-pointer rounded border"
                {...form.register(`colors.${i}.hex`)}
              />
              <Input
                placeholder="Colour name"
                aria-label="Colour name"
                {...form.register(`colors.${i}.name`)}
                aria-invalid={!!e.colors?.[i]?.name}
              />
              {colors.fields.length > 1 && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove colour" onClick={() => colors.remove(i)}>
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
          {colors.fields.length < 6 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => colors.append({ name: "", hex: "#9ca3af" })}
            >
              <PlusIcon /> Add colour
            </Button>
          )}
        </fieldset>
      </section>

      <aside className="grid content-start gap-4">
        <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
          <Field id="publicPriceRupees" label="Price (₹)" required error={e.publicPriceRupees?.message}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              {...form.register("publicPriceRupees", {
                onBlur: (ev) =>
                  !form.getValues("memberPriceRupees") &&
                  ev.target.value &&
                  form.setValue("memberPriceRupees", suggestedMemberPrice(Number(ev.target.value) * 100) / 100),
              })}
            />
          </Field>
          <Field
            id="memberPriceRupees"
            label="Member price (₹)"
            required
            hint="Members get 15% off by default"
            error={e.memberPriceRupees?.message}
          >
            <Input type="number" inputMode="decimal" min={0} {...form.register("memberPriceRupees")} />
          </Field>
          <Field id="unitCostRupees" label="Unit cost (₹)" hint="What we pay the printer" error={e.unitCostRupees?.message}>
            <Input type="number" inputMode="decimal" min={0} {...form.register("unitCostRupees")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="initialStock" label="Opening stock" hint="Per variant" error={e.initialStock?.message}>
              <Input type="number" min={0} {...form.register("initialStock")} />
            </Field>
            <Field id="reorderLevel" label="Reorder at" error={e.reorderLevel?.message}>
              <Input type="number" min={0} {...form.register("reorderLevel")} />
            </Field>
          </div>
          <Field id="status" label="Visibility">
            <NativeSelect {...form.register("status")}>
              <option value="DRAFT">Draft — staff only</option>
              <option value="ACTIVE">On sale</option>
            </NativeSelect>
          </Field>
        </section>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Create product
        </Button>
      </aside>
    </form>
  );
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  publicPricePaise: number;
  memberPricePaise: number;
  unitCostPaise: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

export function EditProductDialog({ product }: { product: ProductRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    mode: "onTouched",
    defaultValues: {
      productId: product.id,
      name: product.name,
      category: product.category as (typeof CATEGORIES)[number],
      description: product.description ?? "",
      publicPriceRupees: product.publicPricePaise / 100,
      memberPriceRupees: product.memberPricePaise / 100,
      unitCostRupees: product.unitCostPaise / 100,
      status: product.status,
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await updateProduct(values);
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
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription>Price changes apply to new orders only.</DialogDescription>
          </DialogHeader>
          <Field id="p-name" label="Name" required error={e.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field id="p-desc" label="Description" error={e.description?.message}>
            <Textarea rows={2} {...form.register("description")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="p-pub" label="Price ₹" error={e.publicPriceRupees?.message}>
              <Input type="number" min={0} {...form.register("publicPriceRupees")} />
            </Field>
            <Field id="p-mem" label="Member ₹" error={e.memberPriceRupees?.message}>
              <Input type="number" min={0} {...form.register("memberPriceRupees")} />
            </Field>
            <Field id="p-cost" label="Cost ₹" error={e.unitCostRupees?.message}>
              <Input type="number" min={0} {...form.register("unitCostRupees")} />
            </Field>
          </div>
          <Field id="p-status" label="Visibility">
            <NativeSelect {...form.register("status")}>
              <option value="DRAFT">Draft — staff only</option>
              <option value="ACTIVE">On sale</option>
              <option value="ARCHIVED">Archived</option>
            </NativeSelect>
          </Field>
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

// ─── Stock ───────────────────────────────────────────────────────────────────

export function StockDialog({ variant }: { variant: { id: string; label: string; stock: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof stockAdjustSchema>>({
    resolver: zodResolver(stockAdjustSchema),
    mode: "onTouched",
    defaultValues: { variantId: variant.id, reason: "RESTOCK", change: "", note: "" },
  });
  const e = form.formState.errors;
  const [reason, change] = useWatch({ control: form.control, name: ["reason", "change"] });
  const n = Number(change) || 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Adjust stock for ${variant.label}`}>
          <PackagePlusIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await adjustStock(values);
              if (!res.ok) {
                applyServerErrors(res.fieldErrors, form.setError);
                return void toast.error(res.error);
              }
              toast.success(res.message);
              setOpen(false);
              form.reset({ variantId: variant.id, reason: "RESTOCK", change: "", note: "" });
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Stock: {variant.label}</DialogTitle>
            <DialogDescription>Every change is logged with who made it and why.</DialogDescription>
          </DialogHeader>
          <Field id="s-reason" label="Reason">
            <NativeSelect {...form.register("reason")}>
              <option value="RESTOCK">Restock (delivery arrived)</option>
              <option value="ADJUSTMENT">Count correction</option>
              <option value="DAMAGED">Damaged / lost</option>
            </NativeSelect>
          </Field>
          <Field
            id="s-change"
            label={reason === "RESTOCK" ? "Units received" : reason === "DAMAGED" ? "Units to remove (negative)" : "Change (+/−)"}
            hint={`Now ${variant.stock} → ${Math.max(0, variant.stock + n)}`}
            error={e.change?.message}
          >
            <Input type="number" {...form.register("change")} />
          </Field>
          <Field id="s-note" label="Note" required={reason !== "RESTOCK"} error={e.note?.message}>
            <Input placeholder={reason === "RESTOCK" ? "Supplier / invoice no." : "What happened?"} {...form.register("note")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Update stock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReorderLevelInput({ variantId, value }: { variantId: string; value: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [pending, startTransition] = useTransition();
  return (
    <Input
      type="number"
      min={0}
      max={500}
      value={v}
      disabled={pending}
      aria-label="Reorder level"
      className="h-7 w-16 text-right"
      onChange={(e) => setV(e.target.value)}
      onBlur={() =>
        Number(v) !== value &&
        startTransition(async () => {
          const res = await setReorderLevel({ variantId, reorderLevel: v });
          if (!res.ok) {
            setV(String(value));
            return void toast.error(res.fieldErrors?.reorderLevel?.[0] ?? res.error);
          }
          toast.success(res.message);
          router.refresh();
        })
      }
    />
  );
}

// ─── Buying ──────────────────────────────────────────────────────────────────

type BuyVariant = { id: string; size: string; color: string; colorHex: string; stock: number };

export function BuyMerchPanel({
  variants,
  pricePaise,
  publicPricePaise,
  isMember,
  onColor,
}: {
  variants: BuyVariant[];
  pricePaise: number;
  publicPricePaise: number;
  isMember: boolean;
  onColor?: (hex: string) => void;
}) {
  const router = useRouter();
  const colors = [...new Map(variants.map((v) => [v.color, v.colorHex])).entries()];
  const [color, setColor] = useState(colors[0]?.[0] ?? "");
  const sizes = variants.filter((v) => v.color === color).sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  const [variantId, setVariantId] = useState<string | null>(sizes.find((s) => s.stock > 0)?.id ?? null);
  const [qty, setQty] = useState(1);
  const [pending, startTransition] = useTransition();
  const chosen = variants.find((v) => v.id === variantId);

  return (
    <div className="grid gap-4">
      <p>
        <span className="text-2xl font-semibold tabular-nums">{formatINR(pricePaise)}</span>
        {isMember && pricePaise < publicPricePaise && (
          <>
            <span className="text-muted-foreground ml-2 text-sm line-through">{formatINR(publicPricePaise)}</span>
            <span className="text-success ml-2 text-sm">member price</span>
          </>
        )}
      </p>
      {colors.length > 1 && (
        <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
          {colors.map(([name, hex]) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={color === name}
              aria-label={name}
              title={name}
              onClick={() => {
                setColor(name);
                onColor?.(hex);
                setVariantId(variants.find((v) => v.color === name && v.stock > 0)?.id ?? null);
              }}
              className={cn("size-8 rounded-full border-2 ring-offset-2", color === name ? "ring-primary ring-2" : "border-border")}
              style={{ background: hex }}
            />
          ))}
        </div>
      )}
      <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-2">
        {sizes.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={variantId === s.id}
            disabled={s.stock <= 0}
            onClick={() => setVariantId(s.id)}
            className={cn(
              "h-10 min-w-12 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40",
              variantId === s.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {s.size === "ONE" ? "One size" : s.size}
          </button>
        ))}
      </div>
      {chosen && chosen.stock <= 5 && <p className="text-xs text-amber-600 dark:text-amber-400">Only {chosen.stock} left in this size</p>}
      <div className="flex items-center gap-2">
        <NativeSelect value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-20" aria-label="Quantity">
          {Array.from({ length: Math.min(5, chosen?.stock ?? 1) }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </NativeSelect>
        <Button
          size="lg"
          className="flex-1"
          disabled={!chosen || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await buyMerch({ lines: [{ variantId: chosen!.id, quantity: qty }] });
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              router.push("/me/orders");
            })
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <ShoppingBagIcon />}
          {chosen ? `Order — ${formatINR(pricePaise * qty)}` : "Pick a size"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Pay by UPI or at the merch desk; collect from the desk once paid.</p>
    </div>
  );
}

// ─── Order handling (staff) ──────────────────────────────────────────────────

export function MerchOrderActions({
  order,
}: {
  order: { id: string; status: string; totalPaise: number; claimedReference: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <span className="inline-flex items-center gap-0.5">
      {order.status === "PENDING_PAYMENT" && (
        <ConfirmMerchDialog orderId={order.id} totalPaise={order.totalPaise} claimedReference={order.claimedReference} />
      )}
      {order.status === "PAID" && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Mark collected"
          title="Mark collected"
          disabled={pending}
          onClick={() => run(() => fulfilMerchOrder({ orderId: order.id }))}
        >
          <HandIcon />
        </Button>
      )}
      {(order.status === "PENDING_PAYMENT" || order.status === "PAID") && (
        <VoidMerchDialog orderId={order.id} paid={order.status === "PAID"} />
      )}
    </span>
  );
}

function ConfirmMerchDialog({
  orderId,
  totalPaise,
  claimedReference,
}: {
  orderId: string;
  totalPaise: number;
  claimedReference: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof confirmMerchSchema>>({
    resolver: zodResolver(confirmMerchSchema),
    mode: "onTouched",
    defaultValues: { orderId, method: claimedReference ? "UPI" : "CASH", reference: claimedReference ?? "" },
  });
  const method = useWatch({ control: form.control, name: "method" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Confirm payment" title="Confirm payment">
          <CheckIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await confirmMerchPayment(values);
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
            <DialogTitle>Confirm {formatINR(totalPaise)} received</DialogTitle>
            <DialogDescription>The buyer is notified to collect their order.</DialogDescription>
          </DialogHeader>
          <PaymentFields register={form.register as never} errors={form.formState.errors} method={method} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoidMerchDialog({ orderId, paid }: { orderId: string; paid: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof voidMerchSchema>>({
    resolver: zodResolver(voidMerchSchema),
    mode: "onTouched",
    defaultValues: { orderId, reason: "" },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={paid ? "Refund order" : "Cancel order"} title={paid ? "Refund" : "Cancel"}>
          <XIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await voidMerch(values);
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              setOpen(false);
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>{paid ? "Refund this order?" : "Cancel this order?"}</DialogTitle>
            <DialogDescription>The items go back into stock.{paid && " Hand the money back before confirming."}</DialogDescription>
          </DialogHeader>
          <Field id="v-reason" label="Reason" required error={form.formState.errors.reason?.message}>
            <Input {...form.register("reason")} />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {paid ? "Refund" : "Cancel order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeskSaleDialog({ variants }: { variants: { id: string; label: string; stock: number }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<PickedUser | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof deskMerchSaleSchema>>({
    resolver: zodResolver(deskMerchSaleSchema),
    mode: "onTouched",
    defaultValues: { memberId: "", buyerName: "", buyerPhone: "", lines: [{ variantId: "", quantity: 1 }], method: "CASH", reference: "" },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const method = useWatch({ control: form.control, name: "method" });
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <ShoppingBagIcon /> Desk sale
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await deskMerchSale(values);
              if (!res.ok) {
                applyServerErrors(res.fieldErrors, form.setError);
                return void toast.error(res.error);
              }
              toast.success(res.message);
              setOpen(false);
              setMember(null);
              form.reset();
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Sell at the merch desk</DialogTitle>
            <DialogDescription>Paid and handed over now. Members get member prices automatically.</DialogDescription>
          </DialogHeader>
          <Field id="d-member" label="Member (optional)">
            <UserPicker
              value={member}
              onChange={(u) => {
                setMember(u);
                form.setValue("memberId", u?.id ?? "");
              }}
              placeholder="Search member…"
            />
          </Field>
          {!member && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="d-name" label="Buyer name" required error={e.buyerName?.message}>
                <Input {...form.register("buyerName")} />
              </Field>
              <Field id="d-phone" label="Mobile" error={e.buyerPhone?.message}>
                <Input type="tel" {...form.register("buyerPhone")} />
              </Field>
            </div>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Items</legend>
            {lines.fields.map((f, i) => (
              <div key={f.id} className="flex gap-2">
                <NativeSelect {...form.register(`lines.${i}.variantId`)} aria-label="Item">
                  <option value="">Choose item…</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                      {v.label} ({v.stock} left)
                    </option>
                  ))}
                </NativeSelect>
                <Input type="number" min={1} max={10} className="w-20" aria-label="Quantity" {...form.register(`lines.${i}.quantity`)} />
                {lines.fields.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove item" onClick={() => lines.remove(i)}>
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            ))}
            {e.lines && <p className="text-destructive text-xs">Choose an item for every line.</p>}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => lines.append({ variantId: "", quantity: 1 })}
            >
              <PlusIcon /> Add item
            </Button>
          </fieldset>
          <PaymentFields register={form.register as never} errors={e} method={method} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Record sale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelMyMerchOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelMyMerchOrder({ orderId });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
          router.refresh();
        })
      }
    >
      Cancel order
    </Button>
  );
}
