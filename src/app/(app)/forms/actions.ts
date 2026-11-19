"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { newSlug, STANDARD_FIELDS, type FieldMode, type Question } from "@/lib/forms";
import type { ActionResult } from "@/components/action-form";

const s = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export async function saveForm(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "forms.manage")) return { error: "Your role can't create forms." };
  const id = Number(f.get("id")) || null;
  const existing = id ? await q1<{ branch_id: number }>("select branch_id from lead_forms where id=$1", [id]) : null;
  if (id && (!existing || !canSeeBranch(u, existing.branch_id))) return { error: "Form not found." };
  const branchId = Number(f.get("branch_id"));
  if (!canSeeBranch(u, branchId) || !(await q1("select 1 from branches where id=$1 and active", [branchId]))) return { error: "Choose one of your branches." };

  const title = s(f, "title", 150);
  if (!title) return { error: "Give the form a title, e.g. the event's name.", fieldErrors: { title: "Required" } };
  const rawDate = s(f, "event_date", 10), rawClose = s(f, "closes_on", 10);
  const eventDate = rawDate ? day(rawDate) : null, closesOn = rawClose ? day(rawClose) : null;
  if ((rawDate && !eventDate) || (rawClose && !closesOn)) return { error: "Check the dates." };

  const fields: Record<string, FieldMode> = {};
  for (const fld of STANDARD_FIELDS) {
    const m = String(f.get(`f_${fld.key}`) ?? "off");
    fields[fld.key] = m === "required" || m === "optional" ? m : "off";
  }
  const questions: Question[] = [];
  for (let i = 1; i <= 5; i++) {
    const label = s(f, `q${i}_label`, 150);
    if (!label) continue;
    const type = f.get(`q${i}_type`) === "choice" ? "choice" : "text";
    const options = type === "choice" ? s(f, `q${i}_options`, 1000).split(/[\n,]/).map((o) => o.trim().slice(0, 80)).filter(Boolean).slice(0, 12) : [];
    if (type === "choice" && options.length < 2) return { error: `Question ${i}: give at least two choices, separated by commas.` };
    questions.push({ label, type, options, required: f.get(`q${i}_required`) === "on" });
  }

  const ownerRaw = s(f, "owner_id", 40);
  let ownerId: string | null = null;
  if (ownerRaw) {
    const o = await q1<{ id: string }>(
      `select u.id from users u where u.id::text=$1 and u.active and (u.primary_branch_id=$2 or exists (select 1 from user_branches ub where ub.user_id=u.id and ub.branch_id=$2))`, [ownerRaw, branchId]);
    if (!o) return { error: "Choose a counsellor who works in this branch." };
    ownerId = o.id;
  }
  const vals = [branchId, title, s(f, "intro", 600) || null, eventDate, s(f, "event_time", 60) || null, s(f, "venue", 200) || null,
    JSON.stringify(fields), JSON.stringify(questions), ownerId, f.get("follow_up") === "on", s(f, "thank_you", 300) || null, closesOn];
  let formId = id;
  if (id) {
    await q(`update lead_forms set branch_id=$2,title=$3,intro=$4,event_date=$5,event_time=$6,venue=$7,fields=$8,questions=$9,owner_id=$10,follow_up=$11,thank_you=$12,closes_on=$13,updated_at=now() where id=$1`, [id, ...vals]);
    await audit(u, "update", "lead_form", String(id), undefined, { title });
  } else {
    for (let tries = 0; tries < 5 && !formId; tries++) {
      const r = await q1<{ id: number }>(
        `insert into lead_forms(branch_id,title,intro,event_date,event_time,venue,fields,questions,owner_id,follow_up,thank_you,closes_on,slug,created_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (slug) do nothing returning id`, [...vals, newSlug(), u.id]);
      formId = r?.id ?? null;
    }
    await audit(u, "create", "lead_form", String(formId), undefined, { title, branch: branchId });
  }
  revalidatePath("/forms");
  redirect(`/forms/${formId}`);
}

export async function setFormActive(f: FormData) {
  const u = await requireUser();
  if (!can(u, "forms.manage")) return;
  const id = Number(f.get("id"));
  const form = await q1<{ branch_id: number }>("select branch_id from lead_forms where id=$1", [id]);
  if (!form || !canSeeBranch(u, form.branch_id)) return;
  const active = f.get("active") === "1";
  await q("update lead_forms set active=$2, closes_on=case when $2 and closes_on < current_date then null else closes_on end, updated_at=now() where id=$1", [id, active]);
  await audit(u, "update", "lead_form", String(id), undefined, { active });
  revalidatePath(`/forms/${id}`);
}
