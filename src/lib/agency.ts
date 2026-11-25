import "server-only";
import { canSeeBranch, type CurrentUser } from "./auth";
import { q1 } from "./db";

/** A sub-agent agency this person may manage: its home branch must be one of theirs (owners: any). */
export async function agencyFor(u: CurrentUser, id: number) {
  if (!Number.isInteger(id)) return null;
  const a = await q1<{ id: number; home_branch_id: number | null; name: string }>("select id, home_branch_id, name from sub_agents where id=$1", [id]);
  if (!a) return null;
  if (u.scope === "all") return a;
  return a.home_branch_id && canSeeBranch(u, a.home_branch_id) ? a : null;
}
