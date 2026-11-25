import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { ADM_STATUS, admLabel } from "@/lib/admissions";
import { ago, DEST_LABEL } from "@/lib/format";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";

/** A sub-agent's students: only their own agency's. */
export async function AgentStudents({ user, search }: { user: CurrentUser; search?: string }) {
  const p: unknown[] = [user.subAgentId];
  let where = "c.sub_agent_id=$1";
  if (search) { p.push(`%${search}%`); where += ` and (c.first_name || ' ' || coalesce(c.last_name,'') ilike $2 or c.ref ilike $2 or c.phone ilike $2 or c.email ilike $2)`; }
  const rows = await q<{ id: string; ref: string; name: string; phone: string | null; email: string | null; dests: string[]; apps: number; created_at: string }>(
    `select c.id, c.ref, c.first_name || ' ' || coalesce(c.last_name,'') name, c.phone, c.email, c.interested_destinations dests,
            (select count(*)::int from applications a where a.contact_id=c.id) apps, c.created_at
       from contacts c where ${where} order by c.created_at desc limit 300`, p);
  return (
    <>
      <PageHeader title="My students" subtitle={`${rows.length} student${rows.length === 1 ? "" : "s"} you've registered with Eplanet`} actions={<Link className="btn btn-primary" href="/contacts/new">Add a student</Link>} />
      <form className="mb-4 flex gap-2"><input className="input max-w-sm" name="q" defaultValue={search} placeholder="Search name, mobile or email" aria-label="Search" /><button className="btn">Search</button></form>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Student</th><th>Contact</th><th>Interested in</th><th className="text-right">Applications</th><th>Added</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="font-semibold text-navy" href={`/contacts/${r.id}`}>{r.name}</Link><div className="text-xs text-slate">{r.ref}</div></td>
                <td className="text-sm">{r.phone ?? ""}<div className="text-xs text-slate">{r.email ?? ""}</div></td>
                <td>{r.dests.map((d) => DEST_LABEL[d] ?? d).join(", ") || "—"}</td>
                <td className="tnum text-right">{r.apps}</td>
                <td className="whitespace-nowrap">{ago(r.created_at)}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title={search ? "No students match" : "No students yet"} action={<Link className="btn btn-primary" href="/contacts/new">Add your first student</Link>} />}
      </Card>
    </>
  );
}

/** A sub-agent's applications, with where each one is with admissions. */
export async function AgentApplications({ user, adm }: { user: CurrentUser; adm?: string }) {
  const p: unknown[] = [user.subAgentId, user.id];
  let where = "c.sub_agent_id=$1";
  if (adm === "unsent") where += " and a.adm_status is null";
  else if (adm && adm in ADM_STATUS) { p.push(adm); where += ` and a.adm_status=$${p.length}`; }
  const rows = await q<{ id: string; ref: string; student: string; partner: string | null; course: string | null; destination: string | null; intake: string | null; adm_status: string | null; stage: string; updated_at: string; unread: number }>(
    `select a.id, a.ref, c.first_name || ' ' || coalesce(c.last_name,'') student, pa.name partner, coalesce(co.title,a.course_title) course, a.destination, a.intake,
            a.adm_status, s.name stage, a.updated_at,
            (select count(*)::int from application_messages m left join application_reads r on r.application_id=m.application_id and r.user_id=$2
              where m.application_id=a.id and not m.internal and m.author_id is distinct from $2 and m.created_at > coalesce(r.last_read_at,'epoch')) unread
       from applications a join contacts c on c.id=a.contact_id join workflow_stages s on s.id=a.stage_id left join partners pa on pa.id=a.partner_id left join courses co on co.id=a.course_id
      where ${where} order by (a.adm_status='needs_info') desc, a.updated_at desc limit 300`, p);
  const tabs: [string, string][] = [["", "All"], ["unsent", "Not sent yet"], ["needs_info", "Action needed"], ["submitted", "Waiting"], ["lodged", "Submitted"], ["offer", "Offers"]];
  return (
    <>
      <PageHeader title="Applications" subtitle="Where each application is with the Eplanet admission team." actions={<Link className="btn btn-primary" href="/applications/new">Start an application</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map(([k, l]) => <Link key={k} className={`btn btn-sm ${(adm ?? "") === k ? "btn-navy" : ""}`} href={k ? `/applications?adm=${k}` : "/applications"}>{l}</Link>)}</div>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Student</th><th>Institution and course</th><th>Intake</th><th>With admissions</th><th>Step</th><th>Updated</th></tr></thead>
            <tbody>{rows.map((r) => {
              const st = admLabel(r.adm_status);
              return (
                <tr key={r.id}>
                  <td><Link className="font-semibold text-navy" href={`/applications/${r.id}`}>{r.student}</Link><div className="text-xs text-slate">{r.ref}</div></td>
                  <td>{r.partner ?? "—"}<div className="text-xs text-slate">{r.course ?? ""}{r.destination ? ` · ${DEST_LABEL[r.destination] ?? r.destination}` : ""}</div></td>
                  <td>{r.intake ?? "—"}</td>
                  <td><span className={`badge ${st?.badge ?? "badge-grey"}`}>{st?.short ?? "Not sent"}</span>{r.unread > 0 && <span className="badge badge-red ml-1">{r.unread} new</span>}</td>
                  <td className="text-sm">{r.stage}</td>
                  <td className="whitespace-nowrap">{ago(r.updated_at)}</td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title="No applications here" />}
      </Card>
    </>
  );
}
