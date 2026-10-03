import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarDaysIcon, HandHeartIcon, IdCardIcon, ReceiptIcon, UsersRoundIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { EmptyState, Section } from "@/components/common";
import { MemberStateBadge, QrImage } from "@/components/membership";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { loadMember } from "@/lib/membership/load";
import { qrSvg } from "@/lib/qr";
import { RotatePassButton } from "../../members/member-forms";
import { LiveClock } from "./live-clock";

export const metadata: Metadata = { title: "My pass" };

export default async function MyPassPage() {
  const user = await requireUser();
  const [m, org] = await Promise.all([loadMember(user.id), db.organization.findFirst({ select: { name: true, shortName: true } })]);
  if (!m || !org) notFound();

  if (!m.passToken) {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState icon={IdCardIcon} title="No pass yet">
          Your digital pass appears once your first membership payment is confirmed.{" "}
          <Link href="/me" className="text-primary hover:underline">
            Go to My membership
          </Link>
        </EmptyState>
      </div>
    );
  }

  // The QR encodes an absolute URL so any phone camera can open it on the door device.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const svg = await qrSvg(`${origin}/verify/${m.passToken}`);
  const s = m.standing;
  const valid = s.state === "ACTIVE" || s.state === "EXPIRING";
  const totalPaid = m.paymentsMade.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.amountPaise, 0);

  return (
    <div className="mx-auto grid max-w-md gap-6">
      {/* The pass itself: one glance tells the door volunteer everything. */}
      <article className="bg-card overflow-hidden rounded-2xl border shadow-sm" aria-label="Digital member pass">
        <div className={cn("h-1.5", valid ? "bg-success" : s.state === "PENDING" ? "bg-info" : "bg-destructive")} />
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{org.name}</p>
            <LiveClock />
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-tight">{m.name}</p>
          <p className="text-muted-foreground text-sm">
            {m.program ?? "Member"}
            {m.yearOfStudy && ` · Year ${m.yearOfStudy}`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MemberStateBadge state={s.state} className="text-sm" />
            <span className="text-sm">{s.term?.plan.name}</span>
          </div>

          <div className="mx-auto mt-5 w-full max-w-64">
            <QrImage svg={svg} label="Member pass QR code — show this at the door" className={cn(!valid && "opacity-40")} />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Member no.</dt>
              <dd className="font-mono font-medium">{m.memberNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Roll no.</dt>
              <dd className="font-medium">{m.studentId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{valid ? "Valid until" : "Ended"}</dt>
              <dd className="font-medium">{fmtDate(s.validUntil ?? s.term?.endDate)}</dd>
            </div>
          </dl>
        </div>
      </article>

      {!valid && (
        <Button asChild size="lg">
          <Link href="/me">{s.state === "PENDING" ? "Complete payment" : "Renew membership"}</Link>
        </Button>
      )}

      <Section title="Eligible benefits">
        {m.benefits.length ? (
          <ul className="grid gap-2 text-sm">
            {m.benefits.map((b) => (
              <li key={b.id}>
                <p className="font-medium">{b.title}</p>
                {b.description && <p className="text-muted-foreground text-xs">{b.description}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Benefits apply while your membership is active.</p>
        )}
      </Section>

      <Section title="My history">
        <ul className="grid gap-4 text-sm">
          <li className="flex gap-3">
            <CalendarDaysIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Events</span>
              <span className="text-muted-foreground block">Events you attend will appear here once ticketing is live.</span>
            </span>
          </li>
          <li className="flex gap-3">
            <HandHeartIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Volunteering</span>
              <span className="text-muted-foreground block">Shifts and tasks you complete will appear here.</span>
            </span>
          </li>
          <li className="flex gap-3">
            <UsersRoundIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Committees</span>
              <span className="text-muted-foreground block">
                {m.committees.length ? m.committees.map((c) => `${c.position}, ${c.committee.name}`).join(" · ") : "None yet"}
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <ReceiptIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Contributions</span>
              <span className="text-muted-foreground block">
                {formatINR(totalPaid)} in dues across {m.paymentsMade.length} payment{m.paymentsMade.length === 1 ? "" : "s"} · member since{" "}
                {fmtDate(m.memberships.filter((t) => t.startDate).at(-1)?.startDate)}
              </span>
            </span>
          </li>
        </ul>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">Pass shared or phone lost?</p>
        <RotatePassButton userId={m.id} self />
      </div>
    </div>
  );
}
