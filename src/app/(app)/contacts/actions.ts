"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { removeFile } from "@/lib/storage";
import { z } from "zod";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q, q1, tx } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";
import { auditDiff } from "@/lib/audit-diff";
import { TEST_LABEL } from "@/lib/format";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const arr = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

const ContactSchema = z.object({
  first_name: z.string().min(1, "Enter a first name.").max(80),
  last_name: z.string().max(80).nullable(),
  email: z.email("Check the email address.").nullable(),
  phone: z.string().max(30).nullable(),
  branch_id: z.coerce.number().int().positive("Choose a branch."),
});

function contactFields(f: FormData, country: string) {
  const phone = normalisePhone(str(f, "phone"), country);
  const wa = str(f, "whatsapp_same") ? phone : normalisePhone(str(f, "whatsapp"), country);
  return {
    first_name: str(f, "first_name"), last_name: str(f, "last_name"), email: str(f, "email")?.toLowerCase() ?? null, phone, whatsapp: wa,
    dob: str(f, "dob"), gender: str(f, "gender"), nationality: str(f, "nationality"), city: str(f, "city"), address: str(f, "address"),
    source: str(f, "source"), source_detail: str(f, "source_detail"), interested_destinations: arr(f, "interested_destinations"),
    interested_level: str(f, "interested_level"), interested_field: str(f, "interested_field"), intake: str(f, "intake"),
    budget_amount: str(f, "budget_amount") ? Number(str(f, "budget_amount")) : null, budget_currency: str(f, "budget_currency"),
    onshore: f.get("onshore") === "on", guardian_name: str(f, "guardian_name"), guardian_phone: normalisePhone(str(f, "guardian_phone"), country),
    tags: (str(f, "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
  };
}

/** Finds existing records with the same phone, email or passport number in any branch. */
async function findDuplicates(phone: string | null, email: string | null, passport: string | null, exceptId?: string) {
  if (!phone && !email && !passport) return [];
  return q<{ id: string; ref: string; name: string; branch: string; branch_id: number }>(
    `select c.id, c.ref, c.first_name || ' ' || coalesce(c.last_name,'') name, b.name branch, c.branch_id
       from contacts c join branches b on b.id=c.branch_id
      where ($4::uuid is null or c.id <> $4) and c.stage <> 'archived'
        and (($1::text is not null and (c.phone=$1 or c.whatsapp=$1)) or ($2::text is not null and lower(c.email)=$2) or ($3::text is not null and upper(c.passport_no)=upper($3)))
      limit 5`, [phone, email, passport, exceptId ?? null]);
}

export async function createContact(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "contacts.create")) return { error: "Your role can't add students." };
  const branchId = Number(f.get("branch_id"));
  if (!canSeeBranch(u, branchId)) return { error: "You can't add students to that branch." };
  const branch = await q1<{ country_code: string }>("select country_code from branches where id=$1", [branchId]);
  if (!branch) return { error: "Choose a branch." };
  const d = contactFields(f, branch.country_code);
  const parsed = ContactSchema.safeParse({ ...d, branch_id: branchId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!d.phone && !d.email) return { error: "Enter a phone number or an email address so the team can contact the student." };
  if (f.get("consent") !== "on") return { error: "Confirm the student agreed to Eplanet storing their details." };

  if (f.get("confirm_duplicate") !== "1") {
    const dup = await findDuplicates(d.phone, d.email, null);
    if (dup.length) {
      const list = dup.map((x) => `${x.name} (${x.ref}, ${x.branch})`).join("; ");
      return { error: `This phone or email already belongs to: ${list}. Open that record instead, or tick "Add anyway" to create a separate record.` };
    }
  }

  let owner = str(f, "owner_id");
  if (u.scope === "own") owner = u.id; // counsellors own what they add
  const id = await tx(async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into contacts(first_name,last_name,email,phone,whatsapp,dob,gender,nationality,city,address,source,source_detail,interested_destinations,
         interested_level,interested_field,intake,budget_amount,budget_currency,onshore,guardian_name,guardian_phone,tags,branch_id,owner_id,
         consent_at,consent_source,created_by,stage)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now(),$25,$26,$27) returning id`,
      [d.first_name, d.last_name, d.email, d.phone, d.whatsapp, d.dob, d.gender, d.nationality, d.city, d.address, d.source, d.source_detail,
       d.interested_destinations, d.interested_level, d.interested_field, d.intake, d.budget_amount, d.budget_currency, d.onshore, d.guardian_name,
       d.guardian_phone, d.tags, branchId, owner, `Recorded by ${u.name}`, u.id, str(f, "stage") ?? "lead"]);
    const cid = r.rows[0].id;
    await c.query("insert into activities(contact_id,kind,body,user_id) values($1,'system',$2,$3)", [cid, `Added by ${u.name}`, u.id]);
    const note = str(f, "first_note");
    if (note) await c.query("insert into activities(contact_id,kind,body,user_id) values($1,'note',$2,$3)", [cid, note, u.id]);
    return cid;
  });
  await audit(u, "create", "contact", id, undefined, { name: `${d.first_name} ${d.last_name ?? ""}`, branch_id: branchId });
  redirect(`/contacts/${id}`);
}

export async function updateContact(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.edit")) return { error: "You can't edit this student." };
  const branchId = Number(f.get("branch_id") ?? c.branch_id);
  if (!canSeeBranch(u, branchId)) return { error: "You can't move students to that branch." };
  const branch = await q1<{ country_code: string }>("select country_code from branches where id=$1", [branchId]);
  const d = contactFields(f, branch!.country_code);
  const parsed = ContactSchema.safeParse({ ...d, branch_id: branchId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const before = await q1<Record<string, unknown>>("select * from contacts where id=$1", [id]);
  const sens = can(u, "contacts.sensitive");
  await q(
    `update contacts set first_name=$2,last_name=$3,email=$4,phone=$5,whatsapp=$6,dob=$7,gender=$8,nationality=$9,city=$10,address=$11,source=$12,
       source_detail=$13,interested_destinations=$14,interested_level=$15,interested_field=$16,intake=$17,budget_amount=$18,budget_currency=$19,
       onshore=$20,guardian_name=$21,guardian_phone=$22,tags=$23,branch_id=$24,
       passport_no = case when $25 then $26 else passport_no end, passport_expiry = case when $25 then $27::date else passport_expiry end,
       updated_at=now() where id=$1`,
    [id, d.first_name, d.last_name, d.email, d.phone, d.whatsapp, d.dob, d.gender, d.nationality, d.city, d.address, d.source, d.source_detail,
     d.interested_destinations, d.interested_level, d.interested_field, d.intake, d.budget_amount, d.budget_currency, d.onshore, d.guardian_name,
     d.guardian_phone, d.tags, branchId, sens, str(f, "passport_no")?.toUpperCase() ?? null, str(f, "passport_expiry")]);
  await audit(u, "update", "contact", id, undefined, auditDiff(before, { ...d, branch_id: branchId, ...(sens ? { passport_no: str(f, "passport_no")?.toUpperCase() ?? null, passport_expiry: str(f, "passport_expiry") } : {}) }));
  redirect(`/contacts/${id}`);
}

export async function setStage(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const stage = String(f.get("stage"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.edit") || !["lead", "prospect", "client", "archived"].includes(stage)) return { error: "You can't change this student's status." };
  const reason = String(f.get("lost_reason") ?? "").trim().slice(0, 300) || null;
  if (stage === "archived" && !reason) return { error: "Add a short reason for archiving, e.g. chose another agent or not ready this year." };
  await q("update contacts set stage=$2, lost_reason=case when $2='archived' then $3 else lost_reason end, updated_at=now() where id=$1", [id, stage, reason]);
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'system',$2,$3)", [id, `Status changed to ${stage}${reason ? ` (${reason})` : ""}`, u.id]);
  await audit(u, "update", "contact", id, undefined, { stage });
  revalidatePath(`/contacts/${id}`);
  return { ok: "Status updated." };
}

export async function assignOwner(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.edit")) return;
  if (u.scope === "own") return; // counsellors can't hand students to someone else
  const owner = String(f.get("owner_id") ?? "") || null;
  const staff = owner && z.uuid().safeParse(owner).success ? await q1<{ name: string; primary_branch_id: number }>("select name, primary_branch_id from users where id=$1 and active", [owner]) : null;
  if (owner && !staff) return;
  const name = staff?.name ?? null;
  await q("update contacts set owner_id=$2, updated_at=now() where id=$1", [id, owner]);
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'system',$2,$3)", [id, owner ? `Assigned to ${name}` : "Unassigned", u.id]);
  await audit(u, "update", "contact", id, { owner_id: c.owner_id }, { owner_id: owner });
  revalidatePath(`/contacts/${id}`);
}

export async function addNote(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c) return { error: "You can't add notes to this student." };
  const body = String(f.get("body") ?? "").trim();
  const kind = String(f.get("kind") ?? "note");
  if (!body) return { error: "Write the note first." };
  if (!["note", "call", "email", "whatsapp", "meeting"].includes(kind)) return { error: "Choose a note type." };
  await q("insert into activities(contact_id,kind,body,user_id) values($1,$2,$3,$4)", [id, kind, body.slice(0, 5000), u.id]);
  await q("update contacts set updated_at=now() where id=$1", [id]);
  revalidatePath(`/contacts/${id}`);
  return { ok: "Saved to the timeline." };
}

export async function addTest(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.edit")) return { error: "You can't edit this student." };
  const n = (k: string) => { const v = str(f, k); return v === null ? null : Number(v); };
  const test = str(f, "test");
  if (!test || n("overall") === null) return { error: "Choose the test and enter the overall score." };
  await q("insert into contact_tests(contact_id,test,overall,listening,reading,writing,speaking,test_date,expiry) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, test, n("overall"), n("listening"), n("reading"), n("writing"), n("speaking"), str(f, "test_date"), str(f, "expiry")]);
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'system',$2,$3)", [id, `Added ${TEST_LABEL[test] ?? test} score ${n("overall")}`, u.id]);
  revalidatePath(`/contacts/${id}`);
  return { ok: "Test score added." };
}

export async function addEducation(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.edit")) return { error: "You can't edit this student." };
  const level = str(f, "level");
  if (!level) return { error: "Choose the qualification." };
  await q("insert into contact_education(contact_id,level,institution,country_code,result,year) values($1,$2,$3,$4,$5,$6)",
    [id, level, str(f, "institution"), str(f, "country_code"), str(f, "result"), str(f, "year") ? Number(str(f, "year")) : null]);
  revalidatePath(`/contacts/${id}`);
  return { ok: "Qualification added." };
}

export async function deleteRow(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const table = String(f.get("table"));
  const rowId = Number(f.get("row_id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.edit") || !["contact_tests", "contact_education"].includes(table)) return;
  await q(`delete from ${table} where id=$1 and contact_id=$2`, [rowId, id]);
  revalidatePath(`/contacts/${id}`);
}

export async function revealSensitive(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.sensitive")) return;
  await audit(u, "view_sensitive", "contact", id, undefined, { field: "passport_no" });
  redirect(`/contacts/${id}?reveal=1`);
}

export async function deleteContact(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const c = await loadContactForUser(u, id);
  if (!c || !can(u, "contacts.delete")) return;
  // The audit entry keeps only who was deleted, never their personal details, so deletion really removes them.
  const before = await q1<{ ref: string; branch_id: number; stage: string }>("select ref, branch_id, stage from contacts where id=$1", [id]);
  const files = await q<{ storage_key: string }>("select storage_key from documents where contact_id=$1", [id]);
  await q("delete from contacts where id=$1", [id]);
  for (const f of files) await removeFile(f.storage_key).catch((e) => console.error("Could not remove file", f.storage_key, e));
  await audit(u, "delete", "contact", id, before, { files_removed: files.length });
  redirect("/contacts?deleted=1");
}
