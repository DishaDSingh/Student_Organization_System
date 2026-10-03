"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import {
  eventScenario,
  merchScenario,
  spendScenario,
  type EventSnapshot,
  type MerchSnapshot,
  type Outcome,
  type SpendSnapshot,
} from "@/lib/simulate/model";

// ─── Shared ──────────────────────────────────────────────────────────────────

function fmt(v: number, unit: Outcome["unit"]) {
  if (unit === "inr") return formatINR(Math.round(v / 100) * 100); // whole rupees — this is an estimate
  if (unit === "pct") return `${v}%`;
  if (unit === "months") return Number.isFinite(v) ? `${v.toFixed(1)} months` : "Not running down";
  return Math.round(v).toLocaleString("en-IN");
}

/** "Lower is better" rows (costs) flip the colour of the change. */
const LOWER_IS_BETTER = /cost|used|reorder/i;

function Compare({ rows }: { rows: Outcome[] }) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
          <tr>
            <th className="px-4 py-2 font-medium">Result</th>
            <th className="px-4 py-2 text-right font-medium">Today&apos;s course</th>
            <th className="px-4 py-2 text-right font-medium">Your scenario</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const diff = (Number.isFinite(r.scenario) ? r.scenario : 1e12) - (Number.isFinite(r.baseline) ? r.baseline : 1e12);
            const better = LOWER_IS_BETTER.test(r.label) ? diff < 0 : diff > 0;
            return (
              <tr key={r.label}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">{fmt(r.baseline, r.unit)}</td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-medium tabular-nums",
                    diff !== 0 && (better ? "text-success" : "text-destructive"),
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {diff === 0 ? (
                      <ArrowRightIcon className="text-muted-foreground size-3.5" />
                    ) : diff > 0 ? (
                      <ArrowUpRightIcon className="size-3.5" />
                    ) : (
                      <ArrowDownRightIcon className="size-3.5" />
                    )}
                    {fmt(r.scenario, r.unit)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  show,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  show: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="flex justify-between text-sm font-medium">
        {label} <span className="text-primary tabular-nums">{show}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary w-full"
      />
    </div>
  );
}

const Facts = ({ items }: { items: [string, string][] }) => (
  <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
    {items.map(([k, v]) => (
      <div key={k} className="contents">
        <dt>{k}</dt>
        <dd className="text-foreground text-right tabular-nums">{v}</dd>
      </div>
    ))}
  </dl>
);

// ─── Event ───────────────────────────────────────────────────────────────────

export function EventSim({
  events,
  eventId,
  snapshot: s,
}: {
  events: { id: string; title: string }[];
  eventId: string;
  snapshot: EventSnapshot;
}) {
  const router = useRouter();
  const initial = { pricePct: 0, capacity: s.capacity, elasticity: 0.8, extraCostPaise: 0, perHeadCostPaise: 0 };
  const [a, setA] = useState(initial);
  const rows = eventScenario(s, a);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="bg-card grid content-start gap-5 rounded-xl border p-4 sm:p-5 lg:col-span-2">
        <Field id="sim-event" label="Event">
          <NativeSelect value={eventId} onChange={(e) => router.push(`/simulate?tab=event&event=${e.target.value}`, { scroll: false })}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Slider
          id="sim-price"
          label="Ticket price change"
          value={a.pricePct}
          min={-50}
          max={100}
          step={5}
          show={`${a.pricePct > 0 ? "+" : ""}${a.pricePct}% (avg ${formatINR(Math.round(s.avgPricePaise * (1 + a.pricePct / 100)))})`}
          onChange={(v) => setA({ ...a, pricePct: v })}
        />
        <Slider
          id="sim-cap"
          label="Capacity"
          value={a.capacity}
          min={Math.max(1, s.sold)}
          max={Math.max(s.capacity * 2, s.sold + 10)}
          step={5}
          show={`${a.capacity} seats`}
          onChange={(v) => setA({ ...a, capacity: v })}
        />
        <Field id="sim-extra" label="Extra one-off cost (₹)" hint="e.g. a bigger venue or extra security">
          <Input
            type="number"
            min={0}
            step={1000}
            value={a.extraCostPaise / 100}
            onChange={(e) => setA({ ...a, extraCostPaise: Math.max(0, Number(e.target.value) || 0) * 100 })}
          />
        </Field>
        <Field id="sim-head" label="Cost per attendee (₹)" hint="Food, wristbands… multiplied by expected attendance">
          <Input
            type="number"
            min={0}
            step={10}
            value={a.perHeadCostPaise / 100}
            onChange={(e) => setA({ ...a, perHeadCostPaise: Math.max(0, Number(e.target.value) || 0) * 100 })}
          />
        </Field>
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">Model assumptions</summary>
          <div className="mt-3 grid gap-3">
            <Slider
              id="sim-el"
              label="Price sensitivity"
              value={a.elasticity}
              min={0}
              max={2}
              step={0.1}
              show={a.elasticity.toFixed(1)}
              onChange={(v) => setA({ ...a, elasticity: v })}
            />
            <p className="text-muted-foreground text-xs">
              At {a.elasticity.toFixed(1)}, a 10% price rise means about {Math.round(a.elasticity * 10)}% fewer future sales. Tickets
              already sold keep their price.
            </p>
            <Facts
              items={[
                ["Sold so far", String(s.sold)],
                ["Recent pace", `${s.perDay}/day`],
                ["Days of sales left", String(s.daysLeft)],
                ["Past attendance rate", `${Math.round(s.attendanceRate * 100)}%`],
                ["Costs so far", formatINR(s.fixedCostPaise)],
              ]}
            />
          </div>
        </details>
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setA(initial)}>
          <RotateCcwIcon /> Reset
        </Button>
      </div>
      <div className="lg:col-span-3">
        <Compare rows={rows} />
      </div>
    </div>
  );
}

