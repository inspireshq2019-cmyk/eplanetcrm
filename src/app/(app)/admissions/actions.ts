"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, can, requireUser, type CurrentUser } from "@/lib/auth";
import { loadApplicationForUser } from "@/lib/access";
import { q, q1, tx } from "@/lib/db";
import { NEXT_STATUS, statusNote, syncStage, type AdmStatus } from "@/lib/admissions";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/** The application, if this user may work on it; admissions staff need the central permission. */
async function forUser(u: CurrentUser, id: string) {
  const a = await loadApplicationForUser(u, id);
  return a;
}
async function forAdmissions(u: CurrentUser, id: string) {
  if (!can(u, "admissions.manage")) return null;
  return loadApplicationForUser(u, id);
}

/** Branch or sub-agent hands the application to the central admission team (or sends it back after a request). */
export async function sendToAdmissions(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await forUser(u, id);
  if (!a || !can(u, "applications.edit")) return { error: "You can't send this application." };
  if (a.adm_status && a.adm_status !== "needs_info") return { error: "This application is already with the admission team." };
  const note = str(f, "message");
  if (a.adm_status === "needs_info" && !note) return { error: "Tell the admission team what you've added or changed." };
  await tx(async (db) => {
    const cur = (await db.query<{ adm_status: string | null; adm_officer_id: string | null }>("select adm_status, adm_officer_id from applications where id=$1 for update", [id])).rows[0];
    if (cur.adm_status && cur.adm_status !== "needs_info") return;
    const next = cur.adm_status === "needs_info" && cur.adm_officer_id ? "in_review" : "submitted";
    await db.query(
      `update applications set adm_status=$2, adm_sent_at=coalesce(adm_sent_at, now()), adm_sent_by=coalesce(adm_sent_by, $3), adm_updated_at=now(), adm_request=null, updated_at=now() where id=$1`,
      [id, next, u.id]);
    await statusNote(db, id, u.id, cur.adm_status === "needs_info" ? "Sent back to the admission team." : "Sent to the admission team.");
    if (note) await db.query("insert into application_messages(application_id,author_id,body) values($1,$2,$3)", [id, u.id, note]);
  });
  await audit(u, "update", "application", id, undefined, { adm_status: "sent" });
  revalidatePath(`/applications/${id}`);
  return { ok: "Sent. The admission team will check it and update you here." };
}

/** A message on the application. Internal notes are only for the admission team. */
export async function postMessage(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await forUser(u, id);
  if (!a) return { error: "You can't message on this application." };
  const body = str(f, "body", 4000);
  if (!body) return { error: "Write a message first." };
  const internal = f.get("internal") === "on" && can(u, "admissions.manage");
  await q("insert into application_messages(application_id,author_id,body,internal) values($1,$2,$3,$4)", [id, u.id, body, internal]);
  await q("insert into application_reads(user_id,application_id) values($1,$2) on conflict (user_id,application_id) do update set last_read_at=now()", [u.id, id]);
  revalidatePath(`/applications/${id}`);
  return { ok: internal ? "Note saved (admission team only)." : "Message sent." };
}

/** Admission team: take an application, or hand it to a colleague. */
export async function assignOfficer(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await forAdmissions(u, id);
  if (!a || !a.adm_status) return;
  const raw = String(f.get("officer_id") ?? "");
  const officer = f.get("take") === "1" || raw === "me" ? u.id : raw;
  if (officer && !z.uuid().safeParse(officer).success) return;
  const who = officer ? await q1<{ name: string }>(
    "select u.name from users u join roles r on r.key=u.role_key where u.id=$1 and u.active and u.sub_agent_id is null and 'admissions.manage' = any(r.permissions)", [officer]) : null;
  if (officer && !who) return;
  await tx(async (db) => {
    await db.query(
      "update applications set adm_officer_id=$2, adm_status=case when adm_status='submitted' and $2::uuid is not null then 'in_review' else adm_status end, adm_updated_at=now() where id=$1",
      [id, officer || null]);
    await statusNote(db, id, u.id, who ? `${who.name} is handling this application.` : "Unassigned from the admission team.", true);
  });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/admissions");
}

/** Admission team: move the application on (checking, needs something from the branch, decided, withdrawn). */
export async function setAdmStatus(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await forAdmissions(u, id);
  if (!a || !a.adm_status) return { error: "You can't update this application." };
  const to = String(f.get("status")) as AdmStatus;
  const from = a.adm_status as AdmStatus;
  if (!NEXT_STATUS[from]?.includes(to)) return { error: "That change isn't possible from the current status." };
  const text = str(f, "text");
  if (to === "needs_info" && !text) return { error: "Say exactly what the branch needs to send or fix." };
  if (to === "withdrawn" && !text) return { error: "Add a short reason for withdrawing." };
  await tx(async (db) => {
    await db.query(
      "update applications set adm_status=$2, adm_request=case when $2='needs_info' then $3 else null end, adm_updated_at=now(), adm_officer_id=coalesce(adm_officer_id,$4), updated_at=now() where id=$1",
      [id, to, text || null, u.id]);
    const line = to === "needs_info" ? `Action needed: ${text}` : to === "in_review" ? "The admission team is checking this application."
      : to === "withdrawn" ? `Withdrawn: ${text}` : to === "offer" ? "Offer received." : to === "refused" ? "Refused by the institution." : "Status updated.";
    await statusNote(db, id, u.id, line);
    if (to === "withdrawn") await db.query("update applications set status='lost', lost_reason=coalesce(lost_reason,$2) where id=$1 and status='open'", [id, `Withdrawn: ${text}`.slice(0, 300)]);
    if (to === "in_review" && (from === "withdrawn" || from === "refused")) await db.query("update applications set status='open', lost_reason=null where id=$1 and status='lost'", [id]);
  });
  await audit(u, "update", "application", id, { adm_status: from }, { adm_status: to });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/admissions");
  return { ok: "Updated." };
}

