import { ShieldCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown wherever camera footage can be opened. */
export function PrivacyNotice({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted/50 flex gap-3 rounded-xl border p-4 text-sm", className)}>
      <ShieldCheckIcon className="text-primary mt-0.5 size-5 shrink-0" />
      <div className="grid gap-1">
        <p className="font-medium">Privacy notice</p>
        <p className="text-muted-foreground">
          Cameras are for event safety only. Watch only what your role needs, never share footage outside the security team, and never
          record or screenshot people for any other purpose. Every view is logged with your name, time and device. CampusBuzz does not do
          facial recognition or track individuals; adding anything like that needs a separate legal and privacy review.
        </p>
      </div>
    </div>
  );
}
