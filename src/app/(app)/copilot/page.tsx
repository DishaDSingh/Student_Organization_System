import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { allowed } from "@/lib/copilot/answers";
import { aiConfigured } from "@/lib/ai/claude";
import Link from "next/link";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Ask" };

const SUGGESTIONS = [
  ["attention", "What needs my attention today?"],
  ["active_members", "How many active members do we have?"],
  ["event_money", "How much money did the Diwali Gala make?"],
  ["expiring_memberships", "Which memberships expire this month?"],
  ["pending_reimbursements", "Show pending reimbursements"],
  ["top_attendance", "Which event had the highest attendance?"],
  ["stock_left", "How many hoodies are left?"],
] as const;

export default async function CopilotPage() {
  const user = await requirePermission("ai.use");
  return (
    <>
      <PageHeader
        title="Ask CampusBuzz"
        description="Questions are answered from your organization's live data — every answer shows where its numbers come from."
      />
      <Chat suggestions={SUGGESTIONS.filter(([i]) => allowed(user, i)).map(([, q]) => q)} ai={aiConfigured()} />
      <p className="text-muted-foreground mx-auto mt-6 max-w-3xl text-center text-xs">
        <Link href="/ai" className="hover:underline">
          How AI works here →
        </Link>
      </p>
    </>
  );
}
