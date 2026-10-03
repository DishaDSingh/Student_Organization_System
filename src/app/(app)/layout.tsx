import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const org = await db.organization.findFirst({ select: { shortName: true } });

  return (
    <AppShell
      user={{ name: user.name, email: user.email, isMasterAdmin: user.isMasterAdmin, roleNames: user.roles.map((r) => r.name) }}
      orgShortName={org?.shortName ?? ""}
      permissions={[...user.permissions]}
    >
      {children}
    </AppShell>
  );
}
