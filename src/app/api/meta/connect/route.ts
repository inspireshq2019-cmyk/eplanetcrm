import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { can, canSeeBranch, getCurrentUser } from "@/lib/auth";
import { dialogUrl, metaConfigured } from "@/lib/meta";

// Step 1 of connecting a branch's Facebook pages: send the person to Facebook to sign in and allow access.
export async function GET(request: Request) {
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  const u = await getCurrentUser();
  if (!u) return NextResponse.redirect(new URL("/login", appUrl));
  const branch = Number(new URL(request.url).searchParams.get("branch"));
  if (!can(u, "leads.connect") || !Number.isInteger(branch) || !canSeeBranch(u, branch)) return NextResponse.redirect(new URL("/?denied=leads.connect", appUrl));
  if (!metaConfigured()) return NextResponse.redirect(new URL(`/settings/leads?branch=${branch}&error=meta_not_configured`, appUrl));
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(dialogUrl(`${appUrl}/api/meta/callback`, state));
  res.cookies.set("eplanet_meta_state", `${state}.${branch}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 900 });
  return res;
}
