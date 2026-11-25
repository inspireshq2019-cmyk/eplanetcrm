"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getMailbox, sendMail } from "@/lib/mailbox";

const PENDING = "eplanet_agent_email";
const hash = (userId: string, code: string) => createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${userId}:${code}`).digest("hex");
const secureCookie = () => !!process.env.VERCEL;

/** Step 1: email a 6-digit code. The reply is the same whether or not the address has a login. */
export async function requestCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 150);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/login/agent?error=email");
  if (!(await getMailbox())) redirect("/login/agent?error=unavailable");
  const u = await q1<{ id: string; name: string }>(
    `select u.id, u.name from users u join sub_agents s on s.id=u.sub_agent_id
      where lower(u.email)=$1 and u.active and s.active and u.role_key='sub_agent'`, [email]);
  if (u) {
    const recent = await q1<{ n: number }>("select count(*)::int n from login_codes where user_id=$1 and created_at > now() - interval '1 hour'", [u.id]);
    if ((recent?.n ?? 0) < 5) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await q("update login_codes set used_at=now() where user_id=$1 and used_at is null", [u.id]);
      await q("insert into login_codes(user_id,code_hash,expires_at) values($1,$2,now() + interval '10 minutes')", [u.id, hash(u.id, code)]);
      try {
        await sendMail({ to: [email], subject: `Your Eplanet CRM sign-in code: ${code}`,
          text: `Hello ${u.name},\n\nYour code to sign in to the Eplanet CRM is:\n\n    ${code}\n\nIt works once and expires in 10 minutes. If you didn't ask for it, you can ignore this email.\n\nEplanet International` });
      } catch (e) {
        console.error("Sign-in code email failed", e instanceof Error ? e.message : e);
        redirect("/login/agent?error=send");
      }
    }
  }
  (await cookies()).set(PENDING, email, { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/login", maxAge: 15 * 60 });
  redirect("/login/agent?step=code");
}

/** Step 2: check the code. Five wrong tries and the code stops working. */
export async function verifyCode(formData: FormData) {
  const email = (await cookies()).get(PENDING)?.value ?? "";
  const code = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
  if (!email) redirect("/login/agent?error=expired");
  const u = await q1<{ id: string }>(
    `select u.id from users u join sub_agents s on s.id=u.sub_agent_id where lower(u.email)=$1 and u.active and s.active and u.role_key='sub_agent'`, [email]);
  const row = u ? await q1<{ id: string; code_hash: string; attempts: number }>(
    "select id, code_hash, attempts from login_codes where user_id=$1 and used_at is null and expires_at > now() order by created_at desc limit 1", [u.id]) : null;
  if (!u || !row || row.attempts >= 5 || code.length !== 6) {
    await new Promise((r) => setTimeout(r, 800));
    redirect(`/login/agent?step=code&error=${!row || (row && row.attempts >= 5) ? "expired" : "code"}`);
  }
  const ok = timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash(u.id, code)));
  if (!ok) {
    await q("update login_codes set attempts=attempts+1 where id=$1", [row.id]);
    await new Promise((r) => setTimeout(r, 800));
    redirect("/login/agent?step=code&error=code");
  }
  await q("update login_codes set used_at=now() where id=$1", [row.id]);
  await createSession(u.id);
  await q("update users set last_login_at=now() where id=$1", [u.id]);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await q("insert into audit_log(user_id,action,entity,entity_id,after,ip) values($1::uuid,'login','user',$1::text,$2,$3)", [u.id, JSON.stringify({ method: "email_code" }), ip]);
  (await cookies()).delete({ name: PENDING, path: "/login" });
  redirect("/");
}
