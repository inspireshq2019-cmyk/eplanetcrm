import "server-only";
import type { CurrentUser } from "./auth";
import { q } from "./db";

const WIDTH = { own: 0, branch: 1, country: 2, all: 3 } as const;

/** Roles this user may give to others: no wider scope than their own and no permission they don't hold. */
export async function assignableRoles(u: CurrentUser) {
  const roles = await q<{ key: string; name: string; scope: keyof typeof WIDTH; permissions: string[]; description: string | null }>("select key, name, scope, permissions, description from roles order by name");
  if (u.scope === "all" && u.permissions.has("settings.system")) return roles;
  return roles.filter((r) => WIDTH[r.scope] <= WIDTH[u.scope] && r.permissions.every((p) => u.permissions.has(p as never)));
}