// ─── Spending ────────────────────────────────────────────────────────────────

export function SpendSim({ snapshot: s }: { snapshot: SpendSnapshot }) {
  const [extra, setExtra] = useState(20000);
  const [category, setCategory] = useState(s.budgets[0]?.category ?? "");
  const rows = spendScenario(s, { extraPaise: extra * 100, category });
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="bg-card grid content-start gap-5 rounded-xl border p-4 sm:p-5 lg:col-span-2">
        <Slider
          id="sim-spend"
          label="Spend this much more"
          value={extra}
          min={0}
          max={200000}
          step={1000}
          show={formatINR(extra * 100)}
          onChange={setExtra}
        />
        {s.budgets.length > 0 && (
          <Field id="sim-cat" label="On which budget?">
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
              {s.budgets.map((b) => (
                <option key={b.category}>{b.category}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Facts
          items={[
            ["Balance today", formatINR(s.balancePaise)],
            ["Avg. monthly income", formatINR(s.avgMonthlyInPaise)],
            ["Avg. monthly spending", formatINR(s.avgMonthlyOutPaise)],
          ]}
        />
        <p className="text-muted-foreground text-xs">
          Averages are from the last 6 months. Runway assumes income and spending carry on at those rates.
        </p>
      </div>
      <div className="lg:col-span-3">
        <Compare rows={rows} />
      </div>
    </div>
  );
}

// ─── Merch ───────────────────────────────────────────────────────────────────

export function MerchSim({ snapshot: s }: { snapshot: MerchSnapshot }) {
  const hoodie = s.products.find((p) => /hoodie/i.test(p.name)) ?? s.products[0];
  const [productId, setProductId] = useState(hoodie.id);
  const product = s.products.find((p) => p.id === productId)!;
  const [units, setUnits] = useState(100);
  const [price, setPrice] = useState(product.pricePaise / 100);
  const { outcomes, reorder } = merchScenario(s, { productId, extraUnits: units, pricePaise: price * 100 });
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="bg-card grid content-start gap-5 rounded-xl border p-4 sm:p-5 lg:col-span-2">
        <Field id="sim-product" label="Product">
          <NativeSelect
            value={productId}
            onChange={(e) => {
              const p = s.products.find((x) => x.id === e.target.value)!;
              setProductId(p.id);
              setPrice(p.pricePaise / 100);
            }}
          >
            {s.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Slider
          id="sim-units"
          label="Sell this many more"
          value={units}
          min={0}
          max={500}
          step={10}
          show={`${units} items`}
          onChange={setUnits}
        />
        <Field id="sim-mprice" label="At price (₹)">
          <Input type="number" min={0} step={50} value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Facts
          items={[
            ["In stock now", String(product.stock)],
            ["Cost per item", formatINR(product.unitCostPaise)],
            ["Margin per item", formatINR(price * 100 - product.unitCostPaise)],
          ]}
        />
        {reorder > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            You&apos;d need to order {reorder} more — check the supplier&apos;s lead time.
          </p>
        )}
      </div>
      <div className="lg:col-span-3">
        <Compare rows={outcomes} />
      </div>
    </div>
  );
}
