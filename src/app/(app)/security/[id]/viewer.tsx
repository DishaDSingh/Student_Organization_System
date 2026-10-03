"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CctvIcon, FlagIcon, HistoryIcon, Loader2Icon, RadioIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form/field";
import { feedKind } from "@/lib/cctv/access";
import { markCameraIncident, openCameraFeed } from "../actions";

/**
 * Nothing is shown until the viewer confirms the purpose and opens the feed;
 * opening is logged on the server. Demo cameras have no URL, so they show a
 * "no signal" tile with a live clock.
 */
export function CameraViewer({
  cameraId,
  name,
  live,
  playback,
  canMark,
  eventTitle,
}: {
  cameraId: string;
  name: string;
  live: boolean;
  playback: boolean;
  canMark: boolean;
  eventTitle?: string;
}) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [open, setOpen] = useState<null | { kind: "LIVE" | "PLAYBACK"; url: string | null }>(null);
  const [pending, startTransition] = useTransition();

  const start = (kind: "LIVE" | "PLAYBACK") =>
    startTransition(async () => {
      const res = await openCameraFeed({ cameraId, kind });
      if (!res.ok) return void toast.error(res.error);
      setOpen({ kind, url: res.data.url });
      router.refresh(); // refresh the access log
    });

  if (!live && !playback)
    return (
      <p className="text-muted-foreground text-sm">You can see this camera in the list, but you don&apos;t have live or playback access.</p>
    );

  return (
    <div className="grid gap-4">
      {open ? (
        <Feed name={name} kind={open.kind} url={open.url} />
      ) : (
        <div className="bg-card grid gap-3 rounded-xl border p-4">
          <Label className="flex items-start gap-2 font-normal">
            <Checkbox checked={ack} onCheckedChange={(c) => setAck(c === true)} className="mt-0.5" />
            I&apos;m viewing for event safety and I&apos;ve read the privacy notice. I understand this view is logged.
          </Label>
          <div className="flex flex-wrap gap-2">
            {live && (
              <Button disabled={!ack || pending} onClick={() => start("LIVE")}>
                {pending ? <Loader2Icon className="animate-spin" /> : <RadioIcon />} Open live feed
              </Button>
            )}
            {playback && (
              <Button variant="outline" disabled={!ack || pending} onClick={() => start("PLAYBACK")}>
                <HistoryIcon /> Recorded footage
              </Button>
            )}
          </div>
        </div>
      )}
      {open && canMark && <MarkIncident cameraId={cameraId} eventTitle={eventTitle} />}
    </div>
  );
}

function Feed({ name, kind, url }: { name: string; kind: "LIVE" | "PLAYBACK"; url: string | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const type = feedKind(url);
  return (
    <figure className="relative aspect-video overflow-hidden rounded-xl bg-neutral-950 text-neutral-400">
      {type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- MJPEG/snapshot streams must be a plain <img>
        <img src={url!} alt={`${name} ${kind === "LIVE" ? "live" : "recorded"} feed`} className="size-full object-contain" />
      )}
      {type === "video" && <video src={url!} controls autoPlay muted playsInline className="size-full object-contain" />}
      {type === "none" && (
        <div className="flex size-full flex-col items-center justify-center gap-2">
          <CctvIcon className="size-10" />
          <p className="text-sm">No signal — this is a demo camera without a stream URL.</p>
        </div>
      )}
      <figcaption className="absolute top-2 left-2 flex items-center gap-2 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white">
        {kind === "LIVE" && <span className="size-2 animate-pulse rounded-full bg-red-500" />}
        {kind === "LIVE" ? "LIVE" : "PLAYBACK"} · {name} · {now?.toLocaleTimeString("en-IN", { hour12: false }) ?? ""}
      </figcaption>
    </figure>
  );
}

function MarkIncident({ cameraId, eventTitle }: { cameraId: string; eventTitle?: string }) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("LOW");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="bg-card grid gap-2 rounded-xl border p-4 sm:grid-cols-[1fr_8rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await markCameraIncident({ cameraId, title, severity, seenAt: new Date().toISOString() });
          if (!res.ok) return void toast.error(res.fieldErrors?.title?.[0] ?? res.error);
          toast.success(res.message);
          setTitle("");
        });
      }}
    >
      <p className="text-muted-foreground text-xs sm:col-span-3">
        Saw something? It&apos;s added to the incident log{eventTitle ? ` of ${eventTitle}` : ""} with this camera and the current time.
      </p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crowd building at gate 2" aria-label="What happened" />
      <NativeSelect value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </NativeSelect>
      <Button type="submit" variant="outline" disabled={pending || title.trim().length < 3}>
        {pending ? <Loader2Icon className="animate-spin" /> : <FlagIcon />} Mark incident
      </Button>
    </form>
  );
}
