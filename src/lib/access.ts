import "server-only";
import { z } from "zod";
import { canSeeBranch, type CurrentUser } from "./auth";
import { q1 } from "./db";

/** Returns the contact if this user may see it (branch scope, and own-records-only for counsellors), else null. */
export async function loadContactForUser(u: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const c = await q1<{ id: string; branch_id: number; owner_id: string | null }>("select id, branch_id, owner_id from contacts where id=$1", [id]);
  if (!c || !canSeeBranch(u, c.branch_id)) return null;
  if (u.scope === "own" && c.owner_id && c.owner_id !== u.id) return null;
  return c;
}

/** Same check for an application, via its branch and owner. */
export async function loadApplicationForUser(u: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const a = await q1<{ id: string; branch_id: number; owner_id: string | null; contact_id: string; workflow_id: number; stage_id: number }>(
    "select id, branch_id, owner_id, contact_id, workflow_id, stage_id from applications where id=$1", [id]);
  if (!a || !canSeeBranch(u, a.branch_id)) return null;
  if (u.scope === "own" && a.owner_id && a.owner_id !== u.id) return null;
  return a;
}
