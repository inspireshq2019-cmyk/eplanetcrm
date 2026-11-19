/**
 * Lists which fields an edit changed, for the audit log. Values of personal fields are not copied
 * (only the field name is recorded), so the log never becomes a second copy of a student's details.
 */
const KEEP_VALUES = new Set(["stage", "status", "branch_id", "owner_id", "agent_id", "source", "interested_destinations", "interested_level", "intake", "onshore", "subclass", "lodged_on", "decision_on", "visa_expiry"]);

export function auditDiff(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const changed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (k.startsWith("$") || k === "id") continue;
    const old = before?.[k];
    const norm = (x: unknown) => (x === undefined || x === "" ? null : x instanceof Date ? x.toISOString().slice(0, 10) : Array.isArray(x) ? x.join(",") : String(x));
    if (norm(old) === norm(v)) continue;
    changed[k] = KEEP_VALUES.has(k) ? { from: old ?? null, to: v ?? null } : "changed";
  }
  return { changed };
}
