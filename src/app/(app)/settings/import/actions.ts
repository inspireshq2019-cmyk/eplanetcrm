"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { q, q1, tx } from "@/lib/db";
import { IMPORT_FIELDS, toDate, toDestinations, toLevel, toStage } from "@/lib/import-fields";
import { normalisePhone } from "@/lib/phone";
import type { ActionResult } from "@/components/action-form";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 25000;

export async function uploadImport(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "import.run")) return { error: "Your role can't import data." };
  const file = f.get("file");
  const branchId = Number(f.get("branch_id"));
  if (!canSeeBranch(u, branchId)) return { error: "Choose one of your branches." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the CSV file exported from Agentcis." };
  if (file.size > MAX_BYTES) return { error: "That file is over 8 MB. Export it in smaller parts, e.g. one branch or one year at a time." };
  if (!/\.(csv|txt)$/i.test(file.name)) return { error: "Upload a .csv file. In Excel, use File › Save As › CSV UTF-8." };
  const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
  if (text.includes("\u0000")) return { error: "This doesn't look like a CSV text file. In Excel, use File › Save As › CSV UTF-8." };
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "The file has no data rows under the header row." };
  const [headers, ...data] = rows;
  if (data.length > MAX_ROWS) return { error: `The file has ${data.length} rows; the limit is ${MAX_ROWS} per import. Split it and import each part.` };
  const width = headers.length;
  const clean = data.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim().slice(0, 1000)));
  const b = await q1<{ id: string }>("insert into import_batches(created_by,branch_id,filename,headers,rows,row_count) values($1,$2,$3,$4,$5,$6) returning id",
    [u.id, branchId, file.name.slice(0, 200), headers.map((h) => h.trim().slice(0, 100)), JSON.stringify(clean), clean.length]);
  await audit(u, "create", "import_batch", b!.id, undefined, { filename: file.name, rows: clean.length });
  redirect(`/settings/import/${b!.id}`);
}

export async function cancelImport(f: FormData) {
  const u = await requireUser();
  if (!can(u, "import.run")) return;
  await q("update import_batches set status='cancelled', rows=null, finished_at=now() where id::text=$1 and status='pending' and (created_by=$2 or $3)", [String(f.get("id")), u.id, u.scope === "all"]);
  redirect("/settings/import");
}

