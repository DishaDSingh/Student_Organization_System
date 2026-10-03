"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { QrScanner, tokenAfter } from "@/components/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberStateBadge } from "@/components/membership";
import type { MemberState } from "@/lib/membership/rules";
import { fmtDate } from "@/lib/format";
import { lookupMembers, recordManualVerification } from "../actions";

/** Member pass QR → the permission-gated result page. */
export function PassScanner() {
  const router = useRouter();
  return (
    <QrScanner
      extract={tokenAfter("verify")}
      onToken={(token) => router.push(`/verify/${token}`)}
      hint="Point the camera at a member's pass QR."
    />
  );
}

type Result = {
  id: string;
  name: string;
  memberNumber: string | null;
  studentId: string | null;
  state: MemberState;
  validUntil: string | null;
};

export function ManualLookup() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await lookupMembers({ query });
      if (!res.ok) return void toast.error(res.fieldErrors?.query?.[0] ?? res.error);
      setResults(res.data);
    });
  };

  return (
    <div className="grid gap-3">
      <form onSubmit={search} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Member no., roll no., email or name"
            className="pl-8"
            aria-label="Look up a member"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Look up
        </Button>
      </form>
      {results && (
        <ul className="divide-y rounded-lg border">
          {results.length === 0 && <li className="text-muted-foreground p-3 text-sm">Nobody found.</li>}
          {results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{r.name}</p>
                <p className="text-muted-foreground text-xs">
                  {r.memberNumber ?? "—"} · {r.studentId ?? "—"}
                  {r.validUntil && ` · until ${fmtDate(r.validUntil)}`}
                </p>
              </div>
              <MemberStateBadge state={r.state} />
              <Button
                size="sm"
                variant="outline"
                disabled={checked[r.id]}
                onClick={() =>
                  startTransition(async () => {
                    const res = await recordManualVerification({ userId: r.id });
                    if (!res.ok) return void toast.error(res.error);
                    setChecked((c) => ({ ...c, [r.id]: true }));
                    toast.success(res.data.result === "VALID" ? `${r.name} verified ✓` : `Recorded: ${r.name} is not valid`);
                  })
                }
              >
                {checked[r.id] ? "Recorded" : "Record check"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
