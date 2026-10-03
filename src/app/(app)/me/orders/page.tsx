import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { EmptyState, PageHeader, Section } from "@/components/common";
import { QrImage } from "@/components/membership";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/membership/rules";
import { qrSvg, upiUri } from "@/lib/qr";
import { CancelMyMerchOrderButton } from "../../merch/merch-forms";

export const metadata: Metadata = { title: "My orders" };

const LABEL: Record<string, [string, string]> = {
  PENDING_PAYMENT: ["Waiting for payment", "text-info"],
  PAID: ["Paid — collect from the merch desk", "text-amber-600 dark:text-amber-400"],
  FULFILLED: ["Collected", "text-success"],
  CANCELLED: ["Cancelled", "text-muted-foreground"],
  REFUNDED: ["Refunded", "text-muted-foreground"],
};

export default async function MyOrdersPage() {
  const user = await requireUser();
  const [orders, org] = await Promise.all([
    db.merchOrder.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { variant: { select: { size: true, color: true, product: { select: { id: true, name: true } } } } } },
        payment: { select: { receiptNumber: true } },
      },
    }),
    db.organization.findFirst({ select: { name: true, shortName: true, upiId: true } }),
  ]);

  const qr = new Map<string, string>();
  for (const o of orders.filter((o) => o.status === "PENDING_PAYMENT" && org?.upiId)) {
    qr.set(
      o.id,
      await qrSvg(upiUri({ upiId: org!.upiId!, payee: org!.name, amountPaise: o.totalPaise, note: `${org!.shortName} ${o.orderNumber}` })),
    );
  }

  return (
    <>
      <PageHeader
        title="My orders"
        description="Merchandise you've ordered."
        actions={
          <Link href="/merch" className="text-primary self-center text-sm hover:underline">
            Shop merch
          </Link>
        }
      />
      {orders.length === 0 ? (
        <EmptyState icon={ShoppingBagIcon} title="No orders yet">
          <Link href="/merch" className="text-primary hover:underline">
            Browse the store
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {orders.map((o) => (
            <Section
              key={o.id}
              title={`${o.orderNumber} · ${formatINR(o.totalPaise)}`}
              description={fmtDateTime(o.createdAt)}
              actions={<span className={cn("text-sm font-medium", LABEL[o.status][1])}>{LABEL[o.status][0]}</span>}
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                <ul className="grid content-start gap-1 text-sm">
                  {o.items.map((i) => (
                    <li key={i.id}>
                      {i.quantity}×{" "}
                      <Link href={`/merch/${i.variant.product.id}`} className="hover:underline">
                        {i.variant.product.name}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        {i.variant.color} {i.variant.size} · {formatINR(i.unitPricePaise)}
                        {i.isMemberPrice && " member price"}
                      </span>
                    </li>
                  ))}
                  {o.payment && <li className="text-muted-foreground text-xs">Receipt {o.payment.receiptNumber}</li>}
                  {o.status === "PENDING_PAYMENT" && (
                    <li className="mt-2">
                      <p className="text-muted-foreground text-xs">Items are held for 48 hours. Mention {o.orderNumber} in the UPI note.</p>
                      <CancelMyMerchOrderButton orderId={o.id} />
                    </li>
                  )}
                </ul>
                {qr.get(o.id) && <QrImage svg={qr.get(o.id)!} label={`UPI payment QR for ${formatINR(o.totalPaise)}`} />}
              </div>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
