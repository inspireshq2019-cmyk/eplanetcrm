import { safeNext } from "@/lib/safe-next";
import { NextResponse, type NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { q, q1 } from "@/lib/db";
import { createSession } from "@/lib/auth";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Step 2 of Google sign-in: exchange the code, verify Google's signed ID token,
// then let the person in only if their email is on an allowed domain AND belongs to an active staff account.
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, appUrl));
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("eplanet_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return fail("state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("google");
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return fail("google");

  let email = "";
  try {
    const { payload } = await jwtVerify(id_token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    if (payload.email_verified !== true) return fail("unverified");
    email = String(payload.email ?? "").toLowerCase();
  } catch {
    return fail("google");
  }

  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length && !domains.includes(email.split("@")[1] ?? "")) return fail("domain");

  const user = await q1<{ id: string; active: boolean }>("select id, active from users where lower(email)=$1", [email]);
  if (!user || !user.active) return fail("no_account");

  await createSession(user.id);
  await q("update users set last_login_at=now() where id=$1", [user.id]);
  await q("insert into audit_log(user_id,action,entity,entity_id,ip) values($1::uuid,'login','user',$1::text,$2)",
    [user.id, request.headers.get("x-forwarded-for")?.split(",")[0] ?? null]);
  const res = NextResponse.redirect(new URL(safeNext(request.cookies.get("eplanet_oauth_next")?.value), appUrl));
  res.cookies.delete("eplanet_oauth_state");
  res.cookies.delete("eplanet_oauth_next");
  return res;
}
