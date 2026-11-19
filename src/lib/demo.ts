import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Test sign-in (pick a staff member, no Google). On the internet it only works with a test code
// (DEMO_PASSCODE, 12+ characters) that the owner sets in the hosting settings and shares with testers.
const onInternet = () => !!process.env.VERCEL || process.env.NODE_ENV === "production";
const code = () => process.env.DEMO_PASSCODE ?? "";
export const demoOn = () => process.env.DEMO_LOGIN === "1" && (!onInternet() || code().length >= 12);
export const demoMisconfigured = () => process.env.DEMO_LOGIN === "1" && onInternet() && code().length < 12;
export const demoNeedsCode = () => demoOn() && code().length > 0;

const COOKIE = "eplanet_demo_ok";
const mark = () => createHmac("sha256", `${process.env.SESSION_SECRET ?? ""}:demo`).update(code()).digest("hex");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** True once this browser has entered the right test code (or when no code is needed locally). */
export async function demoUnlocked() {
  if (!demoOn()) return false;
  if (!demoNeedsCode()) return true;
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  return same(v, mark());
}

export async function tryDemoCode(entered: string) {
  if (!demoNeedsCode() || !same(entered.trim(), code())) return false;
  (await cookies()).set(COOKIE, mark(), { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, path: "/", maxAge: 8 * 3600 });
  return true;
}
