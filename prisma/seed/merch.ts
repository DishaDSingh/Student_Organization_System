import type { Prisma, StockReason } from "../../src/generated/prisma/client";
import { templateArtwork, type TemplateStyle } from "../../src/lib/merch/artwork";
import { skuFor } from "../../src/lib/merch/rules";
import { DAY, TODAY, between, bySize, daysAgo, faker, type Db } from "./shared";

/**
 * Phase 5 seed: products, variants, stock history, merch orders and studio designs.
 *
 * Demo stories:
 *  - M and L sell fastest; the black M Classic Logo Hoodie sits at its reorder threshold
 *  - Varsity Hoodie 2026 came from an approved Merch Studio design
 *  - designs in every state: draft, in review, approved, sent back
 */

type ProductSpec = {
  name: string;
  category: string;
  price: number;
  member: number;
  cost: number;
  colors: [string, string][];
  sizes: string[];
  opening: number;
  reorder: number;
  popularity: number;
  description: string;
  design?: { style: TemplateStyle; ink: string };
};

const APPAREL = ["XS", "S", "M", "L", "XL", "XXL"];
const SIZE_WEIGHT: Record<string, number> = { XS: 3, S: 15, M: 32, L: 28, XL: 15, XXL: 7, ONE: 20 };

const PRODUCTS: ProductSpec[] = [
  {
    name: "Classic Logo Hoodie",
    category: "Hoodie",
    price: 999,
    member: 849,
    cost: 520,
    colors: [
      ["Black", "#111827"],
      ["Navy", "#1e3a8a"],
    ],
    sizes: APPAREL,
    opening: 30,
    reorder: 8,
    popularity: 10,
    description: "Heavyweight fleece hoodie with the council logo on the chest.",
  },
  {
    name: "Varsity Hoodie 2026",
    category: "Hoodie",
    price: 1199,
    member: 1019,
    cost: 610,
    colors: [["Maroon", "#7f1d1d"]],
    sizes: APPAREL,
    opening: 25,
    reorder: 6,
    popularity: 7,
    description: "Limited-run varsity hoodie from the 2026 Merch Studio.",
    design: { style: "varsity", ink: "#facc15" },
  },
  {
    name: "Zip Hoodie",
    category: "Hoodie",
    price: 1099,
    member: 935,
    cost: 580,
    colors: [["Grey", "#6b7280"]],
    sizes: APPAREL,
    opening: 15,
    reorder: 4,
    popularity: 3,
    description: "Full-zip hoodie for chilly lab nights.",
  },
  {
    name: "Campus Tee",
    category: "T-shirt",
    price: 449,
    member: 379,
    cost: 210,
    colors: [
      ["White", "#f5f5f4"],
      ["Black", "#111827"],
      ["Navy", "#1e3a8a"],
    ],
    sizes: APPAREL,
    opening: 35,
    reorder: 8,
    popularity: 9,
    description: "Soft combed-cotton tee, everyday fit.",
  },
  {
    name: "Spring Gala Tee 2026",
    category: "T-shirt",
    price: 399,
    member: 339,
    cost: 190,
    colors: [["Lavender", "#a78bfa"]],
    sizes: ["S", "M", "L", "XL"],
    opening: 25,
    reorder: 5,
    popularity: 4,
    description: "Commemorative tee from the Spring Gala.",
    design: { style: "stacked", ink: "#ffffff" },
  },
  {
    name: "Dad Cap",
    category: "Cap",
    price: 349,
    member: 299,
    cost: 150,
    colors: [
      ["Black", "#111827"],
      ["Beige", "#d6c7a1"],
    ],
    sizes: ["ONE"],
    opening: 40,
    reorder: 8,
    popularity: 4,
    description: "Unstructured cotton cap with embroidered initials.",
  },
  {
    name: "Canvas Tote",
    category: "Tote",
    price: 299,
    member: 249,
    cost: 110,
    colors: [["Natural", "#e7dcc8"]],
    sizes: ["ONE"],
    opening: 60,
    reorder: 10,
    popularity: 3,
    description: "Sturdy 12-oz canvas tote.",
    design: { style: "badge", ink: "#1e3a8a" },
  },
  {
    name: "Council Mug",
    category: "Mug",
    price: 249,
    member: 209,
    cost: 120,
    colors: [["White", "#f5f5f4"]],
    sizes: ["ONE"],
    opening: 45,
    reorder: 8,
    popularity: 2,
    description: "Ceramic mug, dishwasher safe.",
    design: { style: "minimal", ink: "#7f1d1d" },
  },
];

