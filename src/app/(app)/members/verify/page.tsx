import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader, Section } from "@/components/common";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ManualLookup, PassScanner } from "./scanner";

export const metadata: Metadata = { title: "Verify pass" };

export default async function VerifyPage() {
  const user = await requirePermission("members.verify");
  const since = new Date(new Date().setHours(0, 0, 0, 0));
  const [recent, todayCount] = await Promise.all([
    db.passVerification.findMany({
      where: { verifiedById: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, result: true, createdAt: true, member: { select: { name: true } } },
    }),
    db.passVerification.count({ where: { createdAt: { gte: since } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Verify member pass"
        description={`Scan a member's QR at the door, or look them up. ${todayCount} checks recorded today.`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
        <Section title="Scan">
          <PassScanner />
        </Section>
        <div className="grid content-start gap-6">
          <Section title="Manual lookup" description="No camera, or the member forgot their phone.">
            <ManualLookup />
          </Section>
          <Section title="Your recent checks">
            {recent.length ? (
              <ul className="grid gap-2 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span className={cn(r.result === "VALID" ? "text-success" : "text-destructive", "font-medium")}>
                      {r.result === "VALID" ? "✓" : "✕"} {r.member?.name ?? "Unknown pass"}
                    </span>
                    <span className="text-muted-foreground text-xs">{fmtDateTime(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No checks yet.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
