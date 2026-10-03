import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { MemberStateBadge } from "@/components/membership";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import { formatINR, termState } from "@/lib/membership/rules";
import { canCollectDues, loadMember } from "@/lib/membership/load";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/schemas";
import { CancelMembershipDialog, ConfirmPaymentDialog, MemberProfileForm, RenewDialog, RotatePassButton } from "../member-forms";

export const metadata: Metadata = { title: "Member" };

const RESULT_LABEL: Record<string, string> = {
  VALID: "Valid",
  EXPIRED: "Expired",
  PENDING: "Payment pending",
  CANCELLED: "Cancelled",
  NOT_MEMBER: "Not a member",
  INVALID_PASS: "Invalid pass",
};

export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const actor = await requirePermission("members.view");
  const { id } = await props.params;
  const m = await loadMember(id);
  if (!m) notFound();

  const [plans, verifications] = await Promise.all([
    db.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, pricePaise: true, durationMonths: true, description: true },
    }),
    db.passVerification.findMany({
      where: { memberId: id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, result: true, method: true, createdAt: true, verifiedBy: { select: { name: true } } },
    }),
  ]);

  const s = m.standing;
  const collect = canCollectDues(actor);
  const edit = can(actor, "members.edit");

  return (
    <>
      <PageHeader
        back={{ href: "/members", label: "Members" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {m.name}
            <MemberStateBadge state={s.state} />
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-mono">{m.memberNumber ?? "No member number yet"}</span>
            <span>{m.email}</span>
            {m.studentId && <span>{m.studentId}</span>}
          </span>
        }
        actions={
          <>
            {can(actor, "users.view") && (
              <Link href={`/admin/users/${m.id}`} className="text-primary self-center text-sm hover:underline">
                Account & roles
              </Link>
            )}
            {collect && s.pending && (
              <ConfirmPaymentDialog
                membershipId={s.pending.id}
                amountPaise={s.pending.pricePaise}
                planName={s.pending.plan.name}
                claimedReference={s.pending.claimedReference}
              />
            )}
            {collect && !s.pending && s.state !== "NONE" && plans.length > 0 && (
              <RenewDialog userId={m.id} plans={plans} defaultPlanId={s.term?.plan.id} />
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          {/* Headline: the one thing the desk needs to know. */}
          <section className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-3 sm:p-5">
            <div>
              <p className="text-muted-foreground text-sm">Standing</p>
              <p className="mt-1 text-lg font-semibold">
                {s.state === "PENDING"
                  ? `${formatINR(s.pending!.pricePaise)} due`
                  : s.state === "NONE"
                    ? "Never joined"
                    : s.state === "EXPIRED"
                      ? `Lapsed ${fmtRelative(s.term?.endDate)}`
                      : `${s.daysLeft} days left`}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Plan</p>
              <p className="mt-1 text-lg font-semibold">{s.term?.plan.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Covered until</p>
              <p className="mt-1 text-lg font-semibold">{fmtDate(s.validUntil ?? s.term?.endDate)}</p>
              {s.upcoming && <p className="text-muted-foreground text-xs">includes a renewal starting {fmtDate(s.upcoming.startDate)}</p>}
            </div>
            {s.pending?.claimedReference && (
              <p className="bg-info/10 text-info rounded-lg px-3 py-2 text-sm sm:col-span-3">
                Member submitted payment reference <span className="font-mono font-medium">{s.pending.claimedReference}</span> on{" "}
                {fmtDate(s.pending.createdAt)}. Check it against the UPI/bank statement, then confirm.
              </p>
            )}
          </section>

          <Section title="Membership history" description="Every term is kept — renewals add a new one.">
            <ol className="divide-y">
              {m.memberships.map((t) => {
                const st = termState(t);
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {t.plan.name} · {formatINR(t.pricePaise)}
                        {t.isRenewal && <span className="text-muted-foreground font-normal"> · renewal</span>}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t.startDate ? `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}` : `Requested ${fmtDate(t.createdAt)}`}
                        {t.cancelledReason && ` · ${t.cancelledReason}`}
                      </p>
                    </div>
                    <MemberStateBadge state={st} />
                    {edit && (t.status === "PENDING_PAYMENT" || (t.status === "ACTIVE" && st !== "EXPIRED")) && (
                      <CancelMembershipDialog
                        membershipId={t.id}
                        label={t.status === "PENDING_PAYMENT" ? "Cancel request" : "Cancel term"}
                      />
                    )}
                  </li>
                );
              })}
              {m.memberships.length === 0 && <li className="text-muted-foreground text-sm">No membership yet.</li>}
            </ol>
          </Section>

          <Section title="Payments" description="Dues received, with receipt numbers.">
            {m.paymentsMade.length ? (
              <ul className="divide-y text-sm">
                {m.paymentsMade.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0">
                    <span className="font-mono text-xs">{p.receiptNumber}</span>
                    <span className="flex-1">
                      {PAYMENT_METHOD_LABEL[p.method]}
                      {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      {p.receivedBy && <span className="text-muted-foreground"> · received by {p.receivedBy.name}</span>}
                    </span>
                    <span className="text-muted-foreground">{fmtDate(p.paidAt)}</span>
                    <span className="font-medium tabular-nums">{formatINR(p.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No payments recorded.</p>
            )}
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Details">
            <dl className="mb-4 grid gap-2 text-sm">
              {[
                ["Mobile", m.phone ?? "—"],
                ["Department", m.department?.name ?? "—"],
                ["Account", m.status.charAt(0) + m.status.slice(1).toLowerCase()],
                ["Joined CampusBuzz", fmtDate(m.createdAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <MemberProfileForm userId={m.id} program={m.program} yearOfStudy={m.yearOfStudy} editable={edit} />
          </Section>

          <Section title="Benefits">
            {m.benefits.length ? (
              <ul className="grid gap-1.5 text-sm">
                {m.benefits.map((b) => (
                  <li key={b.id}>· {b.title}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Benefits apply while the membership is active.</p>
            )}
          </Section>

          <Section title="Digital pass" actions={edit && m.passToken && <RotatePassButton userId={m.id} />}>
            {m.passToken ? (
              verifications.length ? (
                <ol className="grid gap-2 text-sm">
                  {verifications.map((v) => (
                    <li key={v.id} className="flex justify-between gap-2">
                      <span>
                        {RESULT_LABEL[v.result]} <span className="text-muted-foreground">· {v.method}</span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {v.verifiedBy.name} · {fmtDateTime(v.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">Pass issued. It hasn&apos;t been scanned yet.</p>
              )
            ) : (
              <p className="text-muted-foreground text-sm">A pass is issued once the first payment is confirmed.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
