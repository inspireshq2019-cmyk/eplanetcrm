import Link from "next/link";
import { can, requirePermission, scopeWhere } from "@/lib/auth";
import { AgentApplications } from "../_agent/lists";
import { ADM_STATUS, admLabel } from "@/lib/admissions";
import { q, q1 } from "@/lib/db";
import { visibleBranches, visibleStaff, DESTINATIONS } from "@/lib/lookups";
import { Card, Empty, PageHeader, Pager, TableWrap } from "@/components/ui";
import { CHANNEL_LABEL, DEST_LABEL, ago } from "@/lib/format";

export const metadata = { title: "Applications" };
const PER = 50;

type SP = { adm?: string; q?: string; dest?: string; status?: string; branch?: string; owner?: string; channel?: string; stage?: string; partner?: string; page?: string; view?: string };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("contacts.view");
  const sp = await searchParams;
  if (user.scope === "agent") return <AgentApplications user={user} adm={sp.adm} />;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status ?? "open";

  const p: unknown[] = [];
  const where = [scopeWhere(user, "a", p, { ownerColumn: "owner_id", agent: "application" })];
  if (status !== "all") { p.push(status); where.push(`a.status=$${p.length}`); }
  if (sp.dest) { p.push(sp.dest); where.push(`a.destination=$${p.length}`); }
  if (sp.branch) { p.push(Number(sp.branch)); where.push(`a.branch_id=$${p.length}`); }
  if (sp.owner) { p.push(sp.owner); where.push(`a.owner_id=$${p.length}`); }
  if (sp.channel) { p.push(sp.channel); where.push(`a.channel=$${p.length}`); }
  if (sp.partner) { p.push(Number(sp.partner) || 0); where.push(`a.partner_id=$${p.length}`); }
  if (sp.stage) { p.push(sp.stage); where.push(`s.name=$${p.length}`); }
  if (sp.adm === "unsent") where.push("a.adm_status is null");
  else if (sp.adm && sp.adm in ADM_STATUS) { p.push(sp.adm); where.push(`a.adm_status=$${p.length}`); }
  if (sp.q) { p.push(`%${sp.q}%`); where.push(`(c.first_name || ' ' || coalesce(c.last_name,'') ilike $${p.length} or a.ref ilike $${p.length} or pa.name ilike $${p.length} or coalesce(co.title,a.course_title) ilike $${p.length})`); }
  const from = `from applications a join contacts c on c.id=a.contact_id join workflow_stages s on s.id=a.stage_id left join partners pa on pa.id=a.partner_id
                left join courses co on co.id=a.course_id left join users u on u.id=a.owner_id join branches b on b.id=a.branch_id`;
  const w = where.join(" and ");
  const total = (await q1<{ n: number }>(`select count(*) n ${from} where ${w}`, p))?.n ?? 0;
  const rows = await q<{ id: string; ref: string; contact_id: string; student: string; partner: string | null; course: string | null; destination: string | null; intake: string | null; stage: string; status: string; channel: string; owner: string | null; branch: string; updated_at: string; onshore_transfer: boolean; adm_status: string | null; agency: string | null }>(
    `select a.id, a.ref, a.contact_id, c.first_name || ' ' || coalesce(c.last_name,'') student, pa.name partner, coalesce(co.title,a.course_title) course, a.destination,
            a.intake, s.name stage, a.status, a.channel, u.name owner, b.name branch, a.updated_at, a.onshore_transfer, a.adm_status,
            (select name from sub_agents where id=c.sub_agent_id) agency
       ${from} where ${w} order by a.updated_at desc limit ${PER} offset ${(page - 1) * PER}`, p);

  // Board counts per step for the chosen destination
  const p2: unknown[] = [];
  const board = sp.dest ? await q<{ name: string; position: number; n: number }>(
    `select s.name, s.position, count(a.id) n from workflow_stages s join workflows wf on wf.id=s.workflow_id and wf.destination=$1
       left join applications a on a.stage_id=s.id and a.status='open' and ${scopeWhere(user, "a", (p2.push(sp.dest), p2), { ownerColumn: "owner_id", agent: "application" })}
      where s.outcome is null group by 1,2 order by 2`, p2) : [];

  const [branches, staff] = await Promise.all([visibleBranches(user), visibleStaff(user)]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();
  const link = (extra: Record<string, string | undefined>) => "/applications?" + new URLSearchParams(Object.entries({ ...sp, page: undefined, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Applications" subtitle={`${total.toLocaleString()} ${status === "all" ? "" : status === "won" ? "enrolled" : status === "lost" ? "closed" : "in progress"} application${total === 1 ? "" : "s"}`}
        actions={<>{can(user, "applications.edit") && <Link className="btn btn-primary" href="/applications/new">Start application</Link>}<a className="btn" href={`/api/export/applications?${qs}`}>Export CSV</a></>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {[["", "All countries"], ...DESTINATIONS].map(([k, l]) => (
          <Link key={k} href={link({ dest: k || undefined, stage: undefined })} className={`btn btn-sm ${(sp.dest ?? "") === k ? "btn-navy" : ""}`}>{l}</Link>))}
      </div>

      {board.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {board.map((s) => (
              <Link key={s.name} href={link({ stage: sp.stage === s.name ? undefined : s.name })} className={`card w-36 shrink-0 p-3 no-underline ${sp.stage === s.name ? "!border-navy ring-2 ring-navy/15" : ""}`}>
                <p className="text-[11.5px] font-semibold leading-tight text-slate">{s.name}</p>
                <p className="mt-1 font-display text-xl font-bold text-navy tnum">{s.n}</p>
              </Link>))}
          </div>
        </div>
      )}

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]" role="search">
        {sp.dest && <input type="hidden" name="dest" value={sp.dest} />}
        <input className="input" name="q" defaultValue={sp.q} placeholder="Student, A-number, institution or course" aria-label="Search" />
        <select className="select" name="status" defaultValue={status} aria-label="Status"><option value="open">In progress</option><option value="won">Enrolled</option><option value="lost">Withdrawn / refused</option><option value="all">All</option></select>
        {branches.length > 1 ? <select className="select" name="branch" defaultValue={sp.branch ?? ""} aria-label="Branch"><option value="">All my branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select> : <span className="hidden lg:block" />}
        <select className="select" name="owner" defaultValue={sp.owner ?? ""} aria-label="Counsellor"><option value="">Any counsellor</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="select" name="adm" defaultValue={sp.adm ?? ""} aria-label="Admissions status"><option value="">Any admissions status</option><option value="unsent">Not sent yet</option>{Object.entries(ADM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select>
        <button className="btn btn-navy">Filter</button>
      </form>

      <Card pad={false}>
        {rows.length ? (
          <>
            <TableWrap><table className="tbl">
              <thead><tr><th>Ref</th><th>Student</th><th>Institution and course</th><th>Intake</th><th>Step</th><th>Admissions</th><th>Counsellor</th>{branches.length > 1 && <th>Branch</th>}<th>Updated</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/applications/${r.id}`}>{r.ref}</Link><div className="text-xs text-slate">{DEST_LABEL[r.destination ?? ""] ?? r.destination}</div></td>
                  <td><Link href={`/contacts/${r.contact_id}`} className="!font-medium">{r.student}</Link>{r.agency && <div className="text-xs text-slate">Sub-agent: {r.agency}</div>}</td>
                  <td>{r.partner ?? "—"}<div className="text-xs text-slate">{r.course}</div>{r.onshore_transfer && <span className="badge badge-warn mt-1">Onshore transfer</span>}</td>
                  <td>{r.intake ?? "—"}</td>
                  <td><span className={`badge ${r.status === "won" ? "badge-ok" : r.status === "lost" ? "badge-grey" : ""}`}>{r.stage}</span></td>
                  <td><span className={`badge ${admLabel(r.adm_status)?.badge ?? "badge-grey"}`}>{admLabel(r.adm_status)?.short ?? "Not sent"}</span></td>
                  <td>{r.owner ?? "—"}</td>
                  {branches.length > 1 && <td>{r.branch}</td>}
                  <td className="whitespace-nowrap text-slate">{ago(r.updated_at)}</td>
                </tr>))}</tbody>
            </table></TableWrap>
            <Pager page={page} pages={Math.ceil(total / PER)} base={`/applications?${qs}`} />
          </>
        ) : <Empty title="No applications match">Start an application from a student's page.</Empty>}
      </Card>
    </>
  );
}
