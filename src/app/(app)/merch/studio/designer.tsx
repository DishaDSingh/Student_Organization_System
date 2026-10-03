"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ImageUpIcon, Loader2Icon, SendIcon, SparklesIcon, Trash2Icon, WandIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/form/field";
import { Mockup3D } from "@/components/merch/mockup";
import { cn } from "@/lib/utils";
import { formatINR, rupeesToPaise } from "@/lib/membership/rules";
import {
  APPAREL_SIZES,
  estimateCostPaise,
  marginPct,
  PRODUCT_TYPES,
  sizeRank,
  suggestedMemberPrice,
  type ProductTypeKey,
} from "@/lib/merch/rules";
import { svgDataUri, templateArtwork, TEMPLATE_STYLES, type TemplateStyle } from "@/lib/merch/artwork";
import { createProductFromDesign, generateArtwork, reviewDesign, saveDesign, submitDesign } from "./actions";

const SWATCHES = ["#111827", "#1e3a8a", "#7f1d1d", "#14532d", "#6b7280", "#f5f5f4", "#facc15", "#7c3aed"];

export type DesignState = {
  id?: string;
  name: string;
  productType: ProductTypeKey;
  baseColor: string;
  inkColor: string;
  frontText: string;
  backText: string;
  artworkSvg: string | null;
  artworkSource: "ai" | "template" | "upload" | null;
  aiPrompt: string;
  logo: { id: string; url: string } | null;
  sizes: string[];
  costRupees: number;
  priceRupees: number;
};

