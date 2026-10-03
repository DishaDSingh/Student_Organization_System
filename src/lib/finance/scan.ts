import "server-only";
import { z } from "zod";
import { AI_UNAVAILABLE_MESSAGE, structured } from "@/lib/ai/claude";
import { readUploadBase64 } from "@/lib/uploads";
import { EXPENSE_CATEGORIES, type ReceiptGuess } from "./rules";

/**
 * AI Receipt Scanner (Phase 8). Claude reads the photo/PDF and suggests the
 * expense fields. It only ever *suggests*: the person checks the form and
 * submits, and the treasurer still approves.
 */

const ReceiptSchema = z.object({
  isReceipt: z.boolean().describe("False if the image is not a bill, receipt or invoice."),
  vendor: z.string().nullable().describe("Shop or company name as printed."),
  date: z.string().nullable().describe("Purchase date as YYYY-MM-DD. Indian receipts write dates day-first."),
  totalRupees: z.number().nullable().describe("Grand total actually paid, in rupees, including tax."),
  taxRupees: z.number().nullable().describe("Total GST/tax included in the total, in rupees. Null if not shown."),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().describe("A short plain description of what was bought, e.g. '40 samosas for volunteers'."),
  confidence: z.enum(["high", "medium", "low"]).describe("How clearly the amount and date could be read."),
});

const SYSTEM = `You read receipts for a student organisation's treasurer in India.
Extract only what is printed. Never guess an amount: if the total is unreadable, return null.
Amounts are in Indian rupees (₹). Pick the closest category from the list.`;

export type ScanResult = ReceiptGuess & {
  description: string;
  source: "ai" | "none";
  notice: string;
  confidence?: "high" | "medium" | "low";
};

const empty = (notice: string): ScanResult => ({
  vendor: null,
  date: null,
  totalRupees: null,
  taxRupees: null,
  category: "Other",
  description: "",
  source: "none",
  notice,
});

export async function scanReceipt(uploadId: string): Promise<ScanResult> {
  const file = await readUploadBase64(uploadId);
  if (!file) return empty("Receipt not found.");

  const block =
    file.mimeType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: file.mimeType as "image/png" | "image/jpeg" | "image/webp", data: file.data },
        } as const);

  const ai = await structured({
    schema: ReceiptSchema,
    system: SYSTEM,
    effort: "low",
    maxTokens: 2000,
    content: [block, { type: "text", text: "Read this receipt." }],
  });

  if (!ai.ok) {
    return empty(
      AI_UNAVAILABLE_MESSAGE[ai.reason].replace("the offline generator was used", "please fill in the details yourself") +
        " Tip: paste the receipt text below and we'll read it offline.",
    );
  }
  if (!ai.data.isReceipt) return empty("That doesn't look like a receipt — please check the photo or fill in the details yourself.");

  const d = ai.data;
  return {
    vendor: d.vendor,
    date: d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null,
    totalRupees: d.totalRupees && d.totalRupees > 0 ? Math.round(d.totalRupees * 100) / 100 : null,
    taxRupees: d.taxRupees && d.taxRupees > 0 ? Math.round(d.taxRupees * 100) / 100 : null,
    category: d.category,
    description: d.description,
    confidence: d.confidence,
    source: "ai",
    notice:
      d.confidence === "high"
        ? "Filled in from your receipt — please check before submitting."
        : "Some details were hard to read — please check them carefully.",
  };
}
