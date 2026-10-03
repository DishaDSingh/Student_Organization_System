import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your organization" };

export default async function SetupPage() {
  // Must run per request (not at build time): setup locks itself once an organization exists.
  await connection();
  if (await db.organization.count()) redirect("/login");

  return (
    <div>
      <p className="text-primary text-sm font-medium">First-time setup</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create your organization</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        You&apos;ll become the Master Admin — the only account that can see and change everything. You decide what everyone else can access.
      </p>
      <SetupForm />
    </div>
  );
}
