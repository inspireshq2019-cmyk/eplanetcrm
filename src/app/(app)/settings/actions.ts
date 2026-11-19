"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, canSeeBranch, requireUser, type CurrentUser } from "@/lib/auth";
import { assignableRoles } from "@/lib/staff";
import { q, q1, tx } from "@/lib/db";
import { PERMISSIONS } from "../../../../db/seed-data";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string, max = 200) => { const v = String(f.get(k) ?? "").trim().slice(0, max); return v === "" ? null : v; };
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "eplanetintl.com").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

async function staffAdmin(): Promise<CurrentUser | null> {
  const u = await requireUser();
  return can(u, "settings.users") ? u : null;
}

export async function saveStaff(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await staffAdmin();
  if (!u) return { error: "Your role can't manage staff." };
  const id = str(f, "id");
  const name = str(f, "name", 120);
  const email = str(f, "email", 150)?.toLowerCase() ?? null;
  const role = str(f, "role_key");
  const branchId = Number(f.get("primary_branch_id"));
  if (!name) return { error: "Enter the staff member's name." };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter their work email address." };
  const domain = email.split("@")[1];
  if (!ALLOWED_DOMAINS.includes(domain) && !domain.endsWith(".invalid")) return { error: `Staff sign in with Google Workspace, so the email must end in @${ALLOWED_DOMAINS.join(" or @")}.` };
  const roles = await assignableRoles(u);
  const r = roles.find((x) => x.key === role);
  if (!r) return { error: "Choose a role you're allowed to give." };
  if (!canSeeBranch(u, branchId)) return { error: "You can only add staff to your own branches." };
  const extra = f.getAll("extra_branch").map(Number).filter((b) => b && b !== branchId && canSeeBranch(u, b));
  const marn = str(f, "marn", 20);
  const marnExpiry = str(f, "marn_expiry", 10);
  if (marn && !/^\d{7}$/.test(marn)) return { error: "A MARN is 7 digits. Check the agent's registration on the OMARA register." };
  if (marn && !marnExpiry) return { error: "Enter the date the agent's registration ends, so the CRM can warn before it lapses." };
  const active = f.get("active") === "on";

  if (id) {
    const before = await q1<{ id: string; primary_branch_id: number; role_key: string; email: string; active: boolean }>("select id, primary_branch_id, role_key, email, active from users where id::text=$1", [id]);
    if (!before || !canSeeBranch(u, before.primary_branch_id)) return { error: "You can't edit this person." };
    if (!roles.some((x) => x.key === before.role_key)) return { error: "This person has a role above yours; ask an owner to change them." };
    if (before.id === u.id && (!active || role !== before.role_key)) return { error: "You can't change your own role or deactivate yourself." };
  }
  try {
    const uid = await tx(async (db) => {
      const vals = [name, email, str(f, "title", 100), str(f, "phone", 30), role, branchId, marn, marn ? marnExpiry : null, str(f, "qualification", 200), active];
      const row = id
        ? (await db.query<{ id: string }>("update users set name=$2,email=$3,title=$4,phone=$5,role_key=$6,primary_branch_id=$7,marn=$8,marn_expiry=$9,qualification=$10,active=$11 where id::text=$1 returning id", [id, ...vals])).rows[0]
        : (await db.query<{ id: string }>("insert into users(name,email,title,phone,role_key,primary_branch_id,marn,marn_expiry,qualification,active) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id", vals)).rows[0];
      await db.query("delete from user_branches where user_id=$1", [row.id]);
      for (const b of extra) await db.query("insert into user_branches(user_id,branch_id) values($1,$2) on conflict do nothing", [row.id, b]);
      return row.id;
    });
    await audit(u, id ? "update" : "create", "user", uid, undefined, { email, role, branchId, active, marn: marn ? "set" : null });
    if (!id) redirect(`/settings/staff/${uid}?created=1`);
    revalidatePath(`/settings/staff/${uid}`);
    return { ok: active ? "Saved." : "Saved. This person can no longer sign in." };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "Someone already uses that email address." };
    throw e;
  }
}

export async function saveBranch(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = Number(f.get("id"));
  if (!can(u, "settings.system") && !(can(u, "settings.users") && canSeeBranch(u, id))) return { error: "Your role can't edit branches." };
  const before = await q1("select name,address,phone,email,timezone,active from branches where id=$1", [id]);
  if (!before) return { error: "Branch not found." };
  const tz = str(f, "timezone", 60) ?? "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return { error: "That time zone isn't recognised. Use a name like Asia/Dhaka." }; }
  const name = str(f, "name", 100);
  if (!name) return { error: "Enter the branch name." };
  await q("update branches set name=$2,address=$3,phone=$4,email=$5,timezone=$6,active=$7 where id=$1",
    [id, name, str(f, "address", 300), str(f, "phone", 40), str(f, "email", 150), tz, can(u, "settings.system") ? f.get("active") === "on" : before.active]);
  await audit(u, "update", "branch", String(id), before, { name, address: str(f, "address", 300), phone: str(f, "phone", 40), email: str(f, "email", 150), timezone: tz });
  revalidatePath("/settings/branches");
  return { ok: `${name} saved.` };
}

export async function saveRole(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "settings.system")) return { error: "Only owners can change roles." };
  const key = str(f, "key", 40);
  if (!key || key === "owner") return { error: "The owner role always has every permission." };
  const valid = new Set(Object.keys(PERMISSIONS));
  const perms = f.getAll("perm").map(String).filter((p) => valid.has(p));
  const before = await q1<{ permissions: string[] }>("select permissions from roles where key=$1", [key]);
  if (!before) return { error: "Role not found." };
  await q("update roles set permissions=$2 where key=$1", [key, perms]);
  await audit(u, "update", "role", key, { permissions: before.permissions }, { permissions: perms });
  revalidatePath("/settings/roles");
  return { ok: "Permissions saved. They apply the next time each person loads a page." };
}
