"use server";

import { z } from "zod";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { can, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { putFile } from "@/lib/storage";
import { ALLOWED_DOC_MIME as ALLOWED, MAX_DOC_BYTES as MAX, safeFilename, sniffDoc as sniff } from "@/lib/files";
import type { ActionResult } from "@/components/action-form";

export async function uploadDocument(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const contactId = String(f.get("contact_id"));
  const c = await loadContactForUser(u, contactId);
  if (!c || !can(u, "documents.manage")) return { error: "You can't upload documents for this student." };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX) return { error: "That file is larger than 10 MB. Please compress or split it." };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime || !ALLOWED[mime]) return { error: "Only PDF, JPG, PNG and Word files can be uploaded." };

  const applicationId = String(f.get("application_id") ?? "") || null;
  const visaId = String(f.get("visa_case_id") ?? "") || null;
  // The application or visa case must belong to this same student.
  if (applicationId && !(z.uuid().safeParse(applicationId).success && (await q1("select 1 from applications where id=$1 and contact_id=$2", [applicationId, contactId]))))
    return { error: "That application doesn't belong to this student." };
  if (visaId && (u.scope === "agent" || !(z.uuid().safeParse(visaId).success && (await q1("select 1 from visa_cases where id=$1 and contact_id=$2", [visaId, contactId])))))
    return { error: "That visa case doesn't belong to this student." };
  const key = `${c.branch_id}/${contactId}/${randomUUID()}.${ALLOWED[mime]}`;
  await putFile(key, buf, mime);
  const name = safeFilename(file.name);
  const docType = String(f.get("doc_type") ?? "other").replace(/[^a-z_]/g, "").slice(0, 40) || "other";
  const r = await q<{ id: string }>(
    `insert into documents(contact_id,application_id,visa_case_id,doc_type,filename,storage_key,size_bytes,mime,expiry,uploaded_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [contactId, applicationId, visaId, docType, name, key, buf.length, mime, String(f.get("expiry") ?? "") || null, u.id]);
  await q("insert into activities(contact_id,application_id,kind,body,user_id) values($1,$2,'document',$3,$4)", [contactId, applicationId, `Uploaded ${docType.replace(/_/g, " ")}: ${name}`, u.id]);

  // Tick the matching checklist item on the application, if any.
  if (applicationId) {
    await q(
      `update application_checklist ac set status='received', document_id=$3, updated_by=$4, updated_at=now()
         from checklist_items ci where ci.id=ac.item_id and ac.application_id=$1 and ci.doc_type=$2 and ac.status='pending'`,
      [applicationId, docType, r[0].id, u.id]);
    revalidatePath(`/applications/${applicationId}`);
  }
  revalidatePath(`/contacts/${contactId}`);
  if (visaId) revalidatePath(`/visa/${visaId}`);
  return { ok: `Uploaded ${name}.` };
}

export async function verifyDocument(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const d = (await q<{ contact_id: string; application_id: string | null }>("select contact_id, application_id from documents where id=$1", [id]))[0];
  if (!d || !can(u, "documents.manage") || u.scope === "agent" || !(await loadContactForUser(u, d.contact_id))) return; // only Eplanet staff mark documents checked
  await q("update documents set verified_by=$2, verified_at=now() where id=$1", [id, u.id]);
  await q("update application_checklist set status='verified', updated_by=$2, updated_at=now() where document_id=$1", [id, u.id]);
  revalidatePath(`/contacts/${d.contact_id}`);
  if (d.application_id) revalidatePath(`/applications/${d.application_id}`);
}
