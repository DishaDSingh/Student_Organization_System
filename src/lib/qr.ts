import "server-only";
import QRCode from "qrcode";

/** Inline SVG QR code — rendered on the server, works offline, scales crisply. */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } });
}

/** Standard UPI deep link: any UPI app (GPay, PhonePe, Paytm, BHIM) can scan it. */
export function upiUri({ upiId, payee, amountPaise, note }: { upiId: string; payee: string; amountPaise: number; note: string }) {
  const q = new URLSearchParams({ pa: upiId, pn: payee, am: (amountPaise / 100).toFixed(2), cu: "INR", tn: note.slice(0, 60) });
  return `upi://pay?${q.toString()}`;
}
