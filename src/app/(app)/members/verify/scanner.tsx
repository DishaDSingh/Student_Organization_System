"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { toast } from "sonner";
import { CameraIcon, CameraOffIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberStateBadge } from "@/components/membership";
import type { MemberState } from "@/lib/membership/rules";
import { fmtDate } from "@/lib/format";
import { lookupMembers, recordManualVerification } from "../actions";

/** Pull the pass token out of a scanned QR (our QR encodes …/verify/<token>). */
function tokenFrom(text: string) {
  const m = text.match(/\/verify\/([A-Za-z0-9_-]{16,64})(?:$|[?#])/);
  return m?.[1] ?? null;
}

/**
 * Camera scanner using jsQR — decodes frames locally in the browser,
 * so it works without internet. Browsers only allow the camera on
 * https:// or localhost; manual lookup below covers everything else.
 */
export function PassScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          const v = video.current;
          const c = canvas.current;
          if (stopped || !v || !c) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
            const token = code && tokenFrom(code.data);
            if (token) {
              stopped = true;
              navigator.vibrate?.(80);
              router.push(`/verify/${token}`);
              return;
            }
            if (code) setError("That QR code isn't a CampusBuzz member pass.");
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError(
          window.isSecureContext
            ? "Camera permission was denied. Allow it in the browser, or use manual lookup."
            : "Cameras only work on https:// or localhost. Use manual lookup on this device.",
        );
        setOn(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, router]);

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-black sm:aspect-video">
        <video ref={video} className="size-full object-cover" playsInline muted />
        <canvas ref={canvas} className="hidden" />
        {on ? (
          <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            <CameraIcon className="size-8" />
            <p className="text-sm">Point the camera at a member&apos;s pass QR.</p>
          </div>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button
        onClick={() => {
          setError(null);
          setOn((o) => !o);
        }}
        variant={on ? "outline" : "default"}
        size="lg"
      >
        {on ? <CameraOffIcon /> : <CameraIcon />}
        {on ? "Stop camera" : "Start scanning"}
      </Button>
    </div>
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
