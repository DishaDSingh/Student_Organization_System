import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="text-muted-foreground text-xs">Runs locally · your data stays on your organization&apos;s server</p>
      </div>
      <aside className="bg-muted/40 relative hidden overflow-hidden border-l lg:flex lg:flex-col lg:justify-center lg:p-16">
        <p className="text-primary text-sm font-medium">The operating system for student organizations</p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance">
          Members, events, money and people — in one place, with a clear record of who did what.
        </h2>
        <ul className="text-muted-foreground mt-10 grid max-w-md gap-4 text-sm">
          {[
            ["Operate", "Members · Events · Tickets · Merch · Volunteers · Finance"],
            ["Understand", "Analytics · Insights · Copilot · Reports · Pulse"],
            ["Anticipate", "What-if simulation · Alerts · Organization memory"],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="bg-background text-foreground flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                {i + 1}
              </span>
              <span>
                <span className="text-foreground block font-medium">{title}</span>
                {body}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
