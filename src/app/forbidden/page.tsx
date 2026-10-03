import Link from "next/link";
import { ShieldXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access" };

export default function Forbidden() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <ShieldXIcon className="text-muted-foreground size-10" />
      <h1 className="mt-4 text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        Access is granted per role. If you need it for your work, ask your Master Admin to update your role.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/profile">See my access</Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
