"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, requireUser } from "@/lib/auth";
import { loadApplicationForUser, loadContactForUser } from "@/lib/access";
import { q, q1, tx } from "@/lib/db";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const DEST_COUNTRY: Record<string, string[]> = { AU: ["AU"], UK: ["GB"], CA: ["CA"], US: ["US"], NZ: ["NZ"], EU: ["IE", "DE", "FR", "NL", "ES", "SE", "IT", "MT", "FI", "DK", "HU", "PL", "LT", "LV", "AT", "BE", "CZ", "PT", "CH", "CY"] };

export async function createApplication(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "applications.edit")) return { error: "Your role can't start applications." };
  const contactId = String(f.get("contact_id"));
  const c = await loadContactForUser(u, contactId);
  if (!c) return { error: "You can't start applications for this student." };
  const workflowId = Number(f.get("workflow_id"));
  const wf = await q1<{ id: number; destination: string | null }>("select id, destination from workflows where id=$1 and active", [workflowId]);
  if (!wf) return { error: "Choose the country / workflow." };
  const partnerId = str(f, "partner_id") ? Number(str(f, "partner_id")) : null;
  const courseId = str(f, "course_id") ? Number(str(f, "course_id")) : null;
  const courseTitle = str(f, "course_title");
  if (!partnerId) return { error: "Choose the institution." };
  if (!courseId && !courseTitle) return { error: "Choose a course from the list or type the course name." };
  const partner = await q1<{ country_code: string | null }>("select country_code from partners where id=$1", [partnerId]);
  if (wf.destination && partner?.country_code && !DEST_COUNTRY[wf.destination]?.includes(partner.country_code))
    return { error: "That institution isn't in the chosen country. Check the country or the institution." };

  const onshore = f.get("onshore_transfer") === "on";
  const id = await tx(async (db) => {
    const first = (await db.query<{ id: number }>("select id from workflow_stages where workflow_id=$1 order by position limit 1", [workflowId])).rows[0];
    const r = await db.query<{ id: string; ref: string }>(
      `insert into applications(contact_id,branch_id,owner_id,workflow_id,stage_id,destination,partner_id,course_id,course_title,intake,channel,
          tuition_fee,fee_currency,onshore_transfer,created_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id, ref`,
      [contactId, c.branch_id, str(f, "owner_id") ?? c.owner_id ?? u.id, workflowId, first.id, wf.destination, partnerId, courseId, courseTitle,
       str(f, "intake"), str(f, "channel") ?? "direct", str(f, "tuition_fee") ? Number(str(f, "tuition_fee")) : null, str(f, "fee_currency"), onshore, u.id]);
    const app = r.rows[0];
    await db.query("insert into stage_history(application_id,to_stage_id,changed_by,note) values($1,$2,$3,'Application started')", [app.id, first.id, u.id]);
    await db.query("insert into application_checklist(application_id,item_id) select $1, id from checklist_items where workflow_id=$2", [app.id, workflowId]);
    // Documents already on the student's file tick their checklist items straight away.
    await db.query(
      `update application_checklist ac set status='received', document_id=d.id from checklist_items ci, lateral
         (select id from documents where contact_id=$2 and doc_type=ci.doc_type order by created_at desc limit 1) d
       where ci.id=ac.item_id and ac.application_id=$1`, [app.id, contactId]);
    await db.query("insert into activities(contact_id,application_id,kind,body,user_id) values($1,$2,'stage',$3,$4)", [contactId, app.id, `Started application ${app.ref}`, u.id]);
    await db.query("update contacts set stage='client', updated_at=now() where id=$1 and stage in ('lead','prospect')", [contactId]);
    return app.id;
  });
  await audit(u, "create", "application", id);
  redirect(`/applications/${id}`);
}

export async function moveStage(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await loadApplicationForUser(u, id);
  if (!a || !can(u, "applications.edit")) return { error: "You can't update this application." };
  const stageId = Number(f.get("stage_id"));
  const stage = await q1<{ id: number; name: string; outcome: string | null; workflow_id: number }>("select id, name, outcome, workflow_id from workflow_stages where id=$1", [stageId]);
  if (!stage || stage.workflow_id !== a.workflow_id) return { error: "Choose a step from this application's workflow." };
  if (stage.id === a.stage_id) return { error: "The application is already at that step." };
  const note = str(f, "note");
  if (stage.outcome === "lost" && !note) return { error: "Add a short reason when an application is withdrawn or refused." };
  const status = stage.outcome === "won" ? "won" : stage.outcome === "lost" ? "lost" : "open";
  const accepted = str(f, "accepted_date");
  await tx(async (db) => {
    await db.query(
      `update applications set stage_id=$2, status=$3, lost_reason=case when $3='lost' then $4 else lost_reason end,
         accepted_date=coalesce($5::date, accepted_date), updated_at=now() where id=$1`, [id, stageId, status, note, accepted]);
    await db.query("insert into stage_history(application_id,from_stage_id,to_stage_id,changed_by,note) values($1,$2,$3,$4,$5)", [id, a.stage_id, stageId, u.id, note]);
    await db.query("insert into activities(contact_id,application_id,kind,body,user_id) values($1,$2,'stage',$3,$4)",
      [a.contact_id, id, `Moved to “${stage.name}”${note ? ` — ${note}` : ""}`, u.id]);
  });
  await audit(u, "update", "application", id, { stage_id: a.stage_id }, { stage_id: stageId });
  revalidatePath(`/applications/${id}`);
  return { ok: `Moved to “${stage.name}”.` };
}

export async function updateApplication(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await loadApplicationForUser(u, id);
  if (!a || !can(u, "applications.edit")) return { error: "You can't update this application." };
  const owner = str(f, "owner_id");
  await q(
    `update applications set intake=$2, channel=$3, student_id_at_provider=$4, tuition_fee=$5, fee_currency=$6, onshore_transfer=$7,
       accepted_date=$8, owner_id=$9, updated_at=now() where id=$1`,
    [id, str(f, "intake"), str(f, "channel") ?? "direct", str(f, "student_id_at_provider"), str(f, "tuition_fee") ? Number(str(f, "tuition_fee")) : null,
     str(f, "fee_currency"), f.get("onshore_transfer") === "on", str(f, "accepted_date"), owner]);
  await audit(u, "update", "application", id);
  revalidatePath(`/applications/${id}`);
  return { ok: "Saved." };
}

export async function setChecklist(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await loadApplicationForUser(u, id);
  if (!a || !can(u, "documents.manage")) return;
  const status = String(f.get("status"));
  if (!["pending", "received", "verified", "not_needed"].includes(status)) return;
  await q("update application_checklist set status=$3, updated_by=$4, updated_at=now() where application_id=$1 and item_id=$2", [id, Number(f.get("item_id")), status, u.id]);
  revalidatePath(`/applications/${id}`);
}
