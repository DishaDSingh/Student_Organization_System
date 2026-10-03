import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Home() {
  if (!(await db.organization.count())) redirect("/setup");
  redirect((await getCurrentUser()) ? "/dashboard" : "/login");
}
