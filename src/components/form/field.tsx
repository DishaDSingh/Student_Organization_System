import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Label + control + hint/error, with the aria wiring screen readers need. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
      </Label>
      {React.cloneElement(children, { id, "aria-invalid": !!error || undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Native select styled like the inputs — works with react-hook-form and allows an empty option. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(function NativeSelect(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "border-input h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 [&>option]:bg-popover aria-invalid:ring-3",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/** Push server-side field errors (from ActionResult) into react-hook-form. */
export function applyServerErrors(
  fieldErrors: Record<string, string[] | undefined> | undefined,
  setError: (name: never, error: { message: string }) => void,
) {
  if (!fieldErrors) return;
  for (const [name, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) setError(name as never, { message: messages[0] });
  }
}
