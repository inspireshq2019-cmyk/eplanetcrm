"use server";

import { revalidatePath } from "next/cache";
import { can, canSeeBranch, requireUser } from "@/lib/auth";
import { resolveContact } from "@/lib/contact-pick";
import { q, q1 } from "@/lib/db";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => (str(f, k) === null ? null : Number(str(f, k)));

export async function createPolicy(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "oshc.manage")) return { error: "Your role can't record OSHC." };
  const c = await resolveContact(u, str(f, "contact") ?? "");
  if (!c) return { error: "Choose the student from the list (type a name or C-number)." };
  const start = str(f, "start_date"), end = str(f, "end_date");
  const cover = ["single", "couple", "family", "single_parent"].includes(str(f, "cover_type") ?? "") ? str(f, "cover_type")! : "single";
  const status = ["quoted", "purchased", "active"].includes(str(f, "status") ?? "") ? str(f, "status")! : "quoted";
  if (start && end && end <= start) return { error: "The cover end date must be after the start date." };
  await q(
    `insert into oshc_policies(contact_id,branch_id,insurer_id,policy_no,cover_type,start_date,end_date,premium,currency,commission,status,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,'AUD',$9,$10,$11)`,
    [c.id, c.branch_id, num(f, "insurer_id"), str(f, "policy_no"), cover, start, end, num(f, "premium"), num(f, "commission"), status, u.id]);
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'oshc',$2,$3)", [c.id, `OSHC ${status}${str(f, "policy_no") ? ` (policy ${str(f, "policy_no")})` : ""}`, u.id]);
  revalidatePath("/oshc");
  return { ok: "OSHC recorded." };
}

export async function updatePolicy(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const p = await q1<{ branch_id: number; contact_id: string }>("select branch_id, contact_id from oshc_policies where id::text=$1", [id]);
  if (!p || !can(u, "oshc.manage") || !canSeeBranch(u, p.branch_id)) return;
  const status = str(f, "status");
  if (!status || !["quoted", "purchased", "active", "cancelled", "expired"].includes(status)) return;
  await q("update oshc_policies set status=$2, policy_no=coalesce($3, policy_no) where id::text=$1", [id, status, str(f, "policy_no")]);
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'oshc',$2,$3)", [p.contact_id, `OSHC status: ${status}`, u.id]);
  revalidatePath("/oshc");
}
