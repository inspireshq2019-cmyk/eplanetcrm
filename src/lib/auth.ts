import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { q, q1 } from "./db";
import type { Permission } from "../../db/seed-data";
import { agentMayOpen } from "./agent";

export const SESSION_COOKIE = "eplanet_crm";
const SESSION_HOURS = 12;
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "");

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
  roleName: string;
  scope: "all" | "country" | "branch" | "own" | "agent";
  subAgentId: number | null; // set for sub-agent logins: they see only their own agency's students
  permissions: Set<Permission>;
  primaryBranchId: number;
  primaryBranchName: string;
  countryCode: string;
  branchIds: number[]; // every branch this user may see; empty array = all (owner)
  marn: string | null;
};

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

async function readSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

/** The signed-in user, or null. Cached for the length of one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const uid = await readSessionUserId();
  if (!uid) return null;
  const u = await q1<{
    id: string; name: string; email: string; title: string | null; role_key: string; role_name: string; scope: CurrentUser["scope"];
    permissions: string[]; primary_branch_id: number; branch_name: string; country_code: string; marn: string | null; active: boolean; sub_agent_id: number | null;
  }>(
    `select u.id, u.name, u.email, u.title, u.role_key, r.name role_name, r.scope, r.permissions, u.primary_branch_id,
            b.name branch_name, b.country_code, u.marn, u.active, u.sub_agent_id
       from users u join roles r on r.key=u.role_key join branches b on b.id=u.primary_branch_id
      where u.id=$1`, [uid]);
  if (!u || !u.active) return null;
  // A sub-agent login must belong to an active agency; anything else is treated as signed out.
  if (u.scope === "agent" && (!u.sub_agent_id || !(await q1("select 1 from sub_agents where id=$1 and active", [u.sub_agent_id])))) return null;

  let branchIds: number[] = [];
  if (u.scope !== "all") {
    const extra = await q<{ branch_id: number }>("select branch_id from user_branches where user_id=$1", [u.id]);
    const ids = new Set<number>([u.primary_branch_id, ...extra.map((x) => x.branch_id)]);
    if (u.scope === "country") {
      const inCountry = await q<{ id: number }>("select id from branches where country_code=$1", [u.country_code]);
      inCountry.forEach((b) => ids.add(b.id));
    }
    branchIds = [...ids];
  }
  return {
    id: u.id, name: u.name, email: u.email, title: u.title, role: u.role_key, roleName: u.role_name, scope: u.scope,
    permissions: new Set(u.permissions as Permission[]), primaryBranchId: u.primary_branch_id, primaryBranchName: u.branch_name,
    countryCode: u.country_code, branchIds, marn: u.marn, subAgentId: u.scope === "agent" ? u.sub_agent_id : null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.scope === "agent") {
    // Every page and action calls this, so sub-agents are kept to their own pages however they navigate.
    const path = (await headers()).get("x-eplanet-path");
    if (path && !agentMayOpen(path)) redirect("/");
  }
  return u;
}

export function can(u: CurrentUser, p: Permission) {
  return u.permissions.has(p);
}

export async function requirePermission(p: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u, p)) redirect("/?denied=" + encodeURIComponent(p));
  return u;
}

/** True if the user may see records in this branch. */
export function canSeeBranch(u: CurrentUser, branchId: number) {
  if (u.scope === "agent") return false; // sub-agents never get branch-wide access; their records are checked one by one
  return u.scope === "all" || u.branchIds.includes(branchId);
}

/**
 * SQL condition limiting rows to what the user may see.
 * `alias` is the table alias that has branch_id (and owner_id for contacts/applications).
 * Pushes its parameters onto `params` and returns the condition text.
 */
export function scopeWhere(u: CurrentUser, alias: string, params: unknown[], opts: { ownerColumn?: string; agent?: "contact" | "application" } = {}): string {
  if (u.scope === "all") return "true";
  if (u.scope === "agent") {
    // Sub-agents: only their agency's students and those students' applications. Everything else: nothing.
    if (!u.subAgentId || !opts.agent) return "false";
    params.push(u.subAgentId);
    return opts.agent === "contact"
      ? `${alias}.sub_agent_id = $${params.length}`
      : `exists (select 1 from contacts sa_c where sa_c.id = ${alias}.contact_id and sa_c.sub_agent_id = $${params.length})`;
  }
  params.push(u.branchIds);
  let cond = `${alias}.branch_id = any($${params.length}::int[])`;
  if (u.scope === "own" && opts.ownerColumn) {
    params.push(u.id);
    cond += ` and (${alias}.${opts.ownerColumn} = $${params.length} or ${alias}.${opts.ownerColumn} is null)`;
  }
  return cond;
}

export async function audit(user: CurrentUser | null, action: string, entity: string, entityId: string | null, before?: unknown, after?: unknown) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  await q("insert into audit_log(user_id,action,entity,entity_id,before,after,ip) values($1,$2,$3,$4,$5,$6,$7)",
    [user?.id ?? null, action, entity, entityId, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), ip]);
}
