import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon, ScanLineIcon, XCircleIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { MemberStateBadge } from "@/components/membership";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATE_LABEL, standing, verificationResult } from "@/lib/membership/rules";

export const metadata: Metadata = { title: "Pass check" };

/**
 * Where a scanned pass QR lands. Only people with members.verify can open it,
 * so a pass photographed by a stranger reveals nothing. Every visit is recorded.
 */
export default async function PassCheckPage(props: PageProps<"/verify/[token]">) {
  const verifier = await requirePermission("members.verify");
  const { token } = await props.params;

  const member = /^[A-Za-z0-9_-]{16,64}$/.test(token)
    ? await db.user.findUnique({
        where: { passToken: token },
        select: {
          id: true,
          name: true,
          memberNumber: true,
          studentId: true,
          program: true,
          yearOfStudy: true,
          status: true,
          memberships: { select: { status: true, startDate: true, endDate: true, plan: { select: { id: true, name: true } } } },
        },
      })
    : null;

  const s = member ? standing(member.memberships) : null;
  // A suspended account fails the check even if dues are paid.
  const result = !member || !s ? "INVALID_PASS" : member.status === "SUSPENDED" ? "CANCELLED" : verificationResult(s.state);
  const ok = result === "VALID";

  await db.passVerification.create({ data: { memberId: member?.id ?? null, verifiedById: verifier.id, result, method: "scan" } });

  const planId = (s?.current ?? s?.upcoming)?.plan.id;
  const benefits =
    ok && planId
      ? await db.membershipBenefit.findMany({
          where: { isActive: true, plans: { some: { planId } } },
          orderBy: { sortOrder: "asc" },
          select: { title: true },
        })
      : [];

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <section
        className={cn(
          "flex flex-col items-center rounded-2xl border-2 p-6 text-center",
          ok ? "border-success/40 bg-success/8" : "border-destructive/40 bg-destructive/6",
        )}
        aria-live="assertive"
      >
        {ok ? <CheckCircle2Icon className="text-success size-16" /> : <XCircleIcon className="text-destructive size-16" />}
        <p className={cn("mt-3 text-2xl font-semibold", ok ? "text-success" : "text-destructive")}>
          {ok
            ? "Valid member"
            : !member
              ? "Unrecognised pass"
              : member.status === "SUSPENDED"
                ? "Account suspended"
                : STATE_LABEL[s!.state]}
        </p>
        {!member && (
          <p className="text-muted-foreground mt-1 text-sm">This QR isn&apos;t a current pass. It may have been replaced by a newer one.</p>
        )}
      </section>

      {member && s && (
        <section className="bg-card rounded-xl border p-5">
          <p className="text-xl font-semibold">{member.name}</p>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">{member.memberNumber}</span> · {member.studentId}
            {member.program && ` · ${member.program}`}
            {member.yearOfStudy && `, year ${member.yearOfStudy}`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <MemberStateBadge state={s.state} />
            {s.term && <span>{s.term.plan.name}</span>}
            <span className="text-muted-foreground">
              {s.validUntil ? `valid until ${fmtDate(s.validUntil)}` : s.term?.endDate ? `ended ${fmtDate(s.term.endDate)}` : ""}
            </span>
          </div>
          {benefits.length > 0 && (
            <ul className="mt-4 grid gap-1 border-t pt-3 text-sm">
              {benefits.map((b) => (
                <li key={b.title}>· {b.title}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Button asChild size="lg">
        <Link href="/members/verify">
          <ScanLineIcon /> Scan next
        </Link>
      </Button>
    </div>
  );
}
