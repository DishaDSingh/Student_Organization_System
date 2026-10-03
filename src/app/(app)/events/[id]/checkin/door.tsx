"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleAlertIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, applyServerErrors } from "@/components/form/field";
import { UserPicker, type PickedUser } from "@/components/form/user-picker";
import { QrScanner, tokenAfter } from "@/components/qr-scanner";
import { cn } from "@/lib/utils";
import { doorSaleSchema } from "@/lib/validation/schemas";
import { PaymentFields } from "../../../members/member-forms";
import { checkInTicket, doorSale, type CheckInResult } from "../../actions";
import { LiveIndicator } from "../live/command-center";
import { useLiveEvent } from "../live/use-live";

export function DoorStation({ eventId, capacity }: { eventId: string; capacity: number }) {
  const { data, connected } = useLiveEvent(eventId);
  const [last, setLast] = useState<CheckInResult | null>(null);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  const check = async (token: string) => {
    const res = await checkInTicket({ code: token });
    if (!res.ok) return void toast.error(res.fieldErrors?.code?.[0] ?? res.error);
    setLast(res.data);
    navigator.vibrate?.(res.data.result === "ADMITTED" ? 60 : [80, 60, 80]);
  };

  const s = data?.stats;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <div className="grid content-start gap-4">
        <QrScanner continuous extract={tokenAfter("t")} onToken={check} hint="Scan ticket QR codes — keeps scanning after each one." />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const token = tokenAfter("t")(code) ?? code.trim();
              await check(token);
              setCode("");
            });
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Or paste / type the ticket code" aria-label="Ticket code" />
          <Button type="submit" variant="secondary" disabled={pending || code.trim().length < 8}>
            {pending && <Loader2Icon className="animate-spin" />}
            Check in
          </Button>
        </form>
      </div>

      <div className="grid content-start gap-6">
        {last && <ResultCard r={last} />}

        <section className="bg-card rounded-xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">At the door</h2>
            <LiveIndicator connected={connected} at={data?.at} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              ["Inside", s?.checkedIn],
              ["Expected", s ? s.sold - s.checkedIn : undefined],
              ["Seats left", s ? capacity - s.sold - s.reserved : undefined],
            ].map(([label, v]) => (
              <div key={label as string} className="bg-muted/40 rounded-lg p-3">
                <p className="text-2xl font-semibold tabular-nums">{v ?? "—"}</p>
                <p className="text-muted-foreground text-xs">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <DoorSaleForm eventId={eventId} types={s?.byType ?? []} />
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: CheckInResult }) {
  const tone = r.result === "ADMITTED" ? "success" : r.result === "ALREADY_IN" ? "warning" : "destructive";
  const Icon = r.result === "ADMITTED" ? CheckCircle2Icon : r.result === "ALREADY_IN" ? CircleAlertIcon : XCircleIcon;
  return (
    <section
      aria-live="assertive"
      className={cn(
        "flex items-center gap-4 rounded-2xl border-2 p-5",
        tone === "success" && "border-success/40 bg-success/8",
        tone === "warning" && "border-warning/50 bg-warning/10",
        tone === "destructive" && "border-destructive/40 bg-destructive/6",
      )}
    >
      <Icon className={cn("size-12 shrink-0", tone === "success" ? "text-success" : tone === "warning" ? "text-amber-600" : "text-destructive")} />
      <div className="min-w-0">
        <p className="text-xl font-semibold">
          {r.result === "ADMITTED" ? "Admit" : r.result === "ALREADY_IN" ? "Already checked in" : "Do not admit"}
        </p>
        {"holderName" in r && r.holderName && (
          <p className="font-medium">
            {r.holderName}
            {"ticketType" in r && <span className="text-muted-foreground font-normal"> · {r.ticketType}</span>}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          {r.result === "ADMITTED" && (r.isMemberPrice ? "Member ticket — check their member pass if unsure." : "Welcome in.")}
          {r.result === "ALREADY_IN" && `Entered at ${new Date(r.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}${r.by ? ` via ${r.by}` : ""}. Possible shared ticket.`}
          {r.result === "REJECTED" && r.reason}
        </p>
      </div>
    </section>
  );
}

function DoorSaleForm({ eventId, types }: { eventId: string; types: { id: string; name: string; quantity: number; allocated: number }[] }) {
  const router = useRouter();
  const [member, setMember] = useState<PickedUser | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof doorSaleSchema>>({
    resolver: zodResolver(doorSaleSchema),
    mode: "onTouched",
    defaultValues: { eventId, memberId: "", buyerName: "", buyerPhone: "", lines: [], method: "CASH", reference: "" },
  });
  const method = useWatch({ control: form.control, name: "method" });
  const e = form.formState.errors;

  return (
    <section className="bg-card rounded-xl border p-5">
      <h2 className="font-medium">Sell at the door</h2>
      <p className="text-muted-foreground text-sm">Pick a member to apply member pricing to their own ticket.</p>
      <form
        noValidate
        className="mt-4 grid gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            const res = await doorSale({ ...values, lines: Object.entries(qty).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })) });
            if (!res.ok) {
              applyServerErrors(res.fieldErrors, form.setError);
              return void toast.error(res.fieldErrors?.lines?.[0] ?? res.error);
            }
            toast.success(res.message);
            setQty({});
            setMember(null);
            form.reset({ eventId, memberId: "", buyerName: "", buyerPhone: "", lines: [], method: "CASH", reference: "" });
            router.refresh();
          }),
        )}
      >
        <Field id="door-member" label="Member (optional)">
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
            <Field id="door-name" label="Buyer name" required error={e.buyerName?.message}>
              <Input {...form.register("buyerName")} />
            </Field>
            <Field id="door-phone" label="Mobile" error={e.buyerPhone?.message}>
              <Input type="tel" inputMode="tel" {...form.register("buyerPhone")} />
            </Field>
          </div>
        )}
        <div className="grid gap-2">
          {types.map((t) => (
            <label key={t.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1">
                {t.name} <span className="text-muted-foreground text-xs">({Math.max(0, t.quantity - t.allocated)} left)</span>
              </span>
              <Input
                type="number"
                min={0}
                max={10}
                className="w-20"
                value={qty[t.id] ?? 0}
                onChange={(ev) => setQty((q) => ({ ...q, [t.id]: Math.max(0, Math.min(10, Number(ev.target.value) || 0)) }))}
                aria-label={`${t.name} quantity`}
              />
            </label>
          ))}
        </div>
        <PaymentFields register={form.register as never} errors={e} method={method} />
        <Button type="submit" disabled={pending || !Object.values(qty).some(Boolean)}>
          {pending && <Loader2Icon className="animate-spin" />}
          Record sale
        </Button>
        <p className="text-muted-foreground text-xs">The price is worked out on the server from the buyer&apos;s current membership; the total appears in the confirmation.</p>
      </form>
    </section>
  );
}
