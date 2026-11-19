"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, requireUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string, max = 300) => { const v = String(f.get(k) ?? "").trim().slice(0, max); return v === "" ? null : v; };
const num = (f: FormData, k: string) => { const v = str(f, k); if (v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const KINDS = ["university", "college", "school", "english", "insurer", "aggregator", "other"];
const LEVELS = ["FOUNDATION", "DIPLOMA", "BACHELOR", "MASTER", "DOCTORATE", "ENGLISH", "OTHER"];
const url = (v: string | null) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v);

async function editor() {
  const u = await requireUser();
  return can(u, "partners.edit") ? u : null;
}

export async function savePartner(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await editor();
  if (!u) return { error: "Your role can't edit partners." };
  const id = num(f, "id");
  const name = str(f, "name", 200);
  if (!name) return { error: "Enter the institution's name." };
  const kind = str(f, "kind") ?? "university";
  if (!KINDS.includes(kind)) return { error: "Choose the type of institution." };
  const vals = [name, kind, str(f, "country_code"), str(f, "city", 100), url(str(f, "website", 300)), str(f, "email", 150), str(f, "phone", 40), str(f, "cricos", 20), f.get("is_partner") === "on", str(f, "notes", 2000)];
  try {
    if (id) {
      await q("update partners set name=$2,kind=$3,country_code=$4,city=$5,website=$6,email=$7,phone=$8,cricos=$9,is_partner=$10,notes=$11 where id=$1", [id, ...vals]);
      await audit(u, "update", "partner", String(id));
      revalidatePath(`/partners/${id}`);
      return { ok: "Saved." };
    }
    const r = await q1<{ id: number }>("insert into partners(name,kind,country_code,city,website,email,phone,cricos,is_partner,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id", vals);
    await audit(u, "create", "partner", String(r!.id));
    redirect(`/partners/${r!.id}`);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "An institution with this name already exists in that country." };
    throw e;
  }
}

export async function addAgreement(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await editor();
  if (!u) return { error: "Your role can't edit agreements." };
  const pid = num(f, "partner_id");
  const pct = num(f, "commission_pct");
  if (!pid) return { error: "Missing institution." };
  if (pct === null || pct < 0 || pct > 100) return { error: "Enter the commission rate as a percentage between 0 and 100." };
  const from = str(f, "valid_from"), to = str(f, "valid_to");
  if (from && to && to < from) return { error: "The end date must be after the start date." };
  await q("insert into partner_agreements(partner_id,via_partner_id,commission_pct,bonus,claim_basis,currency,valid_from,valid_to,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [pid, num(f, "via_partner_id"), pct, str(f, "bonus"), str(f, "claim_basis"), str(f, "currency", 3), from, to, str(f, "notes", 1000)]);
  await audit(u, "create", "partner_agreement", String(pid), undefined, { commission_pct: pct });
  revalidatePath(`/partners/${pid}`);
  return { ok: "Agreement saved. New commission invoices for this institution will use this rate." };
}

export async function endAgreement(f: FormData) {
  const u = await editor();
  if (!u) return;
  const id = Number(f.get("id"));
  const a = await q1<{ partner_id: number }>("update partner_agreements set valid_to=least(coalesce(valid_to, current_date), current_date - 1) where id=$1 returning partner_id", [id]);
  if (a) { await audit(u, "update", "partner_agreement", String(id), undefined, { ended: true }); revalidatePath(`/partners/${a.partner_id}`); }
}

export async function saveCourse(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await editor();
  if (!u) return { error: "Your role can't edit courses." };
  const pid = num(f, "partner_id");
  const id = num(f, "id");
  const title = str(f, "title", 250);
  const level = str(f, "level");
  if (!pid || !title) return { error: "Enter the course title." };
  if (!level || !LEVELS.includes(level)) return { error: "Choose the course level." };
  const intakes = (str(f, "intakes") ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const vals = [title, level, str(f, "field", 100), str(f, "campus", 100), num(f, "duration_years"), intakes, num(f, "tuition_per_year"), str(f, "currency", 3), str(f, "fee_year", 10), str(f, "ielts", 100), str(f, "cricos", 20), url(str(f, "url", 400))];
  try {
    if (id) await q("update courses set title=$3,level=$4,field=$5,campus=$6,duration_years=$7,intakes=$8,tuition_per_year=$9,currency=$10,fee_year=$11,ielts=$12,cricos=$13,url=$14,checked_on=current_date where id=$1 and partner_id=$2", [id, pid, ...vals]);
    else await q("insert into courses(partner_id,title,level,field,campus,duration_years,intakes,tuition_per_year,currency,fee_year,ielts,cricos,url,checked_on) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,current_date)", [pid, ...vals]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "This institution already has a course with that title." };
    throw e;
  }
  await audit(u, id ? "update" : "create", "course", String(id ?? pid), undefined, { title });
  revalidatePath(`/partners/${pid}`);
  return { ok: id ? "Course updated." : "Course added." };
}

export async function setCourseActive(f: FormData) {
  const u = await editor();
  if (!u) return;
  const r = await q1<{ partner_id: number }>("update courses set active=$2 where id=$1 returning partner_id", [Number(f.get("id")), f.get("active") === "1"]);
  if (r) revalidatePath(`/partners/${r.partner_id}`);
}
