"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, can, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { date } from "@/lib/format";
import { getMailbox, sendMail } from "@/lib/mailbox";
import { publicBase } from "@/lib/qr";
import { LINK_DAYS, newToken, STUDENT_DOC_LABEL, tokenOf } from "@/lib/upload-links";
import type { ActionResult } from "@/components/action-form";

// Only Eplanet staff send upload links (sub-agents upload for their students themselves).
async function staffFor(contactId: string) {
  const u = await requireUser();
  if (u.scope === "agent" || !can(u, "documents.manage")) return null;
  const c = await loadContactForUser(u, contactId);
  return c ? { u, c } : null;
}

export async function createUploadLink(_: ActionResult, f: FormData): Promise<ActionResult> {
  const ok = await staffFor(String(f.get("contact_id")));
  if (!ok) return { error: "You can't send this student an upload link." };
  const { u, c } = ok;
  const appId = String(f.get("application_id") ?? "") || null;
  if (appId && !(z.uuid().safeParse(appId).success && (await q1("select 1 from applications where id=$1 and contact_id=$2", [appId, c.id]))))
    return { error: "That application doesn't belong to this student." };
  const types = f.getAll("doc_type").map(String).filter((t) => t in STUDENT_DOC_LABEL);
  if (!appId && !types.length) return { error: "Choose an application, or tick the documents the student should upload." };
  const days = Number(f.get("days"));
  if (!LINK_DAYS.includes(days)) return { error: "Choose how long the link should work." };
  const note = String(f.get("note") ?? "").trim().slice(0, 500) || null;
  const t = newToken();
  const r = await q1<{ id: number }>(
    `insert into upload_links(contact_id,application_id,token_hash,token_enc,doc_types,note,expires_at,created_by)
     values($1,$2,$3,$4,$5,$6,now() + make_interval(days => $7),$8) returning id`,
    [c.id, appId, t.hash, t.enc, types, note, days, u.id]);
  await q("insert into activities(contact_id,application_id,kind,body,user_id) values($1,$2,'note',$3,$4)",
    [c.id, appId, `Upload link created for the student (works for ${days} days).`, u.id]);
  await audit(u, "create", "upload_link", String(r!.id), undefined, { contact_id: c.id, application_id: appId, days });
  revalidatePath(`/contacts/${c.id}`);
  return { ok: "Link created. Copy it, send it on WhatsApp, or email it from the list below." };
}

export async function emailUploadLink(_: ActionResult, f: FormData): Promise<ActionResult> {
  const id = Number(f.get("id"));
  const l = await q1<{ id: number; contact_id: string; token_enc: string; expires_at: string; note: string | null; email: string | null; first_name: string; branch: string; branch_phone: string | null }>(
    `select l.id, l.contact_id, l.token_enc, l.expires_at, l.note, c.email, c.first_name, b.name branch, b.phone branch_phone
       from upload_links l join contacts c on c.id=l.contact_id join branches b on b.id=c.branch_id
      where l.id=$1 and l.revoked_at is null and l.expires_at > now()`, [id]);
  if (!l) return { error: "That link has expired or been cancelled." };
  const ok = await staffFor(l.contact_id);
  if (!ok) return { error: "You can't send this student an upload link." };
  if (!l.email) return { error: "This student has no email address. Add one, or send the link on WhatsApp." };
  if (!(await getMailbox())) return { error: "The admissions mailbox isn't connected, so emails can't be sent yet. Copy the link or send it on WhatsApp." };
  const url = `${await publicBase()}/u/${tokenOf(l.token_enc)}`;
  try {
    await sendMail({
      to: [l.email],
      subject: "Upload your documents for Eplanet International",
      text: [
        `Dear ${l.first_name},`, "",
        "Please upload your documents for your study abroad application using this private link:", "", url, "",
        ...(l.note ? [l.note, ""] : []),
        `The link works until ${date(l.expires_at)}. It is only for you, so please don't share it.`,
        "You can take a photo of each document with your phone or upload a PDF.", "",
        "Kind regards,", `Eplanet International, ${l.branch}${l.branch_phone ? ` · ${l.branch_phone}` : ""}`,
      ].join("\n"),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the email." };
  }
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'email',$2,$3)", [l.contact_id, `Upload link emailed to ${l.email}.`, ok.u.id]);
  revalidatePath(`/contacts/${l.contact_id}`);
  return { ok: `Emailed to ${l.email}.` };
}

export async function cancelUploadLink(f: FormData) {
  const id = Number(f.get("id"));
  const l = await q1<{ contact_id: string }>("select contact_id from upload_links where id=$1 and revoked_at is null", [id]);
  if (!l) return;
  const ok = await staffFor(l.contact_id);
  if (!ok) return;
  await q("update upload_links set revoked_at=now(), revoked_by=$2 where id=$1", [id, ok.u.id]);
  await audit(ok.u, "revoke", "upload_link", String(id));
  revalidatePath(`/contacts/${l.contact_id}`);
}
