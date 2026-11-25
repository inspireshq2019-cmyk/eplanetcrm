import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { admLabel } from "@/lib/admissions";
import { ago, DEST_LABEL } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";

/** A sub-agent's home page: what needs their action and the latest news from admissions. */
export async function AgentHome({ user }: { user: CurrentUser }) {
  const id = user.subAgentId;
  const [agency, counts, action, updates] = await Promise.all([
    q1<{ name: string; branch: string; branch_phone: string | null; branch_email: string | null }>(
      "select s.name, b.name branch, b.phone branch_phone, b.email branch_email from sub_agents s join branches b on b.id=s.home_branch_id where s.id=$1", [id]),
    q1<{ students: number; open: number; action: number; offers: number }>(
      `select (select count(*)::int from contacts where sub_agent_id=$1) students,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=$1 and a.status='open') open,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=$1 and a.adm_status='needs_info') action,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=$1 and a.adm_status='offer') offers`, [id]),
    q<{ id: string; ref: string; student: string; partner: string | null; request: string | null; updated: string | null }>(
      `select a.id, a.ref, c.first_name || ' ' || coalesce(c.last_name,'') student, p.name partner, a.adm_request request, a.adm_updated_at updated
         from applications a join contacts c on c.id=a.contact_id left join partners p on p.id=a.partner_id
        where c.sub_agent_id=$1 and (a.adm_status='needs_info' or (a.adm_status is null and a.status='open')) order by a.adm_status is null, a.adm_updated_at desc limit 20`, [id]),
    q<{ application_id: string; ref: string; student: string; body: string; created_at: string; adm_status: string | null }>(
      `select m.application_id, a.ref, c.first_name || ' ' || coalesce(c.last_name,'') student, m.body, m.created_at, a.adm_status
         from application_messages m join applications a on a.id=m.application_id join contacts c on c.id=a.contact_id
        where c.sub_agent_id=$1 and not m.internal and m.author_id is distinct from $2 order by m.created_at desc limit 10`, [id, user.id]),
  ]);
  return (
    <>
      <PageHeader title={agency?.name ?? "Your agency"} subtitle={`Working with Eplanet International ${agency?.branch ?? ""}`}
        actions={<><Link className="btn btn-primary" href="/contacts/new">Add a student</Link><Link className="btn" href="/applications/new">Start an application</Link></>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Your students" value={counts?.students ?? 0} href="/contacts" />
        <Stat label="Applications in progress" value={counts?.open ?? 0} href="/applications" />
        <Stat label="Need your action" value={counts?.action ?? 0} tone={counts?.action ? "red" : undefined} href="/applications?adm=needs_info" />
        <Stat label="Offers" value={counts?.offers ?? 0} tone="ok" href="/applications?adm=offer" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="To do" pad={false}>
          {action.length ? (
            <TableWrap><table className="tbl">
              <thead><tr><th>Application</th><th>What's needed</th></tr></thead>
              <tbody>{action.map((a) => (
                <tr key={a.id}>
                  <td><Link className="font-semibold text-navy" href={`/applications/${a.id}`}>{a.student}</Link><div className="text-xs text-slate">{a.ref} · {a.partner ?? "—"}</div></td>
                  <td>{a.request ? <span className="text-red-dark">{a.request}</span> : <span className="text-slate">Not sent to admissions yet. Add the documents, then send it.</span>}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          ) : <Empty title="Nothing waiting on you">Applications that need documents or a reply will show here.</Empty>}
        </Card>
        <Card title="Latest from admissions" pad={false}>
          {updates.length ? (
            <ol className="divide-y divide-line">{updates.map((m, i) => (
              <li key={i} className="px-5 py-3 text-sm">
                <p className="flex flex-wrap justify-between gap-2 text-xs text-slate"><Link className="font-semibold text-navy" href={`/applications/${m.application_id}`}>{m.student} · {m.ref}</Link><span>{ago(m.created_at)}</span></p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{m.body}</p>
                {admLabel(m.adm_status) && <span className={`badge mt-1 ${admLabel(m.adm_status)!.badge}`}>{admLabel(m.adm_status)!.short}</span>}
              </li>))}</ol>
          ) : <Empty title="No updates yet" />}
        </Card>
      </div>
      {agency && (agency.branch_phone || agency.branch_email) && (
        <p className="mt-6 text-sm text-slate">Your Eplanet branch: {agency.branch}{agency.branch_phone ? ` · ${agency.branch_phone}` : ""}{agency.branch_email ? ` · ${agency.branch_email}` : ""}</p>
      )}
    </>
  );
}
