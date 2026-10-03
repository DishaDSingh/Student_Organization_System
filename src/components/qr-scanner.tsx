"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraIcon, CameraOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Camera QR scanner. jsQR decodes frames locally in the browser, so it works
 * offline. Browsers only allow cameras on https:// or localhost — callers
 * should always offer a manual fallback.
 *
 * `extract` turns raw QR text into a token we understand (or null);
 * `onToken` handles it. Scanning pauses while `onToken` runs and for a moment
 * after, so one ticket isn't scanned twice.
 */
export function QrScanner({
  extract,
  onToken,
  hint = "Point the camera at the QR code.",
  continuous = false,
}: {
  extract: (text: string) => string | null;
  onToken: (token: string) => void | Promise<void>;
  hint?: string;
  /** Keep scanning after a hit (door check-in) instead of stopping (navigation). */
  continuous?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const last = useRef<{ token: string; at: number } | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onToken);
  const extractor = useRef(extract);
  useEffect(() => {
    handler.current = onToken;
    extractor.current = extract;
  });

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
        const tick = async () => {
          const v = video.current;
          const c = canvas.current;
          if (stopped || !v || !c) return;
          if (!busy.current && v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, c.width, c.height);
            const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
            const token = code && extractor.current(code.data);
            // Ignore the same code for 3 s so a ticket held in front of the camera isn't re-processed.
            const repeat = token && last.current?.token === token && Date.now() - last.current.at < 3000;
            if (token && !repeat) {
              busy.current = true;
              last.current = { token, at: Date.now() };
              navigator.vibrate?.(80);
              await handler.current(token);
              busy.current = false;
              if (!continuous) {
                stopped = true;
                return;
              }
            } else if (code && !token) {
              setError("That QR code isn't one of ours.");
            }
          }
          raf = requestAnimationFrame(() => void tick());
        };
        raf = requestAnimationFrame(() => void tick());
      } catch {
        setError(
          window.isSecureContext
            ? "Camera permission was denied. Allow it in the browser, or use manual entry."
            : "Cameras only work on https:// or localhost. Use manual entry on this device.",
        );
        setOn(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, continuous]);

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
            <p className="text-sm">{hint}</p>
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

/** Pulls the token out of our QR URLs: …/<segment>/<token>. */
export const tokenAfter = (segment: string) => (text: string) =>
  text.match(new RegExp(`/${segment}/([A-Za-z0-9_-]{16,64})(?:$|[?#])`))?.[1] ?? null;
