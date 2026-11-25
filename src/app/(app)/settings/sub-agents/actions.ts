"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { agencyFor } from "@/lib/agency";
import { q, q1 } from "@/lib/db";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string, max = 150) => { const v = String(f.get(k) ?? "").trim().slice(0, max); return v || null; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function manager() {
  const u = await requireUser();
  return can(u, "subagents.manage") ? u : null;
}
export async function saveAgency(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await manager();
  if (!u) return { error: "Your role can't manage sub-agents." };
  const id = Number(f.get("id")) || null;
  if (id && !(await agencyFor(u, id))) return { error: "Sub-agent not found." };
  const name = str(f, "name");
  if (!name) return { error: "Enter the agency's name." };
  const home = Number(f.get("home_branch_id"));
  if (!home || !canSeeBranch(u, home)) return { error: "Choose the Eplanet branch that looks after this agency." };
  const email = str(f, "email")?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { error: "Check the agency's email address." };
  const share = str(f, "default_share_pct");
  const pct = share === null ? null : Number(share);
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return { error: "The usual share must be between 0 and 100%." };
  const country = str(f, "country_code", 2);
  const vals = [name, str(f, "contact_person", 100), email, str(f, "phone", 30), country, pct, home];
  let agencyId = id;
  if (id) {
    await q("update sub_agents set name=$2, contact_person=$3, email=$4, phone=$5, country_code=$6, default_share_pct=$7, home_branch_id=$8, active=$9 where id=$1", [id, ...vals, f.get("active") !== "off"]);
    // Their students move with the agency, so the new home branch sees them.
    await q("update users set primary_branch_id=$2 where sub_agent_id=$1", [id, home]);
    await audit(u, "update", "sub_agent", String(id), undefined, { name, home_branch_id: home });
  } else {
    agencyId = (await q1<{ id: number }>("insert into sub_agents(name,contact_person,email,phone,country_code,default_share_pct,home_branch_id) values($1,$2,$3,$4,$5,$6,$7) returning id", vals))!.id;
    await audit(u, "create", "sub_agent", String(agencyId), undefined, { name, home_branch_id: home });
  }
  revalidatePath("/settings/sub-agents");
  redirect(`/settings/sub-agents/${agencyId}`);
}

export async function addLogin(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await manager();
  if (!u) return { error: "Your role can't manage sub-agents." };
  const agency = await agencyFor(u, Number(f.get("sub_agent_id")));
  if (!agency) return { error: "Sub-agent not found." };
  const full = await q1<{ home_branch_id: number | null; active: boolean }>("select home_branch_id, active from sub_agents where id=$1", [agency.id]);
  if (!full?.home_branch_id) return { error: "Set the agency's home branch first." };
  if (!full.active) return { error: "This agency is switched off. Switch it on first." };
  const name = str(f, "name", 100);
  const email = str(f, "email")?.toLowerCase() ?? null;
  if (!name) return { error: "Enter the person's name." };
  if (!email || !EMAIL.test(email)) return { error: "Enter the person's email address. Their sign-in codes are sent there." };
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || "eplanetintl.com").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.includes(email.split("@")[1] ?? "")) return { error: "That's an Eplanet staff address. Add Eplanet staff in Settings › Staff instead." };
  if (await q1("select 1 from users where lower(email)=$1", [email])) return { error: "Someone already uses that email address in the CRM." };
  const r = await q1<{ id: string }>(
    "insert into users(email,name,role_key,primary_branch_id,sub_agent_id,title) values($1,$2,'sub_agent',$3,$4,$5) returning id",
    [email, name, full.home_branch_id, agency.id, str(f, "title", 100)]);
  await audit(u, "create", "user", r!.id, undefined, { sub_agent_id: agency.id, role: "sub_agent" });
  revalidatePath(`/settings/sub-agents/${agency.id}`);
  return { ok: `${name} can now sign in at the CRM's sign-in page with “Partner agency sign-in”, using ${email}.` };
}

export async function setLoginActive(f: FormData) {
  const u = await manager();
  if (!u) return;
  const user = await q1<{ id: string; sub_agent_id: number | null }>("select id, sub_agent_id from users where id::text=$1 and sub_agent_id is not null", [String(f.get("id"))]);
  if (!user || !(await agencyFor(u, user.sub_agent_id!))) return;
  const active = f.get("active") === "1";
  await q("update users set active=$2 where id=$1", [user.id, active]);
  if (!active) await q("update login_codes set used_at=now() where user_id=$1 and used_at is null", [user.id]);
  await audit(u, "update", "user", user.id, undefined, { active });
  revalidatePath(`/settings/sub-agents/${user.sub_agent_id}`);
}