/** Admission team: record that the application went to the institution, and by which route. */
export async function recordSubmission(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await forAdmissions(u, id);
  if (!a || !a.adm_status) return { error: "You can't update this application." };
  if (!["submitted", "in_review", "lodged", "offer", "refused"].includes(a.adm_status)) return { error: "Bring the application back into checking before submitting it again." };
  const app = await q1<{ partner_id: number | null; partner: string | null }>("select a.partner_id, p.name partner from applications a left join partners p on p.id=a.partner_id where a.id=$1", [id]);
  const routeId = Number(f.get("route_id")) || null;
  let route: { id: number | null; route_kind: string; via_partner_id: number | null; method: string } | null = null;
  if (routeId) {
    const r = await q1<{ id: number; route_kind: string; via_partner_id: number | null; method: string }>(
      "select id, route_kind, via_partner_id, method from partner_routes where id=$1 and partner_id=$2 and active", [routeId, app?.partner_id ?? 0]);
    if (!r) return { error: "Choose one of this institution's routes." };
    route = r;
  } else {
    const kind = str(f, "route_kind");
    if (!["direct", "master_agent", "portal"].includes(kind)) return { error: "Choose how it was submitted." };
    const via = Number(f.get("via_partner_id")) || null;
    if (kind !== "direct") {
      if (!via) return { error: "Choose the master agent or portal it went through." };
      if (!(await q1("select 1 from partners where id=$1 and kind in ('aggregator','portal') and active", [via]))) return { error: "Choose a master agent or admission portal from the list." };
    }
    route = { id: null, route_kind: kind, via_partner_id: kind === "direct" ? null : via, method: str(f, "method") === "email" ? "email" : "portal" };
  }
  const on = day(str(f, "submitted_on", 10)) ?? new Date().toISOString().slice(0, 10);
  const ref = str(f, "external_ref", 100) || null;
  await tx(async (db) => {
    await db.query(
      `insert into application_submissions(application_id,route_id,route_kind,via_partner_id,method,external_ref,submitted_on,submitted_by,notes)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, route!.id, route!.route_kind, route!.via_partner_id, route!.method, ref, on, u.id, str(f, "notes", 500) || null]);
    await db.query("update applications set adm_status='lodged', adm_request=null, adm_officer_id=coalesce(adm_officer_id,$2), adm_updated_at=now(), student_id_at_provider=coalesce(student_id_at_provider,$3), updated_at=now() where id=$1",
      [id, u.id, route!.route_kind === "direct" ? ref : null]);
    await statusNote(db, id, u.id, `Submitted to ${app?.partner ?? "the institution"}.`);
    await syncStage(db, id, u.id, "applied");
  });
  await audit(u, "create", "application_submission", id, undefined, { route_kind: route.route_kind, via: route.via_partner_id });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/admissions");
  return { ok: "Submission recorded." };
}

/** Admission team: what the institution decided. Offer letters are uploaded as documents on the application. */
export async function recordOutcome(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const a = await forAdmissions(u, id);
  if (!a) return { error: "You can't update this application." };
  const sid = Number(f.get("submission_id"));
  const sub = await q1<{ id: number }>("select id from application_submissions where id=$1 and application_id=$2", [sid, id]);
  if (!sub) return { error: "Submission not found." };
  const outcome = str(f, "outcome");
  if (!["conditional", "unconditional", "refused", "withdrawn", "pending"].includes(outcome)) return { error: "Choose the outcome." };
  const note = str(f, "note", 500);
  if (outcome === "withdrawn" && !note) return { error: "Add a short reason for withdrawing." };
  const on = day(str(f, "outcome_on", 10)) ?? new Date().toISOString().slice(0, 10);
  await tx(async (db) => {
    await db.query("update application_submissions set outcome=$2, outcome_on=case when $2='pending' then null else $3::date end, notes=coalesce(nullif($4,''),notes) where id=$1", [sid, outcome, on, note]);
    // The application's status follows the best outcome across its submissions.
    const all = (await db.query<{ outcome: string }>("select outcome from application_submissions where application_id=$1", [id])).rows.map((r) => r.outcome);
    const status = all.some((o) => o === "conditional" || o === "unconditional") ? "offer" : all.some((o) => o === "pending") ? "lodged" : all.every((o) => o === "withdrawn") ? "withdrawn" : "refused";
    await db.query("update applications set adm_status=$2, adm_updated_at=now(), updated_at=now(), accepted_date=case when $3 then coalesce(accepted_date,$4::date) else accepted_date end where id=$1",
      [id, status, outcome === "unconditional", on]);
    const label = { conditional: "Conditional offer received.", unconditional: "Unconditional offer received.", refused: "Refused by the institution.", withdrawn: `Withdrawn: ${note}`, pending: "Waiting for the institution's decision again." }[outcome]!;
    await statusNote(db, id, u.id, note && outcome !== "withdrawn" ? `${label} ${note}` : label);
    if (status === "offer") await syncStage(db, id, u.id, "offer");
    if (status === "refused") await syncStage(db, id, u.id, "refused");
  });
  await audit(u, "update", "application_submission", String(sid), undefined, { outcome });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/admissions");
  return { ok: "Outcome recorded." };
}
