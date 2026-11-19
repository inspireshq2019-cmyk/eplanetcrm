import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { Card, Empty, PageHeader, Pager, TableWrap } from "@/components/ui";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };
const PER = 100;
const ACTIONS = ["create", "update", "delete", "void", "login", "export", "download", "view_sensitive"];

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; user?: string; page?: string }> }) {
  const user = await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const p: unknown[] = [];
  const where: string[] = ["true"];
  // Non-owners see activity by staff in their own branches only.
  if (user.scope !== "all") { p.push(user.branchIds); where.push(`(u.primary_branch_id = any($${p.length}::int[]))`); }
  if (sp.action && ACTIONS.includes(sp.action)) { p.push(sp.action); where.push(`l.action=$${p.length}`); }
  if (sp.entity) { p.push(sp.entity); where.push(`l.entity=$${p.length}`); }
  if (sp.user) { p.push(`%${sp.user}%`); where.push(`u.name ilike $${p.length}`); }
  const [rows, entities] = await Promise.all([
    q<{ id: number; at: string; who: string | null; action: string; entity: string; entity_id: string | null; ip: string | null; after: unknown; n: number }>(
      `select l.id, l.at, u.name who, l.action, l.entity, l.entity_id, l.ip, l.after, count(*) over() n
         from audit_log l left join users u on u.id=l.user_id where ${where.join(" and ")} order by l.at desc limit ${PER} offset ${(page - 1) * PER}`, p),
    q<{ entity: string }>("select distinct entity from audit_log order by 1"),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Audit log" subtitle="Kept permanently. Nobody can edit or delete entries from the CRM." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select className="select !w-auto" name="action" defaultValue={sp.action ?? ""} aria-label="Action"><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}</select>
        <select className="select !w-auto" name="entity" defaultValue={sp.entity ?? ""} aria-label="Record type"><option value="">All records</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity.replace("_", " ")}</option>)}</select>
        <input className="input !w-auto" name="user" defaultValue={sp.user} placeholder="Staff name" aria-label="Staff name" />
        <button className="btn">Filter</button>
      </form>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-sm">{dateTime(r.at)}</td><td>{r.who ?? "System"}</td>
                <td><span className={`badge ${r.action === "delete" || r.action === "void" ? "badge-red" : r.action === "view_sensitive" || r.action === "export" ? "badge-warn" : "badge-grey"}`}>{r.action.replace("_", " ")}</span></td>
                <td className="text-sm">{r.entity.replace("_", " ")}{r.entity_id && <div className="tnum text-xs text-slate">{r.entity_id.slice(0, 13)}</div>}</td>
                <td className="max-w-80 truncate text-xs text-slate" title={r.after ? JSON.stringify(r.after) : ""}>{r.after ? JSON.stringify(r.after).slice(0, 120) : ""}</td>
                <td className="tnum text-xs">{r.ip ?? ""}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title="Nothing logged yet" />}
      </Card>
      <Pager page={page} pages={Math.ceil((rows[0]?.n ?? 0) / PER)} base={`/settings/audit?${qs}`} />
    </>
  );
}
