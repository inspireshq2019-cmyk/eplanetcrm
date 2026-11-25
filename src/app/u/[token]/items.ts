import "server-only";
import { q } from "@/lib/db";
import { STUDENT_DOC_LABEL, studentMayUpload, type OpenLink } from "@/lib/upload-links";

export type LinkItem = { docType: string; label: string; status: "needed" | "received" | "checked" };

/**
 * What the student is asked to upload, and where each item stands.
 * With an application: its checklist (leaving out what the institution provides and anything marked not needed).
 * Without: the documents ticked when the link was made. "Other document" is always offered last.
 * Only the status is shown, never file names, so the link reveals nothing that was uploaded by someone else.
 */
export async function linkItems(link: Pick<OpenLink, "contact_id" | "application_id" | "doc_types">): Promise<LinkItem[]> {
  const items: LinkItem[] = [];
  if (link.application_id) {
    const rows = await q<{ name: string; doc_type: string | null; status: string }>(
      `select ci.name, ci.doc_type, ac.status from application_checklist ac join checklist_items ci on ci.id=ac.item_id
        where ac.application_id=$1 and ac.status <> 'not_needed' order by ci.position, ci.id`, [link.application_id]);
    for (const r of rows) {
      if (!r.doc_type || !studentMayUpload(r.doc_type) || items.some((i) => i.docType === r.doc_type)) continue;
      items.push({ docType: r.doc_type, label: r.name, status: r.status === "verified" ? "checked" : r.status === "received" ? "received" : "needed" });
    }
  } else {
    const have = await q<{ doc_type: string; checked: boolean }>(
      "select doc_type, bool_or(verified_at is not null) checked from documents where contact_id=$1 group by doc_type", [link.contact_id]);
    for (const t of link.doc_types) {
      if (!studentMayUpload(t) || t === "other") continue;
      const h = have.find((x) => x.doc_type === t);
      items.push({ docType: t, label: STUDENT_DOC_LABEL[t] ?? t, status: h ? (h.checked ? "checked" : "received") : "needed" });
    }
  }
  items.push({ docType: "other", label: "Anything else", status: "needed" });
  return items;
}

export async function allowedTypes(link: Pick<OpenLink, "contact_id" | "application_id" | "doc_types">) {
  return new Set((await linkItems(link)).map((i) => i.docType));
}
