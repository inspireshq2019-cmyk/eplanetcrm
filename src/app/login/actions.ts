"use server";

import { safeNext } from "@/lib/safe-next";
import { redirect } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { demoOn, demoUnlocked, tryDemoCode } from "@/lib/demo";

/** Test sign-in without Google. Only works when DEMO_LOGIN=1 (and, on the internet, after the test code). */
export async function demoSignIn(formData: FormData) {
  if (!demoOn()) redirect("/login?error=demo_off");
  if (!(await demoUnlocked())) redirect("/login?error=demo_code");
  const id = String(formData.get("user_id") ?? "");
  const u = await q1<{ id: string }>("select id from users where id=$1 and active", [id]);
  if (!u) redirect("/login?error=no_account");
  await createSession(u.id);
  await q("update users set last_login_at=now() where id=$1", [u.id]);
  await q("insert into audit_log(user_id,action,entity,entity_id,after) values($1::uuid,'login','user',$1::text,$2)", [u.id, JSON.stringify({ method: "demo" })]);
  redirect(safeNext(String(formData.get("next") ?? "/")));
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

/** Checks the test code before the staff list is shown. Wrong codes are slowed down. */
export async function enterDemoCode(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const ok = await tryDemoCode(String(formData.get("code") ?? "").slice(0, 200));
  if (!ok) { await new Promise((r) => setTimeout(r, 1500)); redirect(`/login?error=demo_code${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`); }
  redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
}
