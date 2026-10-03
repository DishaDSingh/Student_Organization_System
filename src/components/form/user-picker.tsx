"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type PickedUser = { id: string; name: string; email?: string };

/**
 * Searches people through GET /api/users/search as you type (debounced),
 * so pickers stay fast with hundreds of members.
 */
export function UserPicker({
  id,
  value,
  onChange,
  placeholder = "Search people…",
  disabled,
  clearable = true,
  "aria-invalid": invalid,
}: {
  id?: string;
  value: PickedUser | null;
  onChange: (u: PickedUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()).users);
      } catch {
        /* aborted or offline — keep previous results */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const shown = query.trim().length < 2 ? [] : results;

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.name ?? placeholder}</span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Type a name, email or roll no." value={query} onValueChange={setQuery} />
            <CommandList>
              {loading && (
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm">
                  <Loader2Icon className="size-4 animate-spin" /> Searching…
                </div>
              )}
              {!loading && <CommandEmpty>{query.trim().length < 2 ? "Type at least 2 characters." : "Nobody found."}</CommandEmpty>}
              {shown.map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.id}
                  onSelect={() => {
                    onChange(u);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={cn(value?.id === u.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block truncate">{u.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">{u.email}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {clearable && value && !disabled && (
        <Button type="button" variant="ghost" size="icon" aria-label="Clear selection" onClick={() => onChange(null)}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}
