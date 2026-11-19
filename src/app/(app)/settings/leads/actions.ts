"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { claimLead, failLead, saveLead } from "@/lib/ad-leads";
import { fetchLead, subscribePage, unsubscribePage } from "@/lib/meta";
import { newSecret, open, seal, sha256 } from "@/lib/secret-box";
import type { ActionResult } from "@/components/action-form";

async function allowed(branchId: number) {
  const u = await requireUser();
  if (!can(u, "leads.connect") || !Number.isInteger(branchId) || !canSeeBranch(u, branchId)) return null;
  return u;
}

export async function setLeadAssign(_: ActionResult, f: FormData): Promise<ActionResult> {
  const branch = Number(f.get("branch_id"));
  const u = await allowed(branch);
  if (!u) return { error: "You can't change this branch's settings." };
  const mode = String(f.get("lead_assign"));
  if (mode !== "rotate" && mode !== "unassigned") return { error: "Choose who gets new ad leads." };
  await q("update branches set lead_assign=$2 where id=$1", [branch, mode]);
  await audit(u, "update", "branch", String(branch), undefined, { lead_assign: mode });
  revalidatePath("/settings/leads");
  return { ok: mode === "rotate" ? "New ad leads will go to the branch's counsellors in turn." : "New ad leads will wait unassigned for the branch head." };
}

export async function addGoogle(_: ActionResult, f: FormData): Promise<ActionResult> {
  const branch = Number(f.get("branch_id"));
  const u = await allowed(branch);
  if (!u) return { error: "You can't change this branch's settings." };
  const name = String(f.get("name") ?? "").trim().slice(0, 100);
  if (!name) return { error: "Give the connection a name, e.g. the Google Ads account or campaign it's for." };
  const n = await q1<{ n: number }>("select count(*)::int n from lead_sources where branch_id=$1 and kind='google' and active", [branch]);
  if ((n?.n ?? 0) >= 20) return { error: "This branch already has 20 Google connections. Remove one you no longer use." };
  const token = newSecret(24), key = newSecret(18);
  const r = await q1<{ id: number }>(
    "insert into lead_sources(branch_id,kind,name,secret_enc,url_token_hash,connected_by) values($1,'google',$2,$3,$4,$5) returning id",
    [branch, name, seal(JSON.stringify({ key, token })), sha256(token), u.id]);
  await audit(u, "create", "lead_source", String(r!.id), undefined, { kind: "google", branch, name });
  revalidatePath("/settings/leads");
  return { ok: "Connection added. Copy its webhook address and key into your Google Ads lead form." };
}

export async function removeSource(f: FormData) {
  const id = Number(f.get("id"));
  const src = await q1<{ id: number; branch_id: number; kind: string; external_id: string | null; secret_enc: string | null; name: string }>(
    "select id, branch_id, kind, external_id, secret_enc, name from lead_sources where id=$1 and active", [id]);
  if (!src) return;
  const u = await allowed(src.branch_id);
  if (!u) return;
  if (src.kind === "facebook" && src.external_id && src.secret_enc) {
    // Stop Facebook sending this page's leads; if Facebook can't be reached, the page is still disconnected here.
    await unsubscribePage(src.external_id, open(src.secret_enc)).catch(() => {});
  }
  await q("update lead_sources set active=false, secret_enc=null, url_token_hash=null where id=$1", [id]);
  await audit(u, "delete", "lead_source", String(id), { kind: src.kind, name: src.name, branch: src.branch_id });
  revalidatePath("/settings/leads");
}

export async function connectPages(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const sid = String(f.get("s") ?? "");
  const s = await q1<{ id: string; branch_id: number; pages_enc: string }>(
    "select id, branch_id, pages_enc from meta_connect_sessions where id::text=$1 and user_id=$2 and expires_at > now()", [sid, u.id]);
  if (!s) return { error: "This Facebook sign-in has expired. Go back and connect again." };
  if (!(await allowed(s.branch_id))) return { error: "You can't change this branch's settings." };
  const chosen = new Set(f.getAll("page").map(String));
  if (!chosen.size) return { error: "Tick at least one page." };
  const pages = (JSON.parse(open(s.pages_enc)) as { id: string; name: string; token: string }[]).filter((p) => chosen.has(p.id));
  const taken = await q<{ external_id: string; branch: string }>(
    "select ls.external_id, b.name branch from lead_sources ls join branches b on b.id=ls.branch_id where ls.kind='facebook' and ls.active and ls.external_id = any($1) and ls.branch_id<>$2",
    [pages.map((p) => p.id), s.branch_id]);
  if (taken.length) return { error: `${taken.map((t) => `${pages.find((p) => p.id === t.external_id)?.name} is already connected to ${t.branch}`).join("; ")}. Disconnect it there first.` };
  const done: string[] = [], failed: string[] = [];
  for (const p of pages) {
    try {
      await subscribePage(p.id, p.token);
      await q("update lead_sources set active=false, secret_enc=null where kind='facebook' and active and external_id=$1", [p.id]);
      const r = await q1<{ id: number }>("insert into lead_sources(branch_id,kind,name,external_id,secret_enc,connected_by) values($1,'facebook',$2,$3,$4,$5) returning id",
        [s.branch_id, p.name.slice(0, 150), p.id, seal(p.token), u.id]);
      await audit(u, "create", "lead_source", String(r!.id), undefined, { kind: "facebook", branch: s.branch_id, page: p.name });
      done.push(p.name);
    } catch (e) {
      failed.push(`${p.name} (${e instanceof Error ? e.message : "Facebook refused"})`);
    }
  }
  if (failed.length && !done.length) return { error: `Couldn't connect: ${failed.join("; ")}.` };
  await q("delete from meta_connect_sessions where id=$1", [s.id]);
  redirect(`/settings/leads?branch=${s.branch_id}&connected=${done.length}${failed.length ? `&failed=${encodeURIComponent(failed.join("; ").slice(0, 300))}` : ""}`);
}

export async function retryLead(f: FormData) {
  const ev = await q1<{ id: string; source_id: number; branch_id: number; kind: string; external_lead_id: string; secret_enc: string | null }>(
    `select e.id, e.source_id, e.branch_id, e.kind, e.external_lead_id, s.secret_enc from lead_events e join lead_sources s on s.id=e.source_id
      where e.id=$1 and e.status='error'`, [String(f.get("id"))]);
  if (!ev || ev.kind !== "facebook" || !ev.secret_enc) return;
  const u = await allowed(ev.branch_id);
  if (!u) return;
  const eventId = await claimLead(ev.source_id, ev.branch_id, "facebook", ev.external_lead_id);
  if (!eventId) return;
  try {
    await saveLead(eventId, ev.source_id, ev.branch_id, await fetchLead(ev.external_lead_id, open(ev.secret_enc)));
  } catch (e) {
    await failLead(eventId, ev.source_id, e instanceof Error ? e.message : "Couldn't read this lead from Facebook");
  }
  revalidatePath("/settings/leads");
}
