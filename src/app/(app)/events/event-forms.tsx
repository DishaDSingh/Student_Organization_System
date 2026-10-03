"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { BanIcon, CheckIcon, Loader2Icon, MinusIcon, PencilIcon, PlusIcon, RocketIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Field, NativeSelect, applyServerErrors } from "@/components/form/field";
import { UserPicker, type PickedUser } from "@/components/form/user-picker";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { EVENT_CATEGORIES } from "@/lib/events/rules";
import {
  cancelEventSchema,
  confirmOrderSchema,
  eventSchema,
  incidentSchema,
  ticketTypeSchema,
  voidOrderSchema,
} from "@/lib/validation/schemas";
import { PaymentFields } from "../members/member-forms";
import {
  buyTickets,
  cancelEvent,
  cancelMyOrder,
  confirmOrder,
  publishEvent,
  reportIncident,
  resolveIncident,
  saveEvent,
  saveTicketType,
  voidTicketOrder,
} from "./actions";

// ─── Event form ──────────────────────────────────────────────────────────────

type EventDefaults = {
  eventId?: string;
  title: string;
  description: string;
  category: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity: number | string;
  salesOpenAt: string;
  salesCloseAt: string;
  organizer: PickedUser | null;
  committeeId: string;
};

export function EventForm({ defaults, committees }: { defaults: EventDefaults; committees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [organizer, setOrganizer] = useState<PickedUser | null>(defaults.organizer);
  const form = useForm<z.input<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    mode: "onTouched",
    defaultValues: { ...defaults, eventId: defaults.eventId ?? "", organizerId: defaults.organizer?.id ?? "" } as z.input<
      typeof eventSchema
    >,
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveEvent(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      router.push(`/events/${res.data.id}`);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="bg-card grid content-start gap-4 rounded-xl border p-4 sm:p-5">
        <Field id="title" label="Title" required error={e.title?.message}>
          <Input placeholder="Diwali Gala Night 2026" {...form.register("title")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="category" label="Category" required error={e.category?.message}>
            <NativeSelect {...form.register("category")}>
              <option value="">Choose…</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="venue" label="Venue" required error={e.venue?.message}>
            <Input placeholder="Main Auditorium" {...form.register("venue")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="startsAt" label="Starts" required error={e.startsAt?.message}>
            <Input type="datetime-local" {...form.register("startsAt")} />
          </Field>
          <Field id="endsAt" label="Ends" required error={e.endsAt?.message}>
            <Input type="datetime-local" {...form.register("endsAt")} />
          </Field>
        </div>
        <Field id="description" label="Description" error={e.description?.message}>
          <Textarea
            rows={6}
            placeholder="What should people expect? Dress code, schedule, what's included…"
            {...form.register("description")}
          />
        </Field>
      </section>

      <aside className="grid content-start gap-4">
        <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
          <Field id="capacity" label="Capacity" required hint="Total seats across all ticket types" error={e.capacity?.message}>
            <Input type="number" inputMode="numeric" min={1} {...form.register("capacity")} />
          </Field>
          <Field id="salesOpenAt" label="Sales open" hint="Leave empty to open on publish" error={e.salesOpenAt?.message}>
            <Input type="datetime-local" {...form.register("salesOpenAt")} />
          </Field>
          <Field id="salesCloseAt" label="Sales close" hint="Leave empty to sell until it ends" error={e.salesCloseAt?.message}>
            <Input type="datetime-local" {...form.register("salesCloseAt")} />
          </Field>
        </section>
        <section className="bg-card grid gap-4 rounded-xl border p-4 sm:p-5">
          <Controller
            control={form.control}
            name="organizerId"
            render={({ field }) => (
              <Field id="organizer" label="Organizer" error={e.organizerId?.message}>
                <UserPicker
                  value={organizer}
                  onChange={(u) => {
                    setOrganizer(u);
                    field.onChange(u?.id ?? "");
                  }}
                  placeholder="You"
                />
              </Field>
            )}
          />
          <Field id="committeeId" label="Committee" error={e.committeeId?.message}>
            <NativeSelect {...form.register("committeeId")}>
              <option value="">None</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </section>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {defaults.eventId ? "Save event" : "Create draft"}
        </Button>
      </aside>
    </form>
  );
}

// ─── Ticket types ────────────────────────────────────────────────────────────

type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  memberPricePaise: number;
  publicPricePaise: number;
  quantity: number;
  allocated: number;
  maxPerOrder: number;
  membersOnly: boolean;
  isActive: boolean;
};

export function TicketTypeDialog({ eventId, type }: { eventId: string; type?: TicketTypeRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof ticketTypeSchema>>({
    resolver: zodResolver(ticketTypeSchema),
    mode: "onTouched",
    defaultValues: {
      ticketTypeId: type?.id ?? "",
      eventId,
      name: type?.name ?? "",
      description: type?.description ?? "",
      memberPriceRupees: type ? type.memberPricePaise / 100 : "",
      publicPriceRupees: type ? type.publicPricePaise / 100 : "",
      quantity: type?.quantity ?? "",
      maxPerOrder: type?.maxPerOrder ?? 4,
      membersOnly: type?.membersOnly ?? false,
      isActive: type?.isActive ?? true,
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveTicketType(values);
      if (!res.ok) {
        applyServerErrors(res.fieldErrors, form.setError);
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!type) form.reset();
      router.refresh();
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {type ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${type.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon /> Ticket type
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{type ? `Edit ${type.name}` : "New ticket type"}</DialogTitle>
            <DialogDescription>Active members pay the member price for one ticket per event — their own.</DialogDescription>
          </DialogHeader>
          <Field id="tt-name" label="Name" required error={e.name?.message}>
            <Input placeholder="General admission" {...form.register("name")} />
          </Field>
          <Field id="tt-desc" label="What's included" error={e.description?.message}>
            <Input placeholder="Entry + dinner" {...form.register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="tt-member" label="Member price (₹)" required error={e.memberPriceRupees?.message}>
              <Input type="number" inputMode="decimal" step="0.01" min={0} {...form.register("memberPriceRupees")} />
            </Field>
            <Field id="tt-public" label="Non-member price (₹)" required error={e.publicPriceRupees?.message}>
              <Input type="number" inputMode="decimal" step="0.01" min={0} {...form.register("publicPriceRupees")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="tt-qty"
              label="Quantity"
              required
              hint={type ? `${type.allocated} sold or held` : undefined}
              error={e.quantity?.message}
            >
              <Input type="number" inputMode="numeric" min={1} {...form.register("quantity")} />
            </Field>
            <Field id="tt-max" label="Max per order" error={e.maxPerOrder?.message}>
              <Input type="number" inputMode="numeric" min={1} max={10} {...form.register("maxPerOrder")} />
            </Field>
          </div>
          {(["membersOnly", "isActive"] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{name === "membersOnly" ? "Members only" : "On sale"}</span>
                    <span className="text-muted-foreground block">
                      {name === "membersOnly" ? "Only active members can buy, one each" : "Turn off to pause sales of this type"}
                    </span>
                  </span>
                  <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          ))}
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

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function PublishButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={pending}>
          <RocketIcon /> Publish
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish and open ticket sales?</AlertDialogTitle>
          <AlertDialogDescription>
            The event becomes visible to every member and tickets go on sale (from the sales-open time, if set).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const res = await publishEvent({ eventId });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message);
                router.refresh();
              })
            }
          >
            Publish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReasonDialog<S extends typeof cancelEventSchema | typeof voidOrderSchema>({
  trigger,
  title,
  description,
  confirmLabel,
  schema,
  defaults,
  submit,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  schema: S;
  defaults: z.input<S>;
  submit: (v: z.input<S>) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<{ reason: string }>({ resolver: zodResolver(schema as never), mode: "onTouched", defaultValues: defaults as never });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await submit(values as z.input<S>);
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              setOpen(false);
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Field id="reason" label="Reason" required error={form.formState.errors.reason?.message}>
            <Input {...form.register("reason")} />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelEventDialog({ eventId }: { eventId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="destructive">
          <BanIcon /> Cancel event
        </Button>
      }
      title="Cancel this event?"
      description="Unpaid orders are voided and their seats released. Ticket holders are notified; paid orders stay listed for the treasurer to refund."
      confirmLabel="Cancel event"
      schema={cancelEventSchema}
      defaults={{ eventId, reason: "" }}
      submit={cancelEvent}
    />
  );
}

export function VoidOrderButton({ orderId, paid }: { orderId: string; paid: boolean }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={paid ? "Refund order" : "Cancel order"}>
          <XIcon />
        </Button>
      }
      title={paid ? "Refund this order?" : "Cancel this unpaid order?"}
      description={
        paid ? "Marks the payment refunded and releases the seats. Hand the money back before confirming." : "Releases the held seats."
      }
      confirmLabel={paid ? "Refund" : "Cancel order"}
      schema={voidOrderSchema}
      defaults={{ orderId, reason: "" }}
      submit={voidTicketOrder}
    />
  );
}

export function ConfirmOrderDialog({
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
  const form = useForm<z.input<typeof confirmOrderSchema>>({
    resolver: zodResolver(confirmOrderSchema),
    mode: "onTouched",
    defaultValues: { orderId, method: claimedReference ? "UPI" : "CASH", reference: claimedReference ?? "" },
  });
  const method = useWatch({ control: form.control, name: "method" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Confirm payment">
          <CheckIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await confirmOrder(values);
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
            <DialogDescription>
              Tickets become valid for entry.{claimedReference && " Check the buyer's reference against your statement first."}
            </DialogDescription>
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

// ─── Buying ──────────────────────────────────────────────────────────────────

type BuyType = {
  id: string;
  name: string;
  description: string | null;
  memberPricePaise: number;
  publicPricePaise: number;
  remaining: number;
  maxPerOrder: number;
  membersOnly: boolean;
};

export function BuyTicketsPanel({
  eventId,
  types,
  memberPriceAvailable,
}: {
  eventId: string;
  types: BuyType[];
  memberPriceAvailable: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();

  // Mirror the server's pricing so the total is right before submitting.
  let memberSlot = memberPriceAvailable;
  const ranked = [...types].sort((a, b) => b.publicPricePaise - b.memberPricePaise - (a.publicPricePaise - a.memberPricePaise));
  let total = 0;
  for (const t of ranked) {
    for (let i = 0; i < (qty[t.id] ?? 0); i++) {
      total += memberSlot ? t.memberPricePaise : t.publicPricePaise;
      memberSlot = false;
    }
  }
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-3">
      {types.map((t) => {
        const n = qty[t.id] ?? 0;
        const max = Math.min(t.maxPerOrder, t.remaining, t.membersOnly ? 1 : 10);
        const locked = t.membersOnly && !memberPriceAvailable;
        return (
          <div key={t.id} className={cn("flex items-center gap-3 rounded-lg border p-3", locked && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {t.name}
                {t.membersOnly && <span className="text-primary ml-2 text-xs">Members only</span>}
              </p>
              {t.description && <p className="text-muted-foreground text-xs">{t.description}</p>}
              <p className="mt-1 text-sm">
                {memberPriceAvailable && t.memberPricePaise < t.publicPricePaise ? (
                  <>
                    <span className="font-semibold">{formatINR(t.memberPricePaise)}</span>{" "}
                    <span className="text-muted-foreground text-xs line-through">{formatINR(t.publicPricePaise)}</span>{" "}
                    <span className="text-success text-xs">member price</span>
                  </>
                ) : (
                  <span className="font-semibold">{t.publicPricePaise ? formatINR(t.publicPricePaise) : "Free"}</span>
                )}
                {t.remaining <= 20 && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">{t.remaining} left</span>}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`One fewer ${t.name}`}
                disabled={!n}
                onClick={() => setQty((q) => ({ ...q, [t.id]: n - 1 }))}
              >
                <MinusIcon />
              </Button>
              <span className="w-6 text-center tabular-nums" aria-live="polite">
                {n}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`One more ${t.name}`}
                disabled={locked || n >= max || count >= 10}
                onClick={() => setQty((q) => ({ ...q, [t.id]: n + 1 }))}
              >
                <PlusIcon />
              </Button>
            </div>
          </div>
        );
      })}
      {memberPriceAvailable && (
        <p className="text-muted-foreground text-xs">
          Member price applies to one ticket — yours. Extra tickets are at the non-member price.
        </p>
      )}
      <Button
        size="lg"
        disabled={!count || pending}
        onClick={() =>
          startTransition(async () => {
            const res = await buyTickets({
              eventId,
              lines: Object.entries(qty).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
            });
            if (!res.ok) return void toast.error(res.error);
            toast.success(res.message);
            setQty({});
            router.push("/me/tickets");
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {count ? `Get ${count} ticket${count > 1 ? "s" : ""} — ${total ? formatINR(total) : "Free"}` : "Choose tickets"}
      </Button>
    </div>
  );
}

export function CancelMyOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelMyOrder({ orderId });
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

// ─── Incidents ───────────────────────────────────────────────────────────────

export function IncidentDialog({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof incidentSchema>>({
    resolver: zodResolver(incidentSchema),
    mode: "onTouched",
    defaultValues: { eventId, title: "", details: "", severity: "LOW", location: "" },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <TriangleAlertIcon /> Log incident
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const res = await reportIncident(values);
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.message);
              setOpen(false);
              form.reset();
              router.refresh();
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Log an incident</DialogTitle>
            <DialogDescription>Timestamped and visible in the command center.</DialogDescription>
          </DialogHeader>
          <Field id="i-title" label="What happened?" required error={e.title?.message}>
            <Input placeholder="Long queue at Gate B" {...form.register("title")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="i-sev" label="Severity">
              <NativeSelect {...form.register("severity")}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </NativeSelect>
            </Field>
            <Field id="i-loc" label="Where" error={e.location?.message}>
              <Input placeholder="Gate B" {...form.register("location")} />
            </Field>
          </div>
          <Field id="i-details" label="Details" error={e.details?.message}>
            <Textarea rows={3} {...form.register("details")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Log incident
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResolveIncidentButton({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve incident</DialogTitle>
          <DialogDescription>Note what was done — it&apos;s kept for the post-event report.</DialogDescription>
        </DialogHeader>
        <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Opened a second queue" />
        <DialogFooter>
          <Button
            disabled={pending || resolution.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                const res = await resolveIncident({ incidentId, resolution });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Mark resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
