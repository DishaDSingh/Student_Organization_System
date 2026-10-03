"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ChevronDownIcon, Loader2Icon, MinusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RoleBadge } from "@/components/common";
import { cn } from "@/lib/utils";
import { resetUserPassword, setMasterAdmin, setUserOverrides, setUserRoles, setUserStatus } from "../actions";
import { TempPasswordDialog } from "../user-form";

type RoleOption = { id: string; name: string; color: string; description: string | null; grantable: boolean; permissions: string[] };

export function RolesEditor({
  userId,
  roles,
  assigned,
  editable,
}: {
  userId: string;
  roles: RoleOption[];
  assigned: string[];
  editable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(assigned);
  const [pending, startTransition] = useTransition();
  const dirty = selected.length !== assigned.length || selected.some((s) => !assigned.includes(s));

  if (!editable) {
    const mine = roles.filter((r) => assigned.includes(r.id));
    return mine.length ? (
      <div className="flex flex-wrap gap-1.5">
        {mine.map((r) => (
          <RoleBadge key={r.id} name={r.name} color={r.color} />
        ))}
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">No roles assigned.</p>
    );
  }

  const save = () =>
    startTransition(async () => {
      const res = await setUserRoles({ userId, roleIds: selected });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => {
          const checked = selected.includes(r.id);
          // You may remove a role you couldn't grant only if you could grant it — same rule both ways.
          return (
            <li key={r.id}>
              <label
                className={cn(
                  "flex h-full items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors has-disabled:cursor-not-allowed has-disabled:opacity-55",
                  checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
                )}
                title={r.grantable ? undefined : "Includes permissions you don't hold"}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={checked}
                  disabled={!r.grantable}
                  onCheckedChange={(c) => setSelected((s) => (c ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                />
                <span className="min-w-0">
                  <RoleBadge name={r.name} color={r.color} />
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setSelected(assigned)}>
            Discard
          </Button>
        )}
        <Button onClick={save} disabled={!dirty || pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Save roles
        </Button>
      </div>
    </div>
  );
}

type PermissionRow = { key: string; label: string; description: string; isSensitive: boolean };
type ModuleRow = { key: string; label: string; permissions: PermissionRow[] };
type Override = { permissionKey: string; effect: "GRANT" | "DENY"; reason?: string };

/**
 * One matrix that answers "what can this person do, and why?":
 * role-derived access, the per-person override, and the effective result.
 */
export function AccessMatrix({
  userId,
  isMasterAdmin,
  modules,
  roleSources,
  overrides: initial,
  editable,
  grantable,
}: {
  userId: string;
  isMasterAdmin: boolean;
  modules: ModuleRow[];
  /** permission key → names of roles that grant it */
  roleSources: Record<string, string[]>;
  overrides: Override[];
  editable: boolean;
  /** keys the current admin may change */
  grantable: string[];
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, Override>>(() => Object.fromEntries(initial.map((o) => [o.permissionKey, o])));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const canGrant = useMemo(() => new Set(grantable), [grantable]);

  const initialMap = useMemo(() => Object.fromEntries(initial.map((o) => [o.permissionKey, o])), [initial]);
  const dirty =
    JSON.stringify(Object.values(overrides).sort((a, b) => a.permissionKey.localeCompare(b.permissionKey))) !==
    JSON.stringify(Object.values(initialMap).sort((a, b) => a.permissionKey.localeCompare(b.permissionKey)));

  const effective = (key: string) => {
    if (isMasterAdmin) return true;
    const o = overrides[key];
    if (o?.effect === "DENY") return false;
    if (o?.effect === "GRANT") return true;
    return (roleSources[key]?.length ?? 0) > 0;
  };

  const setEffect = (key: string, effect: "INHERIT" | "GRANT" | "DENY") =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (effect === "INHERIT") delete next[key];
      else next[key] = { permissionKey: key, effect, reason: prev[key]?.reason };
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const res = await setUserOverrides({ userId, overrides: Object.values(overrides) });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      {isMasterAdmin && (
        <p className="border-primary/30 bg-primary/5 rounded-lg border px-3 py-2 text-sm">
          Master Admins hold every permission. Overrides don&apos;t apply to them.
        </p>
      )}
      <div className="divide-y rounded-lg border">
        {modules.map((m) => {
          const granted = m.permissions.filter((p) => effective(p.key)).length;
          const overridden = m.permissions.filter((p) => overrides[p.key]).length;
          const isOpen = open[m.key] ?? overridden > 0;
          return (
            <div key={m.key}>
              <button
                type="button"
                className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [m.key]: !isOpen }))}
              >
                <ChevronDownIcon className={cn("text-muted-foreground size-4 transition-transform", !isOpen && "-rotate-90")} />
                <span className="font-medium">{m.label}</span>
                {overridden > 0 && (
                  <span className="bg-warning/15 rounded px-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {overridden} override{overridden > 1 && "s"}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {granted}/{m.permissions.length}
                </span>
              </button>
              {isOpen && (
                <ul className="bg-muted/20 divide-y border-t">
                  {m.permissions.map((p) => {
                    const o = overrides[p.key];
                    const fromRoles = roleSources[p.key] ?? [];
                    const on = effective(p.key);
                    const locked = !editable || isMasterAdmin || !canGrant.has(p.key);
                    return (
                      <li key={p.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span
                            className={cn(
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                              on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                            )}
                            aria-label={on ? "Allowed" : "Not allowed"}
                          >
                            {on ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
                          </span>
                          <div className="min-w-0 text-sm">
                            <p>
                              {p.label}
                              {p.isSensitive && <span className="text-destructive ml-1.5 text-xs font-medium">Sensitive</span>}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {o
                                ? `${o.effect === "GRANT" ? "Granted" : "Denied"} for this person`
                                : fromRoles.length
                                  ? `Via ${fromRoles.join(", ")}`
                                  : p.description}
                            </p>
                            {o && editable && !locked && (
                              <Input
                                className="mt-1.5 h-7 text-xs"
                                placeholder="Reason (recommended)"
                                maxLength={200}
                                value={o.reason ?? ""}
                                onChange={(e) =>
                                  setOverrides((prev) => ({ ...prev, [p.key]: { ...o, reason: e.target.value || undefined } }))
                                }
                              />
                            )}
                            {o?.reason && (locked || !editable) && (
                              <p className="text-muted-foreground mt-0.5 text-xs italic">“{o.reason}”</p>
                            )}
                          </div>
                        </div>
                        <Segmented
                          disabled={locked}
                          value={o?.effect ?? "INHERIT"}
                          onChange={(v) => setEffect(p.key, v)}
                          label={`Override for ${p.label}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {editable && !isMasterAdmin && (
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setOverrides(initialMap)}>
              Discard
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save overrides
          </Button>
        </div>
      )}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  disabled,
  label,
}: {
  value: "INHERIT" | "GRANT" | "DENY";
  onChange: (v: "INHERIT" | "GRANT" | "DENY") => void;
  disabled?: boolean;
  label: string;
}) {
  const opts = [
    { v: "INHERIT" as const, text: "Role", icon: MinusIcon },
    { v: "GRANT" as const, text: "Grant", icon: CheckIcon },
    { v: "DENY" as const, text: "Deny", icon: XIcon },
  ];
  return (
    <div role="radiogroup" aria-label={label} className={cn("bg-background inline-flex rounded-lg border p-0.5", disabled && "opacity-50")}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
            value === o.v
              ? o.v === "GRANT"
                ? "bg-success/15 text-success"
                : o.v === "DENY"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-3" />
          {o.text}
        </button>
      ))}
    </div>
  );
}

export function AccountActions({
  user,
  canSuspend,
  canReset,
  isActorMaster,
  isSelf,
}: {
  user: { id: string; name: string; status: "ACTIVE" | "INVITED" | "SUSPENDED"; isMasterAdmin: boolean };
  canSuspend: boolean;
  canReset: boolean;
  isActorMaster: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      if (res.message) toast.success(res.message);
      router.refresh();
    });

  const suspended = user.status === "SUSPENDED";
  const items = [
    canSuspend &&
      !isSelf && {
        key: "status",
        title: suspended ? "Reactivate account" : "Suspend account",
        body: suspended ? "Restore sign-in access." : "Blocks sign-in and signs them out everywhere immediately. Their records stay.",
        action: suspended ? "Reactivate" : "Suspend",
        danger: !suspended,
        run: () => run(() => setUserStatus({ userId: user.id, status: suspended ? "ACTIVE" : "SUSPENDED" })),
      },
    canReset &&
      !isSelf && {
        key: "reset",
        title: "Reset password",
        body: "Generates a temporary password and signs them out everywhere.",
        action: "Reset",
        danger: false,
        run: () =>
          startTransition(async () => {
            const res = await resetUserPassword({ userId: user.id });
            if (!res.ok) return void toast.error(res.error);
            setTempPassword(res.data.tempPassword);
          }),
      },
    isActorMaster && {
      key: "master",
      title: user.isMasterAdmin ? "Remove Master Admin" : "Make Master Admin",
      body: user.isMasterAdmin
        ? "They keep their roles but lose unrestricted access."
        : "Grants unrestricted access to everything, including finance, CCTV and the audit log.",
      action: user.isMasterAdmin ? "Remove" : "Make Master Admin",
      danger: !user.isMasterAdmin,
      run: () => run(() => setMasterAdmin({ userId: user.id, value: !user.isMasterAdmin })),
    },
  ].filter(Boolean) as { key: string; title: string; body: string; action: string; danger: boolean; run: () => void }[];

  if (!items.length) return <p className="text-muted-foreground text-sm">No account actions available to you.</p>;

  return (
    <ul className="divide-y">
      {items.map((i) => (
        <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 text-sm">
            <p className="font-medium">{i.title}</p>
            <p className="text-muted-foreground">{i.body}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant={i.danger ? "destructive" : "outline"} disabled={pending}>
                {i.action}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {i.title} for {user.name}?
                </AlertDialogTitle>
                <AlertDialogDescription>{i.body} This will be recorded in the audit log.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant={i.danger ? "destructive" : "default"} onClick={i.run}>
                  {i.action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
      <TempPasswordDialog password={tempPassword} title="Password reset" onClose={() => setTempPassword(null)} />
    </ul>
  );
}
