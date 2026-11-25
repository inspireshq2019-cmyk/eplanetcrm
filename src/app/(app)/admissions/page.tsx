import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { admLabel } from "@/lib/admissions";
import { DESTINATIONS } from "@/lib/lookups";
import { ago, DEST_LABEL } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";

export const metadata = { title: "Admissions queue" };

const TABS = [
  ["new", "New", "a.adm_status='submitted'"],
  ["mine", "Mine", "a.adm_officer_id=$U and a.adm_status in ('submitted','in_review','lodged')"],
  ["checking", "Checking", "a.adm_status='in_review'"],
  ["waiting", "Waiting on branch", "a.adm_status='needs_info'"],
  ["submitted", "Submitted", "a.adm_status='lodged'"],
  ["decided", "Decided", "a.adm_status in ('offer','refused','withdrawn')"],
] as const;

type SP = { tab?: string; dest?: string; branch?: string; agent?: string; q?: string };

/** The central admission team's work: everything branches and sub-agents have sent in. */
export default async function AdmissionsQueue({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("admissions.manage");
  const sp = await searchParams;
  const tab = TABS.find((t) => t[0] === sp.tab) ?? TABS[0];
  const p: unknown[] = [user.id];
  const where = [tab[2].replace("$U", "$1")];
  if (sp.dest) { p.push(sp.dest); where.push(`a.destination=$${p.length}`); }
  if (sp.branch) { p.push(Number(sp.branch) || 0); where.push(`a.branch_id=$${p.length}`); }
  if (sp.agent === "any") where.push("c.sub_agent_id is not null");
  else if (sp.agent === "none") where.push("c.sub_agent_id is null");
  else if (sp.agent) { p.push(Number(sp.agent) || 0); where.push(`c.sub_agent_id=$${p.length}`); }
  if (sp.q) { p.push(`%${sp.q.slice(0, 100)}%`); where.push(`(c.first_name || ' ' || coalesce(c.last_name,'') ilike $${p.length} or a.ref ilike $${p.length} or pa.name ilike $${p.length})`); }

  const [rows, counts, branches, agencies] = await Promise.all([
    q<{ id: string; ref: string; student: string; partner: string | null; course: string | null; destination: string | null; intake: string | null; branch: string; agency: string | null;
        adm_status: string; officer: string | null; sent_at: string | null; updated: string | null; pending_docs: number; unread: number }>(
      `select a.id, a.ref, c.first_name || ' ' || coalesce(c.last_name,'') student, pa.name partner, coalesce(co.title,a.course_title) course, a.destination, a.intake,
              b.name branch, sa.name agency, a.adm_status, o.name officer, a.adm_sent_at sent_at, a.adm_updated_at updated,
              (select count(*)::int from application_checklist ac join checklist_items ci on ci.id=ac.item_id
                where ac.application_id=a.id and ac.status='pending' and ci.required and coalesce(ci.doc_type,'') not in ('offer','coe','cas','pal','oshc')) pending_docs,
              (select count(*)::int from application_messages m left join application_reads r on r.application_id=m.application_id and r.user_id=$1
                where m.application_id=a.id and m.author_id is distinct from $1 and m.kind='message' and m.created_at > coalesce(r.last_read_at,'epoch')) unread
         from applications a join contacts c on c.id=a.contact_id join branches b on b.id=a.branch_id left join sub_agents sa on sa.id=c.sub_agent_id
         left join partners pa on pa.id=a.partner_id left join courses co on co.id=a.course_id left join users o on o.id=a.adm_officer_id
        where ${where.join(" and ")} order by coalesce(a.adm_updated_at, a.adm_sent_at) asc limit 300`, p),
    q1<{ new: number; mine: number; checking: number; waiting: number; submitted: number; decided: number; old: number }>(
      `select count(*) filter (where adm_status='submitted')::int new,
              count(*) filter (where adm_officer_id=$1 and adm_status in ('submitted','in_review','lodged'))::int mine,
              count(*) filter (where adm_status='in_review')::int checking,
              count(*) filter (where adm_status='needs_info')::int waiting,
              count(*) filter (where adm_status='lodged')::int submitted,
              count(*) filter (where adm_status in ('offer','refused','withdrawn'))::int decided,
              count(*) filter (where adm_status in ('submitted','in_review') and adm_updated_at < now() - interval '2 days')::int old
         from applications where adm_status is not null`, [user.id]),
    q<{ id: number; name: string }>("select id, name from branches where active order by name"),
    q<{ id: number; name: string }>("select id, name from sub_agents where active order by name"),
  ]);
  const link = (extra: Partial<SP>) => "/admissions?" + new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Admissions queue" subtitle="Applications from every branch and sub-agent. Oldest first." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New, not picked up" value={counts?.new ?? 0} tone={counts?.new ? "warn" : undefined} href={link({ tab: "new" })} />
        <Stat label="Mine" value={counts?.mine ?? 0} href={link({ tab: "mine" })} />
        <Stat label="Waiting on branch" value={counts?.waiting ?? 0} href={link({ tab: "waiting" })} />
        <Stat label="Untouched for 2+ days" value={counts?.old ?? 0} tone={counts?.old ? "red" : undefined} hint="New or being checked" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">{TABS.map(([k, l]) => (
        <Link key={k} href={link({ tab: k })} className={`btn btn-sm ${tab[0] === k ? "btn-navy" : ""}`}>{l} <span className="tnum opacity-75">{counts?.[k as keyof typeof counts] ?? 0}</span></Link>))}
      </div>
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]" role="search">
        <input type="hidden" name="tab" value={tab[0]} />
        <input className="input" name="q" defaultValue={sp.q} placeholder="Student, A-number or institution" aria-label="Search" />
        <select className="select" name="dest" defaultValue={sp.dest ?? ""} aria-label="Destination"><option value="">All countries</option>{DESTINATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="select" name="branch" defaultValue={sp.branch ?? ""} aria-label="Branch"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="select" name="agent" defaultValue={sp.agent ?? ""} aria-label="Sub-agent"><option value="">Branches and sub-agents</option><option value="none">Branches only</option><option value="any">Any sub-agent</option>{agencies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn btn-navy">Filter</button>
      </form>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Student</th><th>Institution and course</th><th>Intake</th><th>From</th><th>Status</th><th>Officer</th><th>Waiting</th></tr></thead>
            <tbody>{rows.map((r) => {
              const st = admLabel(r.adm_status);
              const since = r.updated ?? r.sent_at;
              const old = since && Date.now() - new Date(since).getTime() > 2 * 864e5 && ["submitted", "in_review"].includes(r.adm_status);
              return (
                <tr key={r.id}>
                  <td><Link className="font-semibold text-navy" href={`/applications/${r.id}`}>{r.student}</Link><div className="text-xs text-slate">{r.ref}{r.unread > 0 && <span className="badge badge-red ml-1">{r.unread} new</span>}</div></td>
                  <td>{r.partner ?? "—"}<div className="text-xs text-slate">{r.course ?? ""}{r.destination ? ` · ${DEST_LABEL[r.destination] ?? r.destination}` : ""}</div></td>
                  <td>{r.intake ?? "—"}</td>
                  <td>{r.branch}{r.agency && <div className="text-xs text-slate">Sub-agent: {r.agency}</div>}</td>
                  <td><span className={`badge ${st?.badge ?? ""}`}>{st?.short}</span>{r.pending_docs > 0 && ["submitted", "in_review"].includes(r.adm_status) && <div className="mt-1 text-xs text-warn">{r.pending_docs} document{r.pending_docs === 1 ? "" : "s"} pending</div>}</td>
                  <td>{r.officer ?? <span className="text-slate">—</span>}</td>
                  <td className={`whitespace-nowrap ${old ? "font-semibold text-red" : "text-slate"}`}>{since ? ago(since) : "—"}</td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title="Nothing here">Applications appear when a branch or sub-agent presses “Send to admissions”.</Empty>}
      </Card>
    </>
  );
}
