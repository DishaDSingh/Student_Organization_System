"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpIcon, DatabaseIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Answer } from "@/lib/copilot/answers";
import { askCopilot } from "./actions";

type Message = { id: number; question: string; answer?: Answer & { routedBy: "ai" | "rules" } };

export function Chat({ suggestions, ai }: { suggestions: string[]; ai: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const ask = (question: string) => {
    const q = question.trim();
    if (q.length < 2 || pending) return;
    const id = ++nextId.current;
    setMessages((m) => [...m, { id, question: q }]);
    setText("");
    startTransition(async () => {
      const res = await askCopilot({ question: q });
      if (!res.ok) {
        toast.error(res.fieldErrors?.question?.[0] ?? res.error);
        return setMessages((m) => m.filter((x) => x.id !== id));
      }
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, answer: res.data } : x)));
    });
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      {messages.length === 0 && (
        <div className="bg-card rounded-xl border p-4 sm:p-5">
          <p className="text-sm font-medium">Try asking</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="hover:bg-muted rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            {ai
              ? "AI understands your question; the numbers always come straight from the database."
              : "Running offline: questions are matched by keywords. Numbers come straight from the database."}
          </p>
        </div>
      )}

      <ol className="grid gap-5" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className="grid gap-2">
            <p className="bg-primary text-primary-foreground max-w-[85%] justify-self-end rounded-2xl rounded-br-sm px-4 py-2 text-sm">
              {m.question}
            </p>
            {m.answer ? (
              <div className="bg-card max-w-full justify-self-start rounded-2xl rounded-bl-sm border p-4 text-sm sm:max-w-[90%]">
                <p>{m.answer.text}</p>
                {m.answer.table && m.answer.table.rows.length > 0 && (
                  <div className="-mx-4 mt-3 overflow-x-auto px-4">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground text-left text-xs">
                        <tr className="border-b">
                          {m.answer.table.columns.map((c, i) => (
                            <th key={i} className="py-1.5 pr-3 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {m.answer.table.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((cell, ci) => (
                              <td key={ci} className="py-1.5 pr-3 align-top">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {m.answer.sources.length > 0 && (
                  <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <DatabaseIcon className="size-3.5" /> Source:
                    </span>
                    {m.answer.sources.map((s) => (
                      <Link key={s.href + s.label} href={s.href} className="text-primary hover:underline">
                        {s.label}
                      </Link>
                    ))}
                    {m.answer.routedBy === "ai" && (
                      <span className="ml-auto inline-flex items-center gap-1">
                        <SparklesIcon className="size-3" /> understood by AI
                      </span>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2Icon className="size-4 animate-spin" /> Looking it up…
              </p>
            )}
          </li>
        ))}
      </ol>
      <div ref={bottom} />

      <form
        className="bg-background sticky bottom-4 flex gap-2 rounded-xl border p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about members, events, money, merch…"
          aria-label="Your question"
          maxLength={300}
          className="border-0 shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" disabled={pending || text.trim().length < 2} aria-label="Ask">
          {pending ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
        </Button>
      </form>
    </div>
  );
}
