import { describe, expect, it } from "vitest";
import { estimateCostPaise, marginPct, priceMerch, skuFor, stockState, suggestedMemberPrice } from "@/lib/merch/rules";
import { sanitizeSvg, svgDataUri, templateArtwork, TEMPLATE_STYLES } from "@/lib/merch/artwork";
import { sniffMime } from "@/lib/uploads";
import { designSchema, newProductSchema, stockAdjustSchema } from "@/lib/validation/schemas";

describe("merch pricing & stock", () => {
  it("suggests a 15% member price rounded to the rupee", () => {
    expect(suggestedMemberPrice(99900)).toBe(84900);
    expect(suggestedMemberPrice(44900)).toBe(38200);
  });

  it("gives members the member price on every item", () => {
    const lines = [
      { quantity: 2, publicPricePaise: 99900, memberPricePaise: 84900 },
      { quantity: 1, publicPricePaise: 29900, memberPricePaise: 24900 },
    ];
    expect(priceMerch(lines, true).totalPaise).toBe(2 * 84900 + 24900);
    expect(priceMerch(lines, false).totalPaise).toBe(2 * 99900 + 29900);
  });

  it("flags low and out-of-stock variants", () => {
    expect(stockState({ stock: 0, reorderLevel: 5 })).toBe("OUT");
    expect(stockState({ stock: 5, reorderLevel: 5 })).toBe("LOW");
    expect(stockState({ stock: 6, reorderLevel: 5 })).toBe("OK");
  });

  it("estimates print cost and margin", () => {
    expect(estimateCostPaise("hoodie", { front: true, back: true, logo: false })).toBe(42000 + 6000 + 8000);
    expect(marginPct(99900, 48000)).toBe(52);
  });

  it("builds readable SKUs", () => {
    expect(skuFor("Classic Logo Hoodie", "Black", "M")).toBe("CLASSI-BLACK-M");
  });
});

describe("artwork safety", () => {
  it("every template produces a valid SVG that survives sanitising unchanged in meaning", () => {
    for (const s of TEMPLATE_STYLES) {
      const svg = templateArtwork({ style: s.key, title: "Horizon <Student> & Co", subtitle: "2026", ink: "#ffffff" });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toContain("<Student>"); // escaped
      expect(sanitizeSvg(svg)).toBeTruthy();
    }
  });

  it("strips scripts, event handlers, external references and foreign content", () => {
    const evil = `<?xml version="1.0"?><svg viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(1)</script><foreignObject><div>x</div></foreignObject>
      <a href="https://evil.test"><text>x</text></a>
      <image href="https://evil.test/x.png"/>
      <rect fill="url(https://evil.test/p.svg#g)" onclick="steal()" width="5" height="5"/>
      <circle r="2" fill="url(#ok)"/></svg>`;
    const clean = sanitizeSvg(evil)!;
    expect(clean).not.toMatch(/script|onload|onclick|foreignObject|evil\.test|<image|<a\b/i);
    expect(clean).toContain("url(#ok)");
    expect(clean).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("rejects non-SVG and oversized input", () => {
    expect(sanitizeSvg("hello")).toBeNull();
    expect(sanitizeSvg(`<svg>${"x".repeat(70_000)}</svg>`)).toBeNull();
  });

  it("encodes SVG as a data URI for <img>", () => {
    expect(svgDataUri("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });
});

describe("upload sniffing", () => {
  it("identifies files by content, not by name", () => {
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("merch validation", () => {
  it("requires sizes and colours for a new product", () => {
    const base = {
      name: "Test Hoodie",
      category: "Hoodie",
      publicPriceRupees: "999",
      memberPriceRupees: "849",
      unitCostRupees: "500",
      status: "DRAFT",
      initialStock: "10",
      reorderLevel: "3",
    };
    expect(newProductSchema.safeParse({ ...base, sizes: [], colors: [{ name: "Black", hex: "#111111" }] }).success).toBe(false);
    expect(newProductSchema.safeParse({ ...base, sizes: ["M"], colors: [] }).success).toBe(false);
    expect(newProductSchema.safeParse({ ...base, sizes: ["M"], colors: [{ name: "Black", hex: "#111111" }] }).success).toBe(true);
  });

  it("checks the direction of stock changes and asks for a reason", () => {
    expect(stockAdjustSchema.safeParse({ variantId: "v", reason: "RESTOCK", change: "-3" }).success).toBe(false);
    expect(stockAdjustSchema.safeParse({ variantId: "v", reason: "DAMAGED", change: "2", note: "torn" }).success).toBe(false);
    expect(stockAdjustSchema.safeParse({ variantId: "v", reason: "ADJUSTMENT", change: "-2" }).success).toBe(false);
    expect(stockAdjustSchema.safeParse({ variantId: "v", reason: "ADJUSTMENT", change: "-2", note: "cycle count" }).success).toBe(true);
  });

  it("warns when a design would sell below cost", () => {
    const d = {
      name: "Below Cost",
      productType: "hoodie",
      baseColor: "#111111",
      inkColor: "#ffffff",
      sizes: ["M"],
      estimatedCostRupees: "600",
      sellingPriceRupees: "500",
    };
    expect(designSchema.safeParse(d).success).toBe(false);
  });
});
