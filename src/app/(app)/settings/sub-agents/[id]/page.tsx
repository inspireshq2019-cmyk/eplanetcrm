import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { agencyFor } from "@/lib/agency";
import { q, q1 } from "@/lib/db";
import { visibleBranches } from "@/lib/lookups";
import { ago } from "@/lib/format";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, Stat, TableWrap } from "@/components/ui";
import { AgencyForm, type AgencyRow } from "../agency-form";
import { addLogin, setLoginActive } from "../actions";

export const metadata = { title: "Sub-agent" };

export default async function Agency({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("subagents.manage");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id) || !(await agencyFor(user, Number(id)))) notFound();
  const [agency, logins, stats, branches, countries] = await Promise.all([
    q1<AgencyRow & { branch: string | null }>("select s.*, b.name branch from sub_agents s left join branches b on b.id=s.home_branch_id where s.id=$1", [Number(id)]),
    q<{ id: string; name: string; email: string; title: string | null; active: boolean; last_login_at: string | null }>(
      "select id, name, email, title, active, last_login_at from users where sub_agent_id=$1 order by active desc, name", [Number(id)]),
    q1<{ students: number; open: number; action: number; offers: number }>(
      `select (select count(*)::int from contacts where sub_agent_id=$1) students,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=$1 and a.status='open') open,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=$1 and a.adm_status='needs_info') action,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=$1 and a.adm_status='offer') offers`, [Number(id)]),
    visibleBranches(user),
    q<{ code: string; name: string }>("select code, name from countries order by name"),
  ]);
  if (!agency) notFound();
  return (
    <>
      <PageHeader back={{ href: "/settings/sub-agents", label: "Sub-agents" }} title={agency.name} subtitle={`Home branch: ${agency.branch ?? "not set"}${agency.active ? "" : " · switched off"}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Students" value={stats?.students ?? 0} />
        <Stat label="Open applications" value={stats?.open ?? 0} />
        <Stat label="Waiting on the agency" value={stats?.action ?? 0} tone={stats?.action ? "warn" : undefined} />
        <Stat label="Offers" value={stats?.offers ?? 0} tone="ok" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Logins" pad={false}>
          {logins.length ? (
            <TableWrap><table className="tbl">
              <thead><tr><th>Person</th><th>Last sign-in</th><th></th></tr></thead>
              <tbody>{logins.map((l) => (
                <tr key={l.id} className={l.active ? "" : "opacity-60"}>
                  <td className="font-semibold">{l.name}<div className="text-xs font-normal text-slate">{l.email}{l.title ? ` · ${l.title}` : ""}</div></td>
                  <td>{l.last_login_at ? ago(l.last_login_at) : "Never"}</td>
                  <td className="text-right"><form action={setLoginActive}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="active" value={l.active ? "0" : "1"} /><button className="btn btn-sm">{l.active ? "Switch off" : "Switch on"}</button></form></td>
                </tr>))}</tbody>
            </table></TableWrap>
          ) : <Empty title="No logins yet" />}
          <div className="border-t border-line p-5">
            <ActionForm action={addLogin} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="sub_agent_id" value={agency.id} />
              <Field label="Name *" htmlFor="l_name"><input className="input" id="l_name" name="name" required maxLength={100} /></Field>
              <Field label="Email *" htmlFor="l_email" hint="Sign-in codes are sent here."><input className="input" type="email" id="l_email" name="email" required maxLength={150} /></Field>
              <Field label="Job title" htmlFor="l_title"><input className="input" id="l_title" name="title" maxLength={100} /></Field>
              <div className="flex items-end"><Submit className="btn">Add login</Submit></div>
            </ActionForm>
          </div>
        </Card>
        <Card title="Agency details"><AgencyForm agency={agency} branches={branches} countries={countries} /></Card>
      </div>
    </>
  );
}