export function Designer({ initial, editable, canSubmit }: { initial: DesignState; editable: boolean; canSubmit: boolean }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [style, setStyle] = useState<TemplateStyle>("varsity");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"ai" | "save" | "upload" | "submit" | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof DesignState>(k: K, v: DesignState[K]) => setD((s) => ({ ...s, [k]: v }));

  const type = PRODUCT_TYPES.find((t) => t.key === d.productType)!;
  const autoCost =
    estimateCostPaise(d.productType, { front: !!(d.artworkSvg || d.logo || d.frontText), back: !!d.backText, logo: !!d.logo }) / 100;
  const front = useMemo(
    () => ({
      artwork: d.artworkSvg ? svgDataUri(d.artworkSvg) : (d.logo?.url ?? null),
      text: d.artworkSvg || d.logo ? null : d.frontText || null,
      ink: d.inkColor,
    }),
    [d.artworkSvg, d.logo, d.frontText, d.inkColor],
  );

  const applyTemplate = (s: TemplateStyle) => {
    setStyle(s);
    setD((x) => ({
      ...x,
      artworkSvg: templateArtwork({
        style: s,
        title: x.frontText || x.name || "CampusBuzz",
        subtitle: String(new Date().getFullYear()),
        ink: x.inkColor,
      }),
      artworkSource: "template",
      logo: null,
    }));
  };

  const generate = () =>
    startTransition(async () => {
      if (d.aiPrompt.trim().length < 3) return setErrors({ aiPrompt: "Describe the design you want" });
      setBusy("ai");
      setAiNote(null);
      const res = await generateArtwork({ prompt: d.aiPrompt, productType: d.productType, baseColor: d.baseColor, inkColor: d.inkColor });
      setBusy(null);
      if (!res.ok) return void toast.error(res.fieldErrors?.prompt?.[0] ?? res.error);
      setD((x) => ({ ...x, artworkSvg: res.data.svg, artworkSource: res.data.source, logo: null, name: x.name || res.data.title }));
      setAiNote(res.data.notice);
      toast.success(res.data.source === "ai" ? "AI design ready" : "Offline design ready");
    });

  const upload = async (file: File) => {
    setBusy("upload");
    const body = new FormData();
    body.set("file", file);
    body.set("purpose", "merch_logo");
    const res = await fetch("/api/uploads", { method: "POST", body });
    setBusy(null);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return void toast.error(json.error ?? "Upload failed");
    setD((x) => ({ ...x, logo: { id: json.id, url: json.url }, artworkSvg: null, artworkSource: "upload" }));
  };

  const save = (thenSubmit = false) =>
    startTransition(async () => {
      setBusy(thenSubmit ? "submit" : "save");
      const res = await saveDesign({
        designId: d.id ?? "",
        name: d.name,
        productType: d.productType,
        baseColor: d.baseColor,
        inkColor: d.inkColor,
        frontText: d.frontText,
        backText: d.backText,
        artworkSvg: d.artworkSvg ?? "",
        artworkSource: d.artworkSource ?? undefined,
        aiPrompt: d.aiPrompt,
        logoUploadId: d.logo?.id ?? "",
        sizes: type.apparel ? d.sizes : [],
        estimatedCostRupees: d.costRupees || autoCost,
        sellingPriceRupees: d.priceRupees,
      } as never);
      if (!res.ok) {
        setBusy(null);
        setErrors(Object.fromEntries(Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0] ?? ""])));
        return void toast.error(res.error);
      }
      setErrors({});
      if (thenSubmit) {
        const sub = await submitDesign({ designId: res.data.id });
        setBusy(null);
        if (!sub.ok) return void toast.error(sub.error);
        toast.success(sub.message);
      } else {
        setBusy(null);
        toast.success(res.message);
      }
      if (!d.id) router.replace(`/merch/studio/${res.data.id}`);
      else router.refresh();
    });

  const price = d.priceRupees;
  const cost = d.costRupees || autoCost;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="grid content-start gap-4">
        <section className="bg-card rounded-xl border p-4 sm:p-5">
          <Mockup3D type={d.productType} color={d.baseColor} front={front} back={{ text: d.backText || null, ink: d.inkColor }} />
          <p className="text-muted-foreground mt-2 text-xs">
            Visual preview only — not a manufacturing proof.
            {d.artworkSource &&
              ` Artwork: ${d.artworkSource === "ai" ? "AI-generated" : d.artworkSource === "template" ? "template designer" : "uploaded logo"}.`}
          </p>
        </section>

        {editable && (
          <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
            <h2 className="font-medium">Artwork</h2>
            <Field
              id="aiPrompt"
              label="Describe it for AI"
              hint="e.g. retro varsity crest with a lightning bolt and “HSA 2027”"
              error={errors.aiPrompt}
            >
              <Textarea rows={2} value={d.aiPrompt} maxLength={300} onChange={(e) => set("aiPrompt", e.target.value)} />
            </Field>
            {aiNote && <p className="bg-muted/60 rounded-lg px-3 py-2 text-xs">{aiNote}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generate} disabled={busy !== null}>
                {busy === "ai" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                {busy === "ai" ? "Designing…" : "Generate with AI"}
              </Button>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                {busy === "upload" ? <Loader2Icon className="animate-spin" /> : <ImageUpIcon />} Upload logo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
              {(d.artworkSvg || d.logo) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setD((x) => ({ ...x, artworkSvg: null, logo: null, artworkSource: null }))}
                >
                  <Trash2Icon /> Clear
                </Button>
              )}
            </div>
            <div>
              <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
                <WandIcon className="size-3.5" /> Or use the offline template designer
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_STYLES.map((t) => (
                  <Button
                    key={t.key}
                    type="button"
                    size="sm"
                    variant={d.artworkSource === "template" && style === t.key ? "secondary" : "outline"}
                    onClick={() => applyTemplate(t.key)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-4">
        <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
          <fieldset disabled={!editable} className="grid gap-4">
            <Field id="name" label="Design name" required error={errors.name}>
              <Input value={d.name} maxLength={60} onChange={(e) => set("name", e.target.value)} placeholder="Varsity Hoodie 2027" />
            </Field>
            <Field id="productType" label="Product">
              <NativeSelect
                value={d.productType}
                onChange={(e) => {
                  const t = PRODUCT_TYPES.find((x) => x.key === e.target.value)!;
                  setD((x) => ({ ...x, productType: t.key, sizes: t.apparel ? (x.sizes.length ? x.sizes : ["S", "M", "L", "XL"]) : [] }));
                }}
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {(["baseColor", "inkColor"] as const).map((k) => (
                <div key={k} className="grid gap-1.5">
                  <span className="text-sm font-medium">{k === "baseColor" ? "Colour" : "Ink"}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(k === "baseColor" ? SWATCHES : ["#ffffff", "#111827", "#facc15", "#ef4444"]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`${k === "baseColor" ? "Colour" : "Ink"} ${c}`}
                        aria-pressed={d[k] === c}
                        onClick={() => set(k, c)}
                        className={cn("size-6 rounded-full border ring-offset-1", d[k] === c && "ring-primary ring-2")}
                        style={{ background: c }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom colour"
                      value={d[k]}
                      onChange={(e) => set(k, e.target.value)}
                      className="size-6 cursor-pointer rounded border"
                    />
                  </div>
                </div>
              ))}
            </div>
            <Field id="frontText" label="Front text" hint="Shown when there's no artwork" error={errors.frontText}>
              <Input value={d.frontText} maxLength={40} onChange={(e) => set("frontText", e.target.value)} />
            </Field>
            <Field id="backText" label="Back text" error={errors.backText}>
              <Input value={d.backText} maxLength={40} onChange={(e) => set("backText", e.target.value)} placeholder="CLASS OF 2027" />
            </Field>
            {type.apparel && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Sizes</legend>
                <div className="flex flex-wrap gap-1.5">
                  {APPAREL_SIZES.map((s) => {
                    const on = d.sizes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set("sizes", on ? d.sizes.filter((x) => x !== s) : [...d.sizes, s].sort((a, b) => sizeRank(a) - sizeRank(b)))
                        }
                        className={cn(
                          "h-8 min-w-10 rounded-md border px-2 text-xs font-medium",
                          on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field id="cost" label="Est. cost (₹)" hint={`Auto: ₹${autoCost}`} error={errors.estimatedCostRupees}>
                <Input
                  type="number"
                  min={0}
                  value={d.costRupees || ""}
                  placeholder={String(autoCost)}
                  onChange={(e) => set("costRupees", Number(e.target.value) || 0)}
                />
              </Field>
              <Field id="price" label="Selling price (₹)" error={errors.sellingPriceRupees}>
                <Input
                  type="number"
                  min={0}
                  value={d.priceRupees || ""}
                  onChange={(e) => set("priceRupees", Number(e.target.value) || 0)}
                />
              </Field>
            </div>
          </fieldset>
          {price > 0 && (
            <dl className="bg-muted/40 grid grid-cols-3 gap-2 rounded-lg p-3 text-center text-xs">
              <div>
                <dt className="text-muted-foreground">Margin</dt>
                <dd
                  className={cn(
                    "text-base font-semibold",
                    marginPct(rupeesToPaise(price), rupeesToPaise(cost)) < 20 ? "text-destructive" : "text-success",
                  )}
                >
                  {marginPct(rupeesToPaise(price), rupeesToPaise(cost))}%
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Member price</dt>
                <dd className="text-base font-semibold">{formatINR(suggestedMemberPrice(rupeesToPaise(price)))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Profit / unit</dt>
                <dd className="text-base font-semibold">{formatINR(rupeesToPaise(price - cost))}</dd>
              </div>
            </dl>
          )}
        </section>

        {editable && (
          <div className="grid gap-2">
            <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => save(false)}>
              {busy === "save" && <Loader2Icon className="animate-spin" />}
              Save draft
            </Button>
            {canSubmit && (
              <Button size="lg" disabled={busy !== null} onClick={() => save(true)}>
                {busy === "submit" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                Save & send for review
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export function ReviewPanel({ designId }: { designId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const decide = (decision: "APPROVED" | "REJECTED") =>
    startTransition(async () => {
      const res = await reviewDesign({ designId, decision, note });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });
  return (
    <section className="border-primary/30 bg-primary/5 grid gap-3 rounded-xl border p-4">
      <h2 className="font-medium">Review this design</h2>
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Feedback (required to send back)"
        maxLength={300}
      />
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => decide("APPROVED")}>
          <CheckIcon /> Approve
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide("REJECTED")}>
          <XIcon /> Send back
        </Button>
      </div>
    </section>
  );
}

export function CreateProductButton({ designId }: { designId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await createProductFromDesign({ designId });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
          router.push(`/merch/${res.data.id}`);
        })
      }
    >
      {pending && <Loader2Icon className="animate-spin" />}
      Create product from design
    </Button>
  );
}
