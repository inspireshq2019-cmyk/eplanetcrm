"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { ALLOWED_DOC_MIME, safeFilename, sniffDoc } from "@/lib/files";
import { putFile, removeFile } from "@/lib/storage";
import { findOpenLink, MAX_UPLOADS_PER_LINK, STUDENT_DOC_LABEL, studentMayUpload } from "@/lib/upload-links";
import { allowedTypes } from "./items";

// The hosting limit for one request is about 4.5 MB, so each file is sent on its own and must fit.
const MAX_LINK_FILE = 4 * 1024 * 1024;
const ACTIVE_ADMISSIONS = ["submitted", "in_review", "needs_info", "lodged", "offer"];

export type LinkUploadResult = { ok?: string; error?: string };

/** A student uploading one file through their private link. Anyone with the link can call this, so everything is checked here. */
export async function uploadFromLink(f: FormData): Promise<LinkUploadResult> {
  const token = String(f.get("token") ?? "");
  const link = await findOpenLink(token);
  if (!link) return { error: "This link has expired or been cancelled. Please ask your Eplanet counsellor for a new one." };
  if (link.uploads >= MAX_UPLOADS_PER_LINK) return { error: "This link has reached its upload limit. Please ask your counsellor for a new link." };
  const docType = String(f.get("doc_type") ?? "");
  if (!studentMayUpload(docType) || !(await allowedTypes(link)).has(docType)) return { error: "Choose what this document is." };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_LINK_FILE) return { error: "That file is larger than 4 MB. Take a photo instead, or make the PDF smaller, and try again." };
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffDoc(buf);
  if (!mime) return { error: "Only photos (JPG or PNG), PDF and Word files can be uploaded." };

  const key = `${link.branch_id}/${link.contact_id}/${randomUUID()}.${ALLOWED_DOC_MIME[mime]}`;
  await putFile(key, buf, mime);
  const name = safeFilename(file.name);
  const label = STUDENT_DOC_LABEL[docType] ?? docType.replace(/_/g, " ");

  const res = await tx(async (db) => {
    // Count the upload against the link first, so the limit holds even if several arrive at once.
    const used = await db.query("update upload_links set uploads=uploads+1, last_used_at=now() where id=$1 and uploads < $2 and revoked_at is null and expires_at > now() returning id", [link.id, MAX_UPLOADS_PER_LINK]);
    if (!used.rowCount) throw new Error("limit");
    const doc = (await db.query<{ id: string }>(
      `insert into documents(contact_id,application_id,doc_type,filename,storage_key,size_bytes,mime,via_link_id)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [link.contact_id, link.application_id, docType, name, key, buf.length, mime, link.id])).rows[0];
    await db.query("insert into activities(contact_id,application_id,kind,body) values($1,$2,'document',$3)",
      [link.contact_id, link.application_id, `Student uploaded ${label}: ${name} (through their upload link). To check.`]);
    if (link.application_id) {
      await db.query(
        `update application_checklist ac set status='received', document_id=$3, updated_at=now()
           from checklist_items ci where ci.id=ac.item_id and ac.application_id=$1 and ci.doc_type=$2 and ac.status='pending'`,
        [link.application_id, docType, doc.id]);
      // If the admission team has the application, tell them too.
      const a = (await db.query<{ adm_status: string | null }>("select adm_status from applications where id=$1", [link.application_id])).rows[0];
      if (a?.adm_status && ACTIVE_ADMISSIONS.includes(a.adm_status)) {
        await db.query("insert into application_messages(application_id,author_id,body,internal,kind) values($1,null,$2,false,'status')",
          [link.application_id, `${link.first_name} uploaded ${label} (${name}) through their upload link. To check.`]);
        await db.query("update applications set adm_updated_at=now() where id=$1", [link.application_id]);
      }
    }
    // One open "check documents" task for the counsellor (or whoever sent the link), not one per file.
    const assignee = link.owner_id ?? link.created_by;
    const open = await db.query("select 1 from tasks where contact_id=$1 and status='open' and title like 'Check documents uploaded by %'", [link.contact_id]);
    if (!open.rowCount) {
      await db.query(
        `insert into tasks(title,description,due_at,priority,assignee_id,branch_id,contact_id,application_id)
         values($1,$2,now(),'normal',$3,$4,$5,$6)`,
        [`Check documents uploaded by ${link.first_name}`, "The student uploaded documents through their upload link. Open the student's Documents and mark each one checked.", assignee, link.branch_id, link.contact_id, link.application_id]);
    }
    return "saved" as const;
  }).catch((e) => { if (e instanceof Error && e.message === "limit") return "limit" as const; throw e; });
  if (res === "limit") {
    await removeFile(key).catch(() => {});
    return { error: "This link has reached its upload limit. Please ask your counsellor for a new link." };
  }

  revalidatePath(`/u/${token}`);
  return { ok: `${label}: ${name} uploaded.` };
}
