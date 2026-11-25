import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { can, getCurrentUser } from "@/lib/auth";
import { GOOGLE_AUTH_URL, MAILBOX_SCOPES } from "@/lib/mailbox";

// Step 1 of connecting the admissions mailbox: an owner signs in to Google as the mailbox and allows "send email".
export async function GET(request: Request) {
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  const u = await getCurrentUser();
  if (!u) return NextResponse.redirect(new URL("/login", appUrl));
  if (!can(u, "settings.system")) return NextResponse.redirect(new URL("/?denied=settings.system", appUrl));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL("/settings/mailbox?error=google_not_configured", appUrl));
  const state = randomBytes(24).toString("hex");
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${appUrl}/api/mailbox/callback`, response_type: "code",
    scope: MAILBOX_SCOPES, access_type: "offline", prompt: "consent select_account", state, include_granted_scopes: "false",
  });
  if (process.env.ADMISSIONS_MAILBOX) p.set("login_hint", process.env.ADMISSIONS_MAILBOX);
  const res = NextResponse.redirect(`${GOOGLE_AUTH_URL()}?${p}`);
  res.cookies.set("eplanet_mailbox_state", state, { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, path: "/", maxAge: 600 });
  return res;
}
