import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/** The CRM's public address, e.g. https://crm.eplanetintl.com */
export async function publicBase() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** An SVG QR code, dark navy on white, with a quiet zone so phones read it reliably. */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#1b2462", light: "#ffffff" } });
}
