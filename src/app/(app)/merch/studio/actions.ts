"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, guardedAction, ok } from "@/lib/action";
import { AI_UNAVAILABLE_MESSAGE, structured } from "@/lib/ai/claude";
import { sanitizeSvg, templateArtwork, TEMPLATE_STYLES } from "@/lib/merch/artwork";
import { APPAREL_SIZES, PRODUCT_TYPES, skuFor, suggestedMemberPrice } from "@/lib/merch/rules";
import { formatINR, rupeesToPaise } from "@/lib/membership/rules";
import { designIdSchema, designSchema, generateArtworkSchema, reviewDesignSchema } from "@/lib/validation/schemas";

type Generated = { svg: string; source: "ai" | "template"; title: string; notice: string };

const ArtworkSchema = z.object({
  svg: z.string().describe("A complete, self-contained SVG document, viewBox 0 0 300 300, transparent background."),
  title: z.string().describe("A short name for the design, 2–5 words."),
  notes: z.string().describe("One sentence on the idea behind the design."),
});

const SYSTEM = `You design print artwork for a student organisation's merchandise (hoodies, t-shirts, caps, totes, mugs).
Return a single self-contained SVG for the print area:
- viewBox="0 0 300 300", transparent background (no full-size background rect).
- Use only basic shapes, paths and text: <path>, <circle>, <rect>, <ellipse>, <line>, <polygon>, <polyline>, <g>, <text>, <textPath>, <defs>, <linearGradient>, <radialGradient>, <stop>.
- No <script>, <image>, <foreignObject>, <style>, <use>, animation, external fonts or URLs. Use generic font families only (Arial, Helvetica, sans-serif, serif).
- Use the requested ink colour as the main colour; at most two extra colours. It must stay legible on the garment colour.
- Keep it screen-printable: bold shapes, no photo-realism, no tiny detail, under 40 elements.
- Never reproduce third-party logos, trademarks or copyrighted characters.`;

/**
 * Generate print artwork. Claude when configured and reachable; otherwise the
 * offline template designer, picked to match the prompt — so the studio always works.
 */
export const generateArtwork = guardedAction({ permission: "merchandise.studio", schema: generateArtworkSchema }, async (input, actor) => {
  const org = await db.organization.findFirst({ select: { name: true, shortName: true } });
  const type = PRODUCT_TYPES.find((t) => t.key === input.productType)!.label;

  const ai = await structured({
    schema: ArtworkSchema,
    system: SYSTEM,
    effort: "medium",
    maxTokens: 12000,
    content: `Organisation: ${org?.name} (${org?.shortName}).
Product: ${type}, garment colour ${input.baseColor}, ink colour ${input.inkColor}.
Brief: ${input.prompt}`,
  });

  if (ai.ok) {
    const svg = sanitizeSvg(ai.data.svg);
    if (svg) {
      await db.$transaction((tx) =>
        audit(tx, {
          actor,
          action: "studio.ai_generate",
          entityType: "MerchDesign",
          summary: `Generated AI artwork "${ai.data.title}" (${ai.model}) — prompt: ${input.prompt.slice(0, 120)}`,
        }),
      );
      return ok<Generated>({ svg, source: "ai", title: ai.data.title, notice: ai.data.notes });
    }
  }

  // Offline fallback: choose a template style from words in the prompt.
  const p = input.prompt.toLowerCase();
  const style =
    TEMPLATE_STYLES.find((s) => p.includes(s.key))?.key ??
    (/(college|varsity|sport|team|athletic)/.test(p)
      ? "varsity"
      : /(badge|crest|emblem|circle)/.test(p)
        ? "badge"
        : /(bold|big|loud)/.test(p)
          ? "stacked"
          : /(retro|vintage|stamp)/.test(p)
            ? "stamp"
            : "minimal");
  const quoted = input.prompt.match(/["“](.+?)["”]/)?.[1];
  const svg = templateArtwork({
    style,
    title: quoted ?? org?.name ?? "CampusBuzz",
    subtitle: String(new Date().getFullYear()),
    ink: input.inkColor,
  });
  const reason = ai.ok ? "invalid" : ai.reason;
  return ok<Generated>({
    svg,
    source: "template",
    title: `${style[0].toUpperCase()}${style.slice(1)} concept`,
    notice: AI_UNAVAILABLE_MESSAGE[reason],
  });
});

export const saveDesign = guardedAction({ permission: "merchandise.studio", schema: designSchema }, async (input, actor) => {
  const { designId, estimatedCostRupees, sellingPriceRupees, artworkSvg, ...rest } = input;
  const svg = artworkSvg ? sanitizeSvg(artworkSvg) : null;
  if (artworkSvg && !svg) return fail("That artwork isn't a valid SVG.");
  const data = {
    ...rest,
    frontText: rest.frontText ?? null,
    backText: rest.backText ?? null,
    aiPrompt: rest.aiPrompt ?? null,
    logoUploadId: rest.logoUploadId ?? null,
    artworkSvg: svg,
    artworkSource: svg ? (rest.artworkSource ?? "template") : rest.logoUploadId ? "upload" : null,
    estimatedCostPaise: rupeesToPaise(estimatedCostRupees),
    sellingPricePaise: rupeesToPaise(sellingPriceRupees),
  };

  const id = await db
    .$transaction(async (tx) => {
      if (designId) {
        const d = await tx.merchDesign.findUniqueOrThrow({ where: { id: designId }, select: { status: true } });
        if (d.status === "APPROVED") throw new Error("APPROVED");
        // Editing a reviewed design sends it back to draft.
        await tx.merchDesign.update({ where: { id: designId }, data: { ...data, status: "DRAFT", reviewNote: null } });
        await audit(tx, {
          actor,
          action: "design.update",
          entityType: "MerchDesign",
          entityId: designId,
          summary: `Updated design "${data.name}"`,
        });
        return designId;
      }
      const d = await tx.merchDesign.create({ data: { ...data, createdById: actor.id } });
      await audit(tx, {
        actor,
        action: "design.create",
        entityType: "MerchDesign",
        entityId: d.id,
        summary: `Created design "${d.name}" (${d.productType}, ${formatINR(d.sellingPricePaise)})`,
      });
      return d.id;
    })
    .catch((e: Error) => (e.message === "APPROVED" ? null : Promise.reject(e)));
  if (!id) return fail("Approved designs are locked. Duplicate it to make changes.");

  revalidatePath("/merch/studio");
  revalidatePath(`/merch/studio/${id}`);
  return ok({ id }, "Design saved");
});

