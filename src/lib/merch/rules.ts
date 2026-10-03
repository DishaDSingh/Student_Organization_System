/** Merchandise rules (shared by pages, actions, seed and tests). */

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "ONE"] as const;
export const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export const sizeRank = (s: string) => {
  const i = (SIZE_ORDER as readonly string[]).indexOf(s);
  return i === -1 ? 99 : i;
};

export const PRODUCT_TYPES = [
  { key: "hoodie", label: "Hoodie", category: "Hoodie", apparel: true, baseCost: 42000 },
  { key: "tshirt", label: "T-shirt", category: "T-shirt", apparel: true, baseCost: 18000 },
  { key: "cap", label: "Cap", category: "Cap", apparel: false, baseCost: 12000 },
  { key: "tote", label: "Tote bag", category: "Tote", apparel: false, baseCost: 9000 },
  { key: "mug", label: "Mug", category: "Mug", apparel: false, baseCost: 11000 },
] as const;
export type ProductTypeKey = (typeof PRODUCT_TYPES)[number]["key"];
export const productTypeFor = (category: string): ProductTypeKey =>
  PRODUCT_TYPES.find((t) => t.category.toLowerCase() === category.toLowerCase())?.key ?? "tshirt";

/** Members get 15% off merchandise (a plan benefit), rounded to the nearest rupee. */
export const MEMBER_DISCOUNT = 0.15;
export const suggestedMemberPrice = (publicPaise: number) => Math.round((publicPaise * (1 - MEMBER_DISCOUNT)) / 100) * 100;

/** Print cost: front print ₹60, back print ₹80, uploaded logo setup ₹40 (rough estimate for planning only). */
export function estimateCostPaise(type: ProductTypeKey, opts: { front: boolean; back: boolean; logo: boolean }) {
  const base = PRODUCT_TYPES.find((t) => t.key === type)!.baseCost;
  return base + (opts.front ? 6000 : 0) + (opts.back ? 8000 : 0) + (opts.logo ? 4000 : 0);
}

export const marginPct = (pricePaise: number, costPaise: number) =>
  pricePaise > 0 ? Math.round(((pricePaise - costPaise) / pricePaise) * 100) : 0;

export type StockState = "OUT" | "LOW" | "OK";
export const stockState = (v: { stock: number; reorderLevel: number }): StockState =>
  v.stock <= 0 ? "OUT" : v.stock <= v.reorderLevel ? "LOW" : "OK";

/** Members pay the member price on every item (it's a standing benefit, unlike event tickets). */
export function priceMerch(lines: { quantity: number; publicPricePaise: number; memberPricePaise: number }[], isActiveMember: boolean) {
  const items = lines.map((l) => ({
    unitPricePaise: isActiveMember ? l.memberPricePaise : l.publicPricePaise,
    isMemberPrice: isActiveMember && l.memberPricePaise < l.publicPricePaise,
  }));
  return { items, totalPaise: lines.reduce((s, l, i) => s + l.quantity * items[i].unitPricePaise, 0) };
}

export const skuFor = (productName: string, color: string, size: string) =>
  [productName, color, size]
    .map((p) =>
      p
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 6),
    )
    .join("-");

export const DESIGN_STATUS: Record<string, [label: string, tone: string]> = {
  DRAFT: ["Draft", "text-muted-foreground"],
  IN_REVIEW: ["In review", "text-info"],
  APPROVED: ["Approved", "text-success"],
  REJECTED: ["Changes requested", "text-destructive"],
};
