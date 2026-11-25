import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { visibleBranches } from "@/lib/lookups";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { AgencyForm } from "./agency-form";

export const metadata = { title: "Sub-agents" };

export default async function SubAgents() {
  const user = await requirePermission("subagents.manage");
  const branches = await visibleBranches(user);
  const p: unknown[] = [];
  let where = "true";
  if (user.scope !== "all") { p.push(branches.map((b) => b.id)); where = "s.home_branch_id = any($1::int[])"; }
  const [rows, countries] = await Promise.all([
    q<{ id: number; name: string; contact_person: string | null; branch: string | null; logins: number; students: number; open: number; active: boolean }>(
      `select s.id, s.name, s.contact_person, b.name branch, s.active,
              (select count(*)::int from users u where u.sub_agent_id=s.id and u.active) logins,
              (select count(*)::int from contacts c where c.sub_agent_id=s.id) students,
              (select count(*)::int from applications a join contacts c on c.id=a.contact_id where c.sub_agent_id=s.id and a.status='open') open
         from sub_agents s left join branches b on b.id=s.home_branch_id where ${where} order by s.active desc, s.name`, p),
    q<{ code: string; name: string }>("select code, name from countries order by name"),
  ]);
  const noHome = user.scope === "all" ? await q<{ id: number; name: string }>("select id, name from sub_agents where home_branch_id is null order by name") : [];
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Sub-agents" subtitle="Outside agencies that send students to Eplanet. Each has its own logins and sees only its own students." />
      <Card pad={false} className="mb-6">
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Agency</th><th>Home branch</th><th className="text-right">Logins</th><th className="text-right">Students</th><th className="text-right">Open applications</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="font-semibold text-navy" href={`/settings/sub-agents/${r.id}`}>{r.name}</Link>{r.contact_person && <div className="text-xs text-slate">{r.contact_person}</div>}</td>
                <td>{r.branch ?? <span className="badge badge-warn">Not set</span>}</td>
                <td className="tnum text-right">{r.logins}</td><td className="tnum text-right">{r.students}</td><td className="tnum text-right">{r.open}</td>
                <td>{r.active ? <span className="badge badge-ok">Active</span> : <span className="badge badge-grey">Off</span>}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title="No sub-agents yet" />}
      </Card>
      {noHome.length > 0 && <p className="mb-6 text-sm text-slate">Agencies added under Finance without a home branch are listed above as “Not set”. Open each one and choose its home branch before giving it logins.</p>}
      <Card title="Add a sub-agent"><AgencyForm branches={branches} countries={countries} /></Card>
    </>
  );
}
