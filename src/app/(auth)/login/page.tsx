import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (!(await db.organization.count())) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");

  const { next } = await props.searchParams;
  // Only allow internal redirects after login.
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const org = await db.organization.findFirst({ select: { name: true } });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground mt-1 text-sm">to {org?.name ?? "your organization"}</p>
      <LoginForm next={safeNext} />
    </div>
  );
}
