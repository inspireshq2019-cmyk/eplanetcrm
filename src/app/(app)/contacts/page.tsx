import Link from "next/link";
import { can, requirePermission, scopeWhere } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { visibleBranches, visibleStaff, DESTINATIONS, SOURCES } from "@/lib/lookups";
import { Card, Empty, Notice, PageHeader, Pager, TableWrap } from "@/components/ui";
import { DEST_LABEL, SOURCE_LABEL, STAGE_LABEL, ago } from "@/lib/format";

export const metadata = { title: "Students & leads" };
const PER = 50;

type SP = { q?: string; stage?: string; branch?: string; owner?: string; dest?: string; source?: string; tag?: string; page?: string; deleted?: string; sort?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("contacts.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const p: unknown[] = [];
  const where = [scopeWhere(user, "c", p, { ownerColumn: "owner_id" })];
  if (sp.q) {
    p.push(`%${sp.q.trim()}%`);
    where.push(`(c.first_name || ' ' || coalesce(c.last_name,'') ilike $${p.length} or c.email ilike $${p.length} or c.phone ilike $${p.length} or c.ref ilike $${p.length} or c.passport_no ilike $${p.length})`);
  }
  if (sp.tag) { p.push(sp.tag); where.push(`$${p.length} = any(c.tags)`); }
  if (sp.stage) { p.push(sp.stage); where.push(`c.stage = $${p.length}`); } else where.push("c.stage <> 'archived'");
  if (sp.branch) { p.push(Number(sp.branch)); where.push(`c.branch_id = $${p.length}`); }
  if (sp.owner === "none") where.push("c.owner_id is null");
  else if (sp.owner) { p.push(sp.owner); where.push(`c.owner_id = $${p.length}`); }
  if (sp.dest) { p.push(sp.dest); where.push(`$${p.length} = any(c.interested_destinations)`); }
  if (sp.source) { p.push(sp.source); where.push(`c.source = $${p.length}`); }
  const w = where.join(" and ");

  const total = (await q1<{ n: number }>(`select count(*) n from contacts c where ${w}`, p))?.n ?? 0;
  const rows = await q<{ id: string; ref: string; name: string; phone: string | null; email: string | null; stage: string; source: string | null; dests: string[]; owner: string | null; branch: string; updated_at: string; apps: number }>(
    `select c.id, c.ref, c.first_name || ' ' || coalesce(c.last_name,'') name, c.phone, c.email, c.stage, c.source, c.interested_destinations dests,
            u.name owner, b.name branch, c.updated_at, (select count(*) from applications a where a.contact_id=c.id) apps
       from contacts c join branches b on b.id=c.branch_id left join users u on u.id=c.owner_id
      where ${w} order by ${sp.sort === "new" ? "c.created_at" : "c.updated_at"} desc limit ${PER} offset ${(page - 1) * PER}`, p);

  const [branches, staff] = await Promise.all([visibleBranches(user), visibleStaff(user)]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "deleted") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Students & leads"
        subtitle={`${total.toLocaleString()} ${sp.stage === "archived" ? "archived" : "active"} record${total === 1 ? "" : "s"}${user.scope === "own" ? " assigned to you or unassigned" : ""}`}
        actions={<>
          {can(user, "contacts.export") && <a className="btn" href={`/api/export/contacts?${qs}`}>Export CSV</a>}
          {can(user, "contacts.create") && <Link className="btn btn-primary" href="/contacts/new">Add a lead</Link>}
        </>}
      />
      {sp.deleted && <div className="mb-4"><Notice tone="ok">The record was deleted.</Notice></div>}

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]" role="search">
        <input className="input" name="q" defaultValue={sp.q} placeholder="Name, phone, email, passport or C-number" aria-label="Search" />
        <select className="select" name="stage" defaultValue={sp.stage ?? ""} aria-label="Status">
          <option value="">Active (not archived)</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {branches.length > 1 ? (
          <select className="select" name="branch" defaultValue={sp.branch ?? ""} aria-label="Branch">
            <option value="">All my branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : <span className="hidden lg:block" />}
        <select className="select" name="owner" defaultValue={sp.owner ?? ""} aria-label="Counsellor">
          <option value="">Any counsellor</option>
          <option value="none">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select" name="dest" defaultValue={sp.dest ?? ""} aria-label="Destination">
          <option value="">Any country</option>
          {DESTINATIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" name="source" defaultValue={sp.source ?? ""} aria-label="Source">
          <option value="">Any source</option>
          {SOURCES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="agentcis">Imported from Agentcis</option>
        </select>
        <div className="flex gap-2"><button className="btn btn-navy">Filter</button>{qs && <Link className="btn" href="/contacts">Clear</Link>}</div>
      </form>

      <Card pad={false}>
        {rows.length ? (
          <>
            <TableWrap>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Wants</th><th>Source</th><th>Counsellor</th>{branches.length > 1 && <th>Branch</th>}<th>Apps</th><th>Updated</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/contacts/${r.id}`}>{r.name}</Link><div className="text-xs text-slate">{r.ref}</div></td>
                      <td className="tnum">{r.phone ?? "—"}<div className="text-xs text-slate break-all">{r.email}</div></td>
                      <td><span className={`badge ${r.stage === "client" ? "badge-ok" : r.stage === "lead" ? "badge-warn" : r.stage === "archived" ? "badge-grey" : ""}`}>{STAGE_LABEL[r.stage]}</span></td>
                      <td>{r.dests.map((d) => DEST_LABEL[d] ?? d).join(", ") || "—"}</td>
                      <td>{SOURCE_LABEL[r.source ?? ""] ?? r.source ?? "—"}</td>
                      <td>{r.owner ?? <span className="badge badge-red">Unassigned</span>}</td>
                      {branches.length > 1 && <td>{r.branch}</td>}
                      <td className="tnum">{r.apps || "—"}</td>
                      <td className="whitespace-nowrap text-slate">{ago(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pager page={page} pages={Math.ceil(total / PER)} base={`/contacts?${qs}`} />
          </>
        ) : (
          <Empty title={qs ? "Nothing matches those filters" : "No students or leads yet"} action={!qs && can(user, "contacts.create") ? <Link href="/contacts/new" className="btn btn-primary">Add a lead</Link> : undefined}>
            {qs ? "Try a shorter search or clear the filters." : "Add leads by hand, from the office check-in, or import them from Agentcis in Settings."}
          </Empty>
        )}
      </Card>
    </>
  );
}
