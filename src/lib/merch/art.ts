import { svgDataUri } from "./artwork";
import { productTypeFor, type ProductTypeKey } from "./rules";

type DesignLike = {
  productType: string;
  baseColor: string;
  inkColor: string;
  artworkSvg: string | null;
  logoUploadId: string | null;
  frontText: string | null;
  backText: string | null;
} | null;

/** Dark ink on light garments, light ink on dark ones. */
export function contrastInk(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? "#111827" : "#ffffff";
}

/** Props for <MockupFace>/<Mockup3D> from a product's studio design (or a plain fallback). */
export function mockupProps(p: { category: string; name: string; design: DesignLike; variants?: { colorHex: string }[] }) {
  const d = p.design;
  const type = (d?.productType as ProductTypeKey | undefined) ?? productTypeFor(p.category);
  const artwork = d?.artworkSvg ? svgDataUri(d.artworkSvg) : d?.logoUploadId ? `/api/uploads/${d.logoUploadId}` : null;
  const color = p.variants?.[0]?.colorHex ?? d?.baseColor ?? "#111827";
  const ink = d?.inkColor ?? contrastInk(color);
  return {
    type,
    color,
    front: { artwork, text: artwork ? null : (d?.frontText ?? p.name.split(" ").slice(0, 2).join(" ")), ink },
    back: { artwork: null, text: d?.backText ?? null, ink },
  };
}
