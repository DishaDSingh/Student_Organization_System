import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/common";
import { daysAgo, toDateInput } from "@/lib/format";
import { ExpenseForm } from "../finance-forms";

export const metadata: Metadata = { title: "New expense" };

export default async function NewExpensePage() {
  await requirePermission("finance.create_expense");
  const recent = daysAgo(60);
  const [events, fundraisers] = await Promise.all([
    db.event.findMany({
      where: { status: { not: "CANCELLED" }, endsAt: { gte: recent } },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true },
    }),
    db.fundraiser.findMany({
      where: { status: { not: "CANCELLED" }, endsAt: { gte: recent } },
      orderBy: { endsAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="New expense"
        description="Add a photo of the receipt and we'll fill in the rest. The treasurer approves it."
        back={{ href: "/finance", label: "Finance" }}
      />
      <ExpenseForm today={toDateInput(new Date())} events={events} fundraisers={fundraisers} />
    </>
  );
}
