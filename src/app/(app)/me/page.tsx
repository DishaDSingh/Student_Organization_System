import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdCardIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { MemberStateBadge, QrImage } from "@/components/membership";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { formatINR } from "@/lib/membership/rules";
import { loadMember } from "@/lib/membership/load";
import { qrSvg, upiUri } from "@/lib/qr";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/schemas";
import { ChoosePlan, ReferenceForm } from "./me-forms";

export const metadata: Metadata = { title: "My membership" };

export default async function MyMembershipPage() {
  const user = await requireUser();
  const [m, org, plans] = await Promise.all([
    loadMember(user.id),
    db.organization.findFirst({ select: { name: true, shortName: true, upiId: true } }),
    db.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        pricePaise: true,
        durationMonths: true,
        description: true,
        benefits: { where: { benefit: { isActive: true } }, select: { benefit: { select: { title: true } } } },
      },
    }),
  ]);
  if (!m || !org) notFound();
  const s = m.standing;
  const planOptions = plans.map((p) => ({ ...p, benefits: p.benefits.map((b) => b.benefit.title) }));

  const upiQr =
    s.pending && org.upiId
      ? await qrSvg(
          upiUri({
            upiId: org.upiId,
            payee: org.name,
            amountPaise: s.pending.pricePaise,
            note: `${org.shortName} ${s.pending.plan.name} ${m.studentId ?? m.email}`,
          }),
        )
      : null;

  const canRenew = !s.pending && !s.upcoming && (s.state !== "ACTIVE" || (s.daysLeft ?? 999) <= 60);

  return (
    <>
      <PageHeader
        title="My membership"
        description={org.name}
        actions={
          m.passToken && (
            <Button asChild>
              <Link href="/me/pass">
                <IdCardIcon /> Show my pass
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <section className="bg-card rounded-xl border p-5">
            <div className="flex flex-wrap items-center gap-3">
              <MemberStateBadge state={s.state} />
              {m.memberNumber && <span className="text-muted-foreground font-mono text-sm">{m.memberNumber}</span>}
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              {s.state === "ACTIVE" || s.state === "EXPIRING"
                ? `Valid until ${fmtDate(s.validUntil)}`
                : s.state === "PENDING"
                  ? `${formatINR(s.pending!.pricePaise)} to pay`
                  : s.state === "EXPIRED"
                    ? `Expired on ${fmtDate(s.term?.endDate)}`
                    : "You're not a member yet"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {s.state === "EXPIRING" && `${s.daysLeft} days left — renew now and the new term starts when this one ends.`}
              {s.state === "ACTIVE" && s.upcoming && `Renewed — ${s.upcoming.plan.name} starts ${fmtDate(s.upcoming.startDate)}.`}
              {s.state === "ACTIVE" && !s.upcoming && `${s.term?.plan.name} · ${s.daysLeft} days left`}
              {s.state === "PENDING" && `Your ${s.pending!.plan.name} membership activates as soon as the payment is confirmed.`}
              {s.state === "EXPIRED" && "Renew to get your benefits and member pricing back."}
              {s.state === "NONE" && "Join to get member pricing on tickets and merch, plus the benefits below."}
            </p>
          </section>

          {s.pending && (
            <Section title="Complete your payment" description="Pay by UPI, or in cash at the student council desk.">
              <div className="grid gap-6 sm:grid-cols-[12rem_1fr]">
                {upiQr ? (
                  <div className="grid content-start gap-2 text-center">
                    <QrImage svg={upiQr} label={`UPI payment QR for ${formatINR(s.pending.pricePaise)}`} />
                    <p className="text-muted-foreground text-xs">
                      Scan with any UPI app · <span className="font-mono">{org.upiId}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Pay at the desk; UPI isn&apos;t set up for this organization yet.</p>
                )}
                <div className="grid content-start gap-4">
                  {s.pending.claimedReference && (
                    <p className="bg-info/10 text-info rounded-lg px-3 py-2 text-sm">
                      Reference <span className="font-mono">{s.pending.claimedReference}</span> submitted — waiting for the treasurer to
                      confirm.
                    </p>
                  )}
                  <ReferenceForm membershipId={s.pending.id} current={s.pending.claimedReference} />
                </div>
              </div>
            </Section>
          )}

          {canRenew && planOptions.length > 0 && (
            <Section title={s.state === "NONE" ? "Choose a plan" : "Renew"}>
              <ChoosePlan plans={planOptions} cta={s.state === "NONE" ? "Join" : "Renew"} />
            </Section>
          )}

          <Section title="Payments & receipts">
            {m.paymentsMade.length ? (
              <ul className="divide-y text-sm">
                {m.paymentsMade.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-4 py-2.5 first:pt-0 last:pb-0">
                    <span className="font-mono text-xs">{p.receiptNumber}</span>
                    <span className="text-muted-foreground flex-1">{PAYMENT_METHOD_LABEL[p.method]}</span>
                    <span className="text-muted-foreground">{fmtDate(p.paidAt)}</span>
                    <span className="font-medium tabular-nums">{formatINR(p.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No payments yet.</p>
            )}
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="My benefits">
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
          <Section title="History">
            <ol className="grid gap-2 text-sm">
              {m.memberships
                .filter((t) => t.status === "ACTIVE")
                .map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span>{t.plan.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {fmtDate(t.startDate)} – {fmtDate(t.endDate)}
                    </span>
                  </li>
                ))}
              {!m.memberships.some((t) => t.status === "ACTIVE") && <li className="text-muted-foreground">No terms yet.</li>}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}
