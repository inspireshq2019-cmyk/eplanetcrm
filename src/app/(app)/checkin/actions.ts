"use server";

import { revalidatePath } from "next/cache";
import { can, canSeeBranch, requireUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";
import type { ActionResult } from "@/components/action-form";

export async function checkIn(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "checkin.manage")) return { error: "Your role can't check visitors in." };
  const branchId = Number(f.get("branch_id"));
  if (!canSeeBranch(u, branchId)) return { error: "Choose your branch." };
  const name = String(f.get("visitor_name") ?? "").trim();
  if (!name) return { error: "Enter the visitor's name." };
  const country = (await q1<{ country_code: string }>("select country_code from branches where id=$1", [branchId]))?.country_code ?? "BD";
  const phone = normalisePhone(String(f.get("phone") ?? ""), country);
  // Link to an existing record in this branch with the same phone, if there is one.
  const existing = phone ? await q1<{ id: string; owner_id: string | null }>("select id, owner_id from contacts where branch_id=$1 and (phone=$2 or whatsapp=$2) order by updated_at desc limit 1", [branchId, phone]) : null;
  const host = String(f.get("host_id") ?? "") || existing?.owner_id || null;
  await q("insert into checkins(branch_id,contact_id,visitor_name,phone,purpose,host_id) values($1,$2,$3,$4,$5,$6)",
    [branchId, existing?.id ?? null, name.slice(0, 120), phone, String(f.get("purpose") ?? "") || null, host]);
  if (existing) await q("insert into activities(contact_id,kind,body,user_id) values($1,'checkin',$2,$3)", [existing.id, `Visited the office${f.get("purpose") ? `: ${f.get("purpose")}` : ""}`, u.id]);
  revalidatePath("/checkin");
  return { ok: existing ? `${name} is checked in and linked to their existing record.` : `${name} is checked in.` };
}

export async function moveCheckin(f: FormData) {
  const u = await requireUser();
  const id = Number(f.get("id"));
  const to = String(f.get("to"));
  const c = await q1<{ branch_id: number }>("select branch_id from checkins where id=$1", [id]);
  if (!c || !can(u, "checkin.manage") || !canSeeBranch(u, c.branch_id)) return;
  if (to === "attending") await q("update checkins set status='attending', started_at=now(), host_id=coalesce(host_id,$2) where id=$1", [id, u.id]);
  else if (to === "completed") await q("update checkins set status='completed', completed_at=now() where id=$1", [id]);
  else if (to === "waiting") await q("update checkins set status='waiting', started_at=null where id=$1", [id]);
  revalidatePath("/checkin");
}
