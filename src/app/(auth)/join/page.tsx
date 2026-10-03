import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Become a member" };

export default async function JoinPage() {
  await connection();
  const org = await db.organization.findFirst({ select: { name: true, allowSelfRegistration: true } });
  if (!org) redirect("/setup");
  if (await getCurrentUser()) redirect("/me");

  if (!org.allowSelfRegistration) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign-up is closed</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {org.name} isn&apos;t taking online registrations right now. Visit the student council desk to join.
        </p>
        <Link href="/login" className="text-primary mt-6 inline-block text-sm hover:underline">
          Already a member? Sign in
        </Link>
      </div>
    );
  }

  const plans = await db.membershipPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, pricePaise: true, durationMonths: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Become a member</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Join {org.name}. Your membership activates once your dues are confirmed.{" "}
        <Link href="/login" className="text-primary hover:underline">
          Already have an account?
        </Link>
      </p>
      <JoinForm plans={plans} />
    </div>
  );
}