export const submitDesign = guardedAction({ permission: "merchandise.studio", schema: designIdSchema }, async ({ designId }, actor) => {
  const d = await db.merchDesign.findUnique({
    where: { id: designId },
    select: { name: true, status: true, artworkSvg: true, logoUploadId: true, frontText: true, sizes: true, productType: true },
  });
  if (!d) return fail("Design not found.");
  if (d.status !== "DRAFT" && d.status !== "REJECTED") return fail("Only drafts can be sent for review.");
  if (!d.artworkSvg && !d.logoUploadId && !d.frontText) return fail("Add artwork, a logo or front text first.");
  if (PRODUCT_TYPES.find((t) => t.key === d.productType)!.apparel && d.sizes.length === 0) return fail("Pick the sizes to offer.");
  await db.$transaction(async (tx) => {
    await tx.merchDesign.update({ where: { id: designId }, data: { status: "IN_REVIEW" } });
    await audit(tx, {
      actor,
      action: "design.submit",
      entityType: "MerchDesign",
      entityId: designId,
      summary: `Sent design "${d.name}" for review`,
    });
  });
  revalidatePath(`/merch/studio/${designId}`);
  revalidatePath("/merch/studio");
  return ok(undefined, "Sent for review");
});

export const reviewDesign = guardedAction(
  { permission: "merchandise.manage_products", schema: reviewDesignSchema },
  async ({ designId, decision, note }, actor) => {
    const d = await db.merchDesign.findUnique({ where: { id: designId }, select: { name: true, status: true, createdById: true } });
    if (!d) return fail("Design not found.");
    if (d.status !== "IN_REVIEW") return fail("This design isn't waiting for review.");
    // Four-eyes rule: someone other than the designer signs off (Master Admins excepted).
    if (d.createdById === actor.id && !actor.isMasterAdmin)
      return fail("You can't review your own design — ask another merch lead or the President.");
    if (decision === "REJECTED" && !note) return fail("Say what should change.", { note: ["Required when sending back"] });
    await db.$transaction(async (tx) => {
      await tx.merchDesign.update({
        where: { id: designId },
        data: { status: decision, reviewNote: note ?? null, reviewedById: actor.id, reviewedAt: new Date() },
      });
      await audit(tx, {
        actor,
        action: decision === "APPROVED" ? "design.approve" : "design.reject",
        entityType: "MerchDesign",
        entityId: designId,
        summary: `${decision === "APPROVED" ? "Approved" : "Sent back"} design "${d.name}"${note ? ` — ${note}` : ""}`,
      });
      if (d.createdById && d.createdById !== actor.id) {
        await tx.notification.create({
          data: {
            userId: d.createdById,
            type: "design.reviewed",
            title: decision === "APPROVED" ? `"${d.name}" approved` : `"${d.name}" needs changes`,
            body: note ?? "Ready to become a product.",
            link: `/merch/studio/${designId}`,
          },
        });
      }
    });
    revalidatePath(`/merch/studio/${designId}`);
    return ok(undefined, decision === "APPROVED" ? "Approved" : "Sent back to the designer");
  },
);

/** Turn an approved concept into a draft product (zero stock until the order from the printer arrives). */
export const createProductFromDesign = guardedAction(
  { permission: "merchandise.manage_products", schema: designIdSchema },
  async ({ designId }, actor) => {
    const d = await db.merchDesign.findUnique({ where: { id: designId }, include: { product: { select: { id: true } } } });
    if (!d) return fail("Design not found.");
    if (d.status !== "APPROVED") return fail("Approve the design first.");
    if (d.product) return ok({ id: d.product.id }, "Already a product");

    const type = PRODUCT_TYPES.find((t) => t.key === d.productType)!;
    const sizes = type.apparel ? (d.sizes.length ? d.sizes : [...APPAREL_SIZES]) : ["ONE"];
    const product = await db.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: d.name,
          category: type.category,
          description: `From the Merch Studio design "${d.name}".`,
          publicPricePaise: d.sellingPricePaise,
          memberPricePaise: suggestedMemberPrice(d.sellingPricePaise),
          unitCostPaise: d.estimatedCostPaise,
          status: "DRAFT",
          designId: d.id,
          variants: {
            create: sizes.map((size) => ({ size, color: "Studio", colorHex: d.baseColor, sku: skuFor(d.name, "STUDIO", size) })),
          },
        },
      });
      await audit(tx, {
        actor,
        action: "product.create",
        entityType: "Product",
        entityId: p.id,
        summary: `Created draft product "${p.name}" from an approved studio design (${sizes.length} sizes, no stock yet)`,
      });
      return p;
    });
    revalidatePath("/merch");
    return ok({ id: product.id }, "Draft product created — add stock and set it live");
  },
);
