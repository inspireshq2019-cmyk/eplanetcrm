"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, can, requireUser } from "@/lib/auth";
import { loadApplicationForUser } from "@/lib/access";
import { q, q1, tx } from "@/lib/db";
import { sendMail, validAddress, type Attachment } from "@/lib/mailbox";
import { getFile } from "@/lib/storage";
import { statusNote, syncStage } from "@/lib/admissions";
import type { ActionResult } from "@/components/action-form";

const MAX_TOTAL = 20 * 1024 * 1024;
const list = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Emails the application pack (cover message + chosen documents) from the shared admissions mailbox. */
export async function sendPack(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  if (!can(u, "admissions.manage")) return { error: "Only the admission team can email application packs." };
  const a = await loadApplicationForUser(u, id);
  if (!a || !a.adm_status) return { error: "This application hasn't been sent to admissions." };
  const to = list(String(f.get("to") ?? "")), cc = list(String(f.get("cc") ?? ""));
  if (!to.length) return { error: "Enter who it goes to." };
  if (to.length + cc.length > 10) return { error: "Send to 10 addresses at most." };
  const bad = [...to, ...cc].find((x) => !validAddress(x));
  if (bad) return { error: `Check the email address “${bad}”.` };
  const subject = String(f.get("subject") ?? "").trim().slice(0, 200);
  const text = String(f.get("body") ?? "").trim().slice(0, 20000);
  if (!subject || !text) return { error: "Add a subject and a message." };
  const ids = f.getAll("doc").map(String).filter((x) => z.uuid().safeParse(x).success);
  const docs = ids.length ? await q<{ id: string; filename: string; mime: string | null; storage_key: string; size_bytes: number | null }>(
    "select id, filename, mime, storage_key, size_bytes from documents where contact_id=$1 and id = any($2::uuid[])", [a.contact_id, ids]) : [];
  if (docs.length !== ids.length) return { error: "Some of the chosen files aren't on this student's record." };
  if (docs.reduce((n, d) => n + (d.size_bytes ?? 0), 0) > MAX_TOTAL) return { error: "The files add up to more than 20 MB. Leave some out or send them in two emails." };
  let attachments: Attachment[];
  try {
    attachments = await Promise.all(docs.map(async (d) => ({ filename: d.filename, mime: d.mime ?? "application/octet-stream", data: await getFile(d.storage_key) })));
  } catch {
    return { error: "Couldn't read one of the files from storage. Try again." };
  }
  let sent;
  try {
    sent = await sendMail({ to, cc, subject, text, attachments });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the email." };
  }
  const record = f.get("record") === "on";
  const routeId = Number(f.get("route_id")) || null;
  await tx(async (db) => {
    await db.query("insert into application_messages(application_id,author_id,body,internal,kind) values($1,$2,$3,true,'email')",
      [id, u.id, `Application pack emailed from ${sent.from} to ${[...to, ...cc].join(", ")}: “${subject}”, ${docs.length} file${docs.length === 1 ? "" : "s"}${docs.length ? ` (${docs.map((d) => d.filename).join(", ")})` : ""}.`]);
    if (record) {
      const route = routeId ? (await db.query<{ id: number; route_kind: string; via_partner_id: number | null }>(
        "select r.id, r.route_kind, r.via_partner_id from partner_routes r join applications a on a.partner_id=r.partner_id where r.id=$1 and a.id=$2 and r.active", [routeId, id])).rows[0] : null;
      await db.query(
        `insert into application_submissions(application_id,route_id,route_kind,via_partner_id,method,submitted_by,notes) values($1,$2,$3,$4,'email',$5,$6)`,
        [id, route?.id ?? null, route?.route_kind ?? "direct", route?.via_partner_id ?? null, u.id, `Emailed to ${to.join(", ")}`]);
      await db.query("update applications set adm_status='lodged', adm_request=null, adm_officer_id=coalesce(adm_officer_id,$2), adm_updated_at=now(), updated_at=now() where id=$1", [id, u.id]);
      const partner = (await db.query<{ name: string | null }>("select p.name from applications a left join partners p on p.id=a.partner_id where a.id=$1", [id])).rows[0]?.name;
      await statusNote(db, id, u.id, `Submitted to ${partner ?? "the institution"}.`);
      await syncStage(db, id, u.id, "applied");
    }
  });
  await audit(u, "export", "application", id, undefined, { emailed_to: to.length + cc.length, files: docs.length });
  redirect(`/applications/${id}?emailed=1`);
}
