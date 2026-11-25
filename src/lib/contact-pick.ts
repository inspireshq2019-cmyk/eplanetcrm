import "server-only";
import { scopeWhere, type CurrentUser } from "./auth";
import { q, q1 } from "./db";

/** Recent students the user can see, for "type a name or C-number" pickers. */
export async function contactOptions(u: CurrentUser, limit = 400) {
  const p: unknown[] = [];
  return q<{ ref: string; name: string; phone: string | null }>(
    `select c.ref, c.first_name || ' ' || coalesce(c.last_name,'') name, c.phone from contacts c
      where ${scopeWhere(u, "c", p, { ownerColumn: "owner_id", agent: "contact" })} and c.stage <> 'archived' order by c.updated_at desc limit ${limit}`, p);
}

/** Resolves "C-1001", "C-1001 · Name" or a phone number to a contact the user may see. */
export async function resolveContact(u: CurrentUser, raw: string) {
  const ref = raw.match(/C-\d+/i)?.[0]?.toUpperCase();
  const p: unknown[] = [];
  const scope = scopeWhere(u, "c", p, { ownerColumn: "owner_id", agent: "contact" });
  if (ref) { p.push(ref); return q1<{ id: string; branch_id: number }>(`select c.id, c.branch_id from contacts c where ${scope} and c.ref=$${p.length}`, p); }
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length >= 8) { p.push(`%${digits.slice(-9)}`); return q1<{ id: string; branch_id: number }>(`select c.id, c.branch_id from contacts c where ${scope} and c.phone like $${p.length} limit 1`, p); }
  const name = raw.trim();
  if (name.length >= 3) {
    // A typed name only counts if it matches exactly one student the user can see.
    p.push(name);
    const hits = await q<{ id: string; branch_id: number }>(`select c.id, c.branch_id from contacts c where ${scope} and lower(c.first_name || ' ' || coalesce(c.last_name,'')) = lower($${p.length}) limit 2`, p);
    return hits.length === 1 ? hits[0] : null;
  }
  return null;
}
