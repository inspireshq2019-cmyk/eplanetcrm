"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { resolveContact } from "@/lib/contact-pick";
import { q, q1 } from "@/lib/db";
import { VISA_STATUS_LABEL } from "@/lib/format";
import { auditDiff } from "@/lib/audit-diff";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };

async function checkAgent(agentId: string | null, destination: string) {
  if (!agentId) return null;
  const a = await q1<{ marn: string | null; marn_expiry: string | null; name: string }>("select marn, marn_expiry, name from users where id=$1 and active", [agentId]);
  if (!a) return "Choose an active staff member as the agent.";
  // Australian visa advice must come from a registered migration agent with a current MARN.
  if (destination === "AU") {
    if (!a.marn) return `${a.name} has no MARN on file. Only registered migration agents can handle Australian visa cases; add their MARN in Settings → Staff.`;
    if (a.marn_expiry && a.marn_expiry < new Date().toISOString().slice(0, 10)) return `${a.name}'s MARN registration expired on ${a.marn_expiry}. Renew it before assigning Australian visa cases.`;
  }
  return null;
}

export async function createVisaCase(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "visa.edit")) return { error: "Only registered migration agents and visa staff can open visa cases." };
  const contactRaw = str(f, "contact") ?? "";
  const c = (await resolveContact(u, contactRaw)) ?? (z.uuid().safeParse(contactRaw).success ? await loadContactForUser(u, contactRaw) : null);
  if (!c) return { error: "Choose the student (type their name or C-number and pick from the list)." };
  const destination = str(f, "destination") ?? "AU";
  const agentId = str(f, "agent_id");
  const agentErr = await checkAgent(agentId, destination);
  if (agentErr) return { error: agentErr };
  const appId = str(f, "application_id");
  const r = await q<{ id: string; ref: string }>(
    `insert into visa_cases(contact_id,application_id,branch_id,agent_id,destination,subclass,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id, ref`,
    [c.id, appId, c.branch_id, agentId, destination, str(f, "subclass"), str(f, "notes"), u.id]);
  await q("insert into activities(contact_id,application_id,kind,body,user_id) values($1,$2,'visa',$3,$4)", [c.id, appId, `Opened visa case ${r[0].ref} (${destination} ${str(f, "subclass") ?? ""})`, u.id]);
  await audit(u, "create", "visa_case", r[0].id);
  redirect(`/visa/${r[0].id}`);
}

export async function updateVisaCase(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("id"));
  const v = await q1<{ branch_id: number; contact_id: string; status: string; destination: string; agent_id: string | null; ref: string }>(
    "select branch_id, contact_id, status, destination, agent_id, ref from visa_cases where id=$1", [id]);
  if (!v || !can(u, "visa.edit") || !canSeeBranch(u, v.branch_id)) return { error: "You can't update this visa case." };
  const status = str(f, "status") ?? v.status;
  if (!VISA_STATUS_LABEL[status]) return { error: "Choose a status." };
  const agentId = str(f, "agent_id");
  const agentErr = await checkAgent(agentId, v.destination);
  if (agentErr) return { error: agentErr };
  if (status === "lodged" && !str(f, "lodged_on")) return { error: "Enter the date the visa was lodged." };
  if ((status === "granted" || status === "refused") && !str(f, "decision_on")) return { error: "Enter the decision date." };
  const before = await q1<Record<string, unknown>>("select * from visa_cases where id=$1", [id]);
  await q(
    `update visa_cases set status=$2, agent_id=$3, subclass=$4, lodged_on=$5, trn=$6, decision_on=$7, visa_expiry=$8, notes=$9, updated_at=now() where id=$1`,
    [id, status, agentId, str(f, "subclass"), str(f, "lodged_on"), str(f, "trn"), str(f, "decision_on"), str(f, "visa_expiry"), str(f, "notes")]);
  if (status !== v.status) {
    await q("insert into activities(contact_id,kind,body,user_id) values($1,'visa',$2,$3)", [v.contact_id, `Visa case ${v.ref}: ${VISA_STATUS_LABEL[status]}`, u.id]);
  }
  await audit(u, "update", "visa_case", id, undefined, auditDiff(before, { status, agent_id: agentId, subclass: str(f, "subclass"), lodged_on: str(f, "lodged_on"), trn: str(f, "trn"), decision_on: str(f, "decision_on"), visa_expiry: str(f, "visa_expiry"), notes: str(f, "notes") }));
  revalidatePath(`/visa/${id}`);
  return { ok: "Visa case updated." };
}