export async function seedMerch(db: Db) {
  const now = new Date();
  const org = await db.organization.findFirstOrThrow({ select: { name: true, shortName: true } });
  const users = await db.user.findMany({
    where: { status: { not: "SUSPENDED" } },
    select: {
      id: true,
      name: true,
      phone: true,
      roles: { select: { role: { select: { key: true } } } },
      memberships: { select: { status: true, startDate: true, endDate: true } },
    },
  });
  const hasRole = (u: (typeof users)[number], ...k: string[]) => u.roles.some((r) => k.includes(r.role.key));
  const merchTeam = users.filter((u) => hasRole(u, "merchandise_manager", "committee_member"));
  const manager = users.find((u) => hasRole(u, "merchandise_manager")) ?? merchTeam[0];
  const reviewer = users.find((u) => hasRole(u, "president")) ?? manager;
  const memberAt = (u: (typeof users)[number], t: Date) =>
    u.memberships.some((m) => m.status === "ACTIVE" && m.startDate! <= t && m.endDate! >= t);

  // ── Studio designs (one per designed product, plus concepts in every state) ──
  const designRows: Prisma.MerchDesignCreateManyInput[] = [];
  const designFor = new Map<string, string>();
  for (const p of PRODUCTS.filter((p) => p.design)) {
    const id = faker.string.uuid();
    designFor.set(p.name, id);
    const type =
      p.category === "Hoodie"
        ? "hoodie"
        : p.category === "T-shirt"
          ? "tshirt"
          : p.category === "Cap"
            ? "cap"
            : p.category === "Tote"
              ? "tote"
              : "mug";
    designRows.push({
      id,
      name: p.name,
      productType: type,
      baseColor: p.colors[0][1],
      inkColor: p.design!.ink,
      artworkSvg: templateArtwork({
        style: p.design!.style,
        title: p.name.includes("Varsity") ? org.shortName : p.name.includes("Gala") ? "Spring Gala" : org.name,
        subtitle: "2026",
        ink: p.design!.ink,
      }),
      artworkSource: "template",
      sizes: p.sizes.filter((s) => s !== "ONE"),
      estimatedCostPaise: p.cost * 100,
      sellingPricePaise: p.price * 100,
      status: "APPROVED",
      createdById: manager.id,
      reviewedById: reviewer.id,
      reviewedAt: daysAgo(330),
      createdAt: daysAgo(360),
    });
  }
  const CONCEPTS: {
    name: string;
    type: string;
    base: string;
    ink: string;
    style: TemplateStyle;
    title: string;
    status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
    price: number;
    note?: string;
    back?: string;
  }[] = [
    {
      name: "Diwali Gala Tee 2026",
      type: "tshirt",
      base: "#7c2d12",
      ink: "#facc15",
      style: "badge",
      title: "Diwali Gala",
      status: "IN_REVIEW",
      price: 449,
      back: "FESTIVAL OF LIGHTS",
    },
    {
      name: "Tech Fest Hoodie 2027",
      type: "hoodie",
      base: "#0f172a",
      ink: "#22d3ee",
      style: "stacked",
      title: "Build Break Ship",
      status: "DRAFT",
      price: 1099,
    },
    {
      name: "Alumni Homecoming Cap",
      type: "cap",
      base: "#1e3a8a",
      ink: "#ffffff",
      style: "minimal",
      title: "Alumni",
      status: "REJECTED",
      price: 399,
      note: "Too plain for the price — try an embroidered crest and a contrast brim.",
    },
    {
      name: "Freshers Tote 2026",
      type: "tote",
      base: "#e7dcc8",
      ink: "#14532d",
      style: "stamp",
      title: "Class of 2030",
      status: "APPROVED",
      price: 299,
    },
    {
      name: "Sports Meet Jersey Tee",
      type: "tshirt",
      base: "#14532d",
      ink: "#ffffff",
      style: "varsity",
      title: org.shortName,
      status: "IN_REVIEW",
      price: 499,
      back: "TEAM HORIZON",
    },
    {
      name: "Winter Hoodie 2027",
      type: "hoodie",
      base: "#6b7280",
      ink: "#111827",
      style: "badge",
      title: org.name,
      status: "DRAFT",
      price: 1149,
    },
    {
      name: "Council Mug — Gold Edition",
      type: "mug",
      base: "#111827",
      ink: "#facc15",
      style: "stamp",
      title: "Est. 2016",
      status: "DRAFT",
      price: 299,
    },
    {
      name: "Robotics Club Tee",
      type: "tshirt",
      base: "#111827",
      ink: "#f97316",
      style: "stacked",
      title: "Robots Rule",
      status: "APPROVED",
      price: 449,
    },
    {
      name: "Open Mic Tote",
      type: "tote",
      base: "#facc15",
      ink: "#111827",
      style: "minimal",
      title: "Say It Loud",
      status: "REJECTED",
      price: 279,
      note: "Yellow canvas costs ₹40 more per unit — check the margin.",
    },
    {
      name: "Garba Night Tee",
      type: "tshirt",
      base: "#be185d",
      ink: "#ffffff",
      style: "badge",
      title: "Garba Night",
      status: "DRAFT",
      price: 429,
    },
  ];
  for (const c of CONCEPTS.slice(0, bySize(6, 10))) {
    const created = between(120, 3);
    designRows.push({
      name: c.name,
      productType: c.type,
      baseColor: c.base,
      inkColor: c.ink,
      frontText: c.title,
      backText: c.back ?? null,
      artworkSvg: templateArtwork({ style: c.style, title: c.title, subtitle: "2026", ink: c.ink }),
      artworkSource: "template",
      aiPrompt: `${c.style} style design for ${c.name}`,
      sizes: c.type === "hoodie" || c.type === "tshirt" ? ["S", "M", "L", "XL"] : [],
      estimatedCostPaise: Math.round(c.price * 0.52) * 100,
      sellingPricePaise: c.price * 100,
      status: c.status,
      reviewNote: c.note ?? null,
      createdById: faker.helpers.arrayElement(merchTeam).id,
      reviewedById: c.status === "APPROVED" || c.status === "REJECTED" ? reviewer.id : null,
      reviewedAt: c.status === "APPROVED" || c.status === "REJECTED" ? new Date(created.getTime() + 2 * DAY) : null,
      createdAt: created,
    });
  }
  await db.merchDesign.createMany({ data: designRows });

  // ── Products & variants ──
  type V = { id: string; productIdx: number; size: string; color: string; stock: number; reorder: number };
  const variants: V[] = [];
  const movements: Prisma.StockMovementCreateManyInput[] = [];
  for (const [pi, p] of PRODUCTS.entries()) {
    const created = daysAgo(400 - pi * 20);
    const product = await db.product.create({
      data: {
        name: p.name,
        category: p.category,
        description: p.description,
        publicPricePaise: p.price * 100,
        memberPricePaise: p.member * 100,
        unitCostPaise: p.cost * 100,
        status: "ACTIVE",
        designId: designFor.get(p.name) ?? null,
        createdAt: created,
      },
    });
    for (const [color, hex] of p.colors) {
      for (const size of p.sizes) {
        const id = faker.string.uuid();
        // Opening stock leans towards popular sizes, the way a real first order would.
        const opening = Math.round(p.opening * (size === "ONE" ? 1 : SIZE_WEIGHT[size] / 18) * bySize(0.6, 1)) + 4;
        await db.productVariant.create({
          data: {
            id,
            productId: product.id,
            sku: skuFor(p.name, color, size),
            size,
            color,
            colorHex: hex,
            stock: 0,
            reorderLevel: p.reorder,
            createdAt: created,
          },
        });
        variants.push({ id, productIdx: pi, size, color, stock: opening, reorder: p.reorder });
        movements.push({
          variantId: id,
          change: opening,
          stockAfter: opening,
          reason: "RESTOCK",
          note: "Opening stock from printer",
          actorId: manager.id,
          createdAt: created,
        });
      }
    }
  }
  const productIds = await db.product.findMany({ select: { id: true, name: true } });
  const idOf = (i: number) => productIds.find((p) => p.name === PRODUCTS[i].name)!.id;

  // ── Orders over the last year, chronologically so stock stays consistent ──
  const orderCount = bySize(70, 260);
  const times = Array.from({ length: orderCount }, () => between(360, 0)).sort((a, b) => a.getTime() - b.getTime());
  const orders: Prisma.MerchOrderCreateManyInput[] = [];
  const items: Prisma.MerchOrderItemCreateManyInput[] = [];
  const payments: Omit<Prisma.PaymentCreateManyInput, "receiptNumber">[] = [];
  const perYear = new Map<number, number>();
  const restockedAt = new Map<string, number>();

  for (const t of times) {
    const buyer = faker.datatype.boolean(0.85) ? faker.helpers.arrayElement(users) : null;
    const member = !!buyer && memberAt(buyer, t);
    const lineCount = faker.helpers.weightedArrayElement([
      { weight: 70, value: 1 },
      { weight: 24, value: 2 },
      { weight: 6, value: 3 },
    ]);
    const lines: { v: V; qty: number }[] = [];
    for (let i = 0; i < lineCount; i++) {
      const pi = faker.helpers.weightedArrayElement(PRODUCTS.map((p, idx) => ({ weight: p.popularity, value: idx })));
      const pool = variants.filter((v) => v.productIdx === pi && v.stock > 0 && !lines.some((l) => l.v.id === v.id));
      if (!pool.length) continue;
      const v = faker.helpers.weightedArrayElement(pool.map((x) => ({ weight: SIZE_WEIGHT[x.size] ?? 10, value: x })));
      lines.push({ v, qty: Math.min(v.stock, faker.datatype.boolean(0.9) ? 1 : 2) });
    }
    if (!lines.length) continue;

    const recent = now.getTime() - t.getTime() < 2 * DAY;
    const status = recent
      ? faker.helpers.weightedArrayElement([
          { weight: 5, value: "PENDING_PAYMENT" as const },
          { weight: 5, value: "PAID" as const },
        ])
      : now.getTime() - t.getTime() < 10 * DAY && faker.datatype.boolean(0.25)
        ? ("PAID" as const)
        : faker.helpers.weightedArrayElement([
            { weight: 92, value: "FULFILLED" as const },
            { weight: 5, value: "CANCELLED" as const },
            { weight: 3, value: "REFUNDED" as const },
          ]);
    const desk = !recent && faker.datatype.boolean(0.3);
    const y = t.getFullYear();
    const n = (perYear.get(y) ?? 0) + 1;
    perYear.set(y, n);
    const orderId = faker.string.uuid();
    const orderNumber = `MRC-${y}-${String(n).padStart(5, "0")}`;
    const total = lines.reduce((s, l) => s + l.qty * (member ? PRODUCTS[l.v.productIdx].member : PRODUCTS[l.v.productIdx].price) * 100, 0);
    const name = buyer?.name ?? `${faker.person.firstName()} ${faker.person.lastName()}`;

    orders.push({
      id: orderId,
      orderNumber,
      buyerId: buyer?.id ?? null,
      buyerName: name,
      buyerPhone: buyer?.phone ?? null,
      status,
      channel: desk ? "DOOR" : "ONLINE",
      totalPaise: total,
      claimedReference: status === "PENDING_PAYMENT" && faker.datatype.boolean(0.5) ? faker.string.numeric(12) : null,
      holdUntil: status === "PENDING_PAYMENT" ? new Date(t.getTime() + 48 * 3600_000) : null,
      fulfilledAt:
        status === "FULFILLED" ? new Date(Math.min(now.getTime(), t.getTime() + faker.number.int({ min: 0, max: 5 }) * DAY)) : null,
      fulfilledById: status === "FULFILLED" ? faker.helpers.arrayElement(merchTeam).id : null,
      createdAt: t,
    });
    for (const l of lines) {
      const p = PRODUCTS[l.v.productIdx];
      items.push({
        orderId,
        variantId: l.v.id,
        quantity: l.qty,
        unitPricePaise: (member ? p.member : p.price) * 100,
        isMemberPrice: member,
      });
      l.v.stock -= l.qty;
      movements.push({
        variantId: l.v.id,
        change: -l.qty,
        stockAfter: l.v.stock,
        reason: "SALE",
        note: orderNumber,
        orderId,
        actorId: buyer?.id ?? manager.id,
        createdAt: t,
      });
      if (status === "CANCELLED" || status === "REFUNDED") {
        l.v.stock += l.qty;
        movements.push({
          variantId: l.v.id,
          change: l.qty,
          stockAfter: l.v.stock,
          reason: "RELEASE" as StockReason,
          note: `${status === "REFUNDED" ? "Refund" : "Cancelled"} ${orderNumber}`,
          orderId,
          actorId: manager.id,
          createdAt: new Date(t.getTime() + DAY),
        });
      }
      // The merch team restocks a size once it falls to its reorder level (not for the story variant).
      const story = p.name === "Classic Logo Hoodie" && l.v.color === "Black" && l.v.size === "M";
      if (!story && l.v.stock <= l.v.reorder && (restockedAt.get(l.v.id) ?? 0) < t.getTime() - 30 * DAY) {
        const qty = Math.round(((p.opening * (SIZE_WEIGHT[l.v.size] ?? 18)) / 18) * bySize(0.6, 1)) + 6;
        l.v.stock += qty;
        restockedAt.set(l.v.id, t.getTime());
        movements.push({
          variantId: l.v.id,
          change: qty,
          stockAfter: l.v.stock,
          reason: "RESTOCK",
          note: "Reorder delivery",
          actorId: manager.id,
          createdAt: new Date(t.getTime() + 3 * DAY),
        });
      }
    }
    if (status !== "PENDING_PAYMENT") {
      const method = desk
        ? faker.helpers.weightedArrayElement([
            { weight: 55, value: "CASH" as const },
            { weight: 45, value: "UPI" as const },
          ])
        : ("UPI" as const);
      payments.push({
        purpose: "MERCH",
        payerId: buyer?.id ?? null,
        merchOrderId: orderId,
        amountPaise: total,
        method,
        reference: method === "UPI" ? faker.string.numeric(12) : null,
        status: status === "REFUNDED" ? "REFUNDED" : status === "CANCELLED" ? "REFUNDED" : "PAID",
        receivedById: faker.helpers.arrayElement(merchTeam).id,
        paidAt: new Date(t.getTime() + faker.number.int({ min: 5, max: 300 }) * 60_000),
      });
    }
  }
  // Cancelled orders never had money taken.
  const cancelledIds = new Set(orders.filter((o) => o.status === "CANCELLED").map((o) => o.id));
  const paidPayments = payments.filter((p) => !cancelledIds.has(p.merchOrderId as string));

  // ── Story: the black M Classic Logo Hoodie sits right at its reorder level ──
  const story = variants.find((v) => PRODUCTS[v.productIdx].name === "Classic Logo Hoodie" && v.color === "Black" && v.size === "M")!;
  const target = Math.max(0, story.reorder - 2);
  if (story.stock !== target) {
    const change = target - story.stock;
    story.stock = target;
    movements.push({
      variantId: story.id,
      change,
      stockAfter: target,
      reason: change > 0 ? "RESTOCK" : "ADJUSTMENT",
      note: change > 0 ? "Partial delivery" : "Stock count correction (cycle count)",
      actorId: manager.id,
      createdAt: daysAgo(2),
    });
  }
  // A couple of damaged units, for a realistic history.
  for (const v of faker.helpers.arrayElements(
    variants.filter((x) => x.stock > 6 && x !== story),
    3,
  )) {
    v.stock -= 1;
    movements.push({
      variantId: v.id,
      change: -1,
      stockAfter: v.stock,
      reason: "DAMAGED",
      note: "Print defect found during packing",
      actorId: manager.id,
      createdAt: between(60, 1),
    });
  }

  await db.merchOrder.createMany({ data: orders });
  await db.merchOrderItem.createMany({ data: items });
  for (const v of variants) await db.productVariant.update({ where: { id: v.id }, data: { stock: v.stock } });
  for (let i = 0; i < movements.length; i += 2000) await db.stockMovement.createMany({ data: movements.slice(i, i + 2000) });

  // Receipts continue each year's sequence.
  const lastByYear = new Map<number, number>();
  for (const p of await db.payment.findMany({ select: { receiptNumber: true } })) {
    const [, y, n] = p.receiptNumber.split("-");
    lastByYear.set(Number(y), Math.max(lastByYear.get(Number(y)) ?? 0, Number(n)));
  }
  paidPayments.sort((a, b) => (a.paidAt as Date).getTime() - (b.paidAt as Date).getTime());
  await db.payment.createMany({
    data: paidPayments.map((p) => {
      const y = (p.paidAt as Date).getFullYear();
      const n = (lastByYear.get(y) ?? 0) + 1;
      lastByYear.set(y, n);
      return { ...p, receiptNumber: `RCP-${y}-${String(n).padStart(5, "0")}` };
    }),
  });

  await db.auditLog.createMany({
    data: [
      ...PRODUCTS.map((p, i) => ({
        actorId: manager.id,
        actorName: manager.name,
        action: "product.create",
        entityType: "Product",
        entityId: idOf(i),
        summary: `Created product "${p.name}" — ₹${p.price} (₹${p.member} members)`,
        createdAt: daysAgo(400 - i * 20),
      })),
      ...designRows.map((d) => ({
        actorId: d.createdById ?? manager.id,
        actorName: users.find((u) => u.id === d.createdById)?.name ?? manager.name,
        action: "design.create",
        entityType: "MerchDesign",
        entityId: d.id ?? null,
        summary: `Created design "${d.name}"`,
        createdAt: d.createdAt as Date,
      })),
      {
        actorId: manager.id,
        actorName: manager.name,
        action: "stock.adjust",
        entityType: "Product",
        entityId: idOf(0),
        summary: `Inventory Classic Logo Hoodie Black/M: count correction → ${target}`,
        createdAt: daysAgo(2),
      },
    ],
  });

  const totalUnits = items.reduce((s, i) => s + (i.quantity as number), 0);
  return {
    products: PRODUCTS.length,
    variants: variants.length,
    designs: designRows.length,
    orders: orders.length,
    unitsSold: totalUnits,
    stockMovements: movements.length,
    merchRevenue: `₹${(paidPayments.filter((p) => p.status === "PAID").reduce((s, p) => s + (p.amountPaise as number), 0) / 100).toLocaleString("en-IN")}`,
    lowStockVariants: variants.filter((v) => v.stock <= v.reorder).length,
    asOf: TODAY.toISOString().slice(0, 10),
  };
}
