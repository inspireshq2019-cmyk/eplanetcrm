"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { can, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q } from "@/lib/db";
import { putFile } from "@/lib/storage";
import type { ActionResult } from "@/components/action-form";

const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const MAX = 10 * 1024 * 1024;

// Checks the file's first bytes, so a renamed file can't pass as a PDF or image.
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return "application/msword";
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

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
  const key = `${c.branch_id}/${contactId}/${randomUUID()}.${ALLOWED[mime]}`;
  await putFile(key, buf, mime);
  const name = file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 150);
  const docType = String(f.get("doc_type") ?? "other");
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
  if (!d || !can(u, "documents.manage") || !(await loadContactForUser(u, d.contact_id))) return;
  await q("update documents set verified_by=$2, verified_at=now() where id=$1", [id, u.id]);
  await q("update application_checklist set status='verified', updated_by=$2, updated_at=now() where document_id=$1", [id, u.id]);
  revalidatePath(`/contacts/${d.contact_id}`);
  if (d.application_id) revalidatePath(`/applications/${d.application_id}`);
}