export async function runImport(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "import.run")) return { error: "Your role can't import data." };
  const id = String(f.get("id"));
  const batch = await q1<{ id: string; branch_id: number; headers: string[]; rows: string[][] | null; status: string; country_code: string }>(
    "select ib.id, ib.branch_id, ib.headers, ib.rows, ib.status, b.country_code from import_batches ib join branches b on b.id=ib.branch_id where ib.id::text=$1", [id]);
  if (!batch || !canSeeBranch(u, batch.branch_id)) return { error: "Import not found." };
  if (batch.status !== "pending" || !batch.rows) return { error: "This import has already run." };

  const map: Record<string, number> = {};
  for (const fld of IMPORT_FIELDS) {
    const v = String(f.get(`map_${fld.key}`) ?? "");
    if (v !== "") map[fld.key] = Number(v);
  }
  if (map.first_name === undefined && map.full_name === undefined) return { error: "Match a column to First name or Full name — every student needs a name." };
  if (map.phone === undefined && map.email === undefined) return { error: "Match a column to Mobile or Email, so duplicates can be found and students contacted." };
  const consentNote = String(f.get("consent_note") ?? "").trim();
  if (!consentNote) return { error: "Say how these students originally agreed to Eplanet keeping their details (for example: enquiry form on the Agentcis website)." };

  const staff = await q<{ id: string; name: string; email: string }>("select id, lower(name) name, lower(email) email from users where active");
  const findOwner = (v: string) => { const s = v.trim().toLowerCase(); return s ? staff.find((x) => x.email === s || x.name === s)?.id ?? staff.find((x) => x.name.includes(s) || s.includes(x.name))?.id ?? null : null; };
  const cell = (r: string[], k: string) => (map[k] === undefined ? "" : (r[map[k]] ?? "").trim());
  const results = { imported: 0, duplicates: 0, skipped: 0, notes: 0, unmatchedOwners: new Set<string>() };

  await tx(async (db) => {
    const seenPhones = new Set<string>(), seenEmails = new Set<string>();
    for (const r of batch.rows!) {
      let first = cell(r, "first_name"), last = cell(r, "last_name");
      if (!first && cell(r, "full_name")) { const parts = cell(r, "full_name").split(/\s+/); first = parts.shift() ?? ""; last = last || parts.join(" "); }
      const email = cell(r, "email").toLowerCase() || null;
      const phone = normalisePhone(cell(r, "phone"), batch.country_code);
      if (!first || (!phone && !email)) { results.skipped++; continue; }
      if ((phone && seenPhones.has(phone)) || (email && seenEmails.has(email))) { results.duplicates++; continue; }
      const dup = await db.query("select 1 from contacts where ($1::text is not null and phone=$1) or ($2::text is not null and lower(email)=$2) limit 1", [phone, email]);
      if (dup.rowCount) { results.duplicates++; continue; }
      if (phone) seenPhones.add(phone); if (email) seenEmails.add(email);
      const ownerRaw = cell(r, "owner");
      const owner = findOwner(ownerRaw);
      if (ownerRaw && !owner) results.unmatchedOwners.add(ownerRaw.slice(0, 60));
      const ext = cell(r, "external_id");
      const tags = ["imported", ...cell(r, "tags").split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10)];
      const c = await db.query<{ id: string }>(
        `insert into contacts(first_name,last_name,email,phone,whatsapp,dob,gender,city,address,stage,source,source_detail,interested_destinations,interested_level,interested_field,intake,
                              branch_id,owner_id,tags,consent_source,created_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning id`,
        [first.slice(0, 100), last.slice(0, 100) || null, email, phone, normalisePhone(cell(r, "whatsapp"), batch.country_code), cell(r, "dob") ? toDate(cell(r, "dob")) : null,
         cell(r, "gender").slice(0, 20) || null, cell(r, "city").slice(0, 100) || null, cell(r, "address").slice(0, 300) || null, toStage(cell(r, "stage")),
         "agentcis", [cell(r, "source"), ext ? `Agentcis ${ext}` : ""].filter(Boolean).join(" · ").slice(0, 200) || null,
         toDestinations(cell(r, "destination")), toLevel(cell(r, "level")), cell(r, "field").slice(0, 150) || null, cell(r, "intake").slice(0, 50) || null,
         batch.branch_id, owner, tags, `Imported: ${consentNote}`.slice(0, 300), u.id]);
      const note = cell(r, "notes");
      if (note) { await db.query("insert into activities(contact_id,kind,body,user_id) values($1,'note',$2,$3)", [c.rows[0].id, note.slice(0, 4000), u.id]); results.notes++; }
      await db.query("insert into activities(contact_id,kind,body,user_id) values($1,'system',$2,$3)", [c.rows[0].id, `Imported from ${ext ? `Agentcis record ${ext}` : "Agentcis CSV"} by ${u.name}`, u.id]);
      results.imported++;
    }
    const result = { imported: results.imported, duplicates: results.duplicates, skipped: results.skipped, notes: results.notes, unmatched_owners: [...results.unmatchedOwners].slice(0, 30) };
    await db.query("update import_batches set status='done', rows=null, mapping=$2, result=$3, finished_at=now() where id=$1", [batch.id, JSON.stringify(map), JSON.stringify(result)]);
  });
  await audit(u, "create", "import", batch.id, undefined, { imported: results.imported, duplicates: results.duplicates, skipped: results.skipped });
  revalidatePath(`/settings/import/${batch.id}`);
  return { ok: `Imported ${results.imported} students.` };
}
