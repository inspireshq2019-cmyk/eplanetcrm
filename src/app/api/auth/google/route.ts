import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { safeNext } from "@/lib/safe-next";

// Step 1 of Google sign-in: send the person to Google with a one-time state value.
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  if (!clientId) return NextResponse.redirect(new URL("/login?error=google_not_configured", appUrl));
  const state = randomBytes(24).toString("hex");
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  if (domains.length === 1) params.set("hd", domains[0]); // shows only accounts on the company domain
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("eplanet_oauth_next", safeNext(new URL(request.url).searchParams.get("next")), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  res.cookies.set("eplanet_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
