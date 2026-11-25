import "server-only";
import type { CurrentUser } from "./auth";
import { q } from "./db";

const WIDTH = { agent: 0, own: 0, branch: 1, country: 2, all: 3 } as const;

/** Staff roles this user may give to others: no wider scope than their own and no permission they don't hold.
 *  Sub-agent logins are managed separately (Settings › Sub-agents), so agency roles are never offered here. */
export async function assignableRoles(u: CurrentUser) {
  const roles = (await q<{ key: string; name: string; scope: keyof typeof WIDTH; permissions: string[]; description: string | null }>("select key, name, scope, permissions, description from roles order by name"))
    .filter((r) => r.scope !== "agent");
  if (u.scope === "all" && u.permissions.has("settings.system")) return roles;
  return roles.filter((r) => WIDTH[r.scope] <= WIDTH[u.scope] && r.permissions.every((p) => u.permissions.has(p as never)));
}
