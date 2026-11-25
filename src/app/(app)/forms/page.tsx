import Link from "next/link";
import { requirePermission, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { isOpen } from "@/lib/forms";
import { date } from "@/lib/format";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Event forms" };

export default async function Forms() {
  const u = await requirePermission("forms.manage");
  const params: unknown[] = [];
  const rows = await q<{ id: number; title: string; event_date: string | null; venue: string | null; branch: string; active: boolean; closes_on: string | null; kind: string; n: number; new_leads: number; last: string | null }>(
    `select f.id, f.title, to_char(f.event_date,'YYYY-MM-DD') event_date, f.venue, b.name branch, f.active, to_char(f.closes_on,'YYYY-MM-DD') closes_on, f.kind,
            (select count(*)::int from form_submissions s where s.form_id=f.id) n,
            (select count(*)::int from form_submissions s where s.form_id=f.id and s.status='created') new_leads,
            (select max(created_at) from form_submissions s where s.form_id=f.id) last
       from lead_forms f join branches b on b.id=f.branch_id where ${scopeWhere(u, "f", params)}
      order by coalesce(f.event_date, f.created_at::date) desc, f.id desc limit 200`, params);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Event forms" subtitle="Forms for fairs, seminars, the website and office walk-ins. Students scan a QR code and fill them in on their phone." actions={<Link className="btn btn-primary" href="/forms/new">New form</Link>} />
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Form</th><th>Event date</th><th>Branch</th><th className="text-right">Registrations</th><th className="text-right">New leads</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="font-semibold text-navy" href={`/forms/${r.id}`}>{r.title}</Link>{r.kind === "walk_in" ? <div className="text-xs text-slate">Reception QR: office walk-ins</div> : r.venue && <div className="text-xs text-slate">{r.venue}</div>}</td>
                <td className="whitespace-nowrap">{r.event_date ? date(r.event_date) : "—"}</td>
                <td>{r.branch}</td>
                <td className="tnum text-right">{r.n}</td>
                <td className="tnum text-right">{r.new_leads}</td>
                <td>{isOpen(r, today) ? <span className="badge badge-ok">Open</span> : <span className="badge badge-grey">Closed</span>}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title="No event forms yet" action={<Link className="btn btn-primary" href="/forms/new">Create the first form</Link>}>Make one for your next education fair, seminar or university visit.</Empty>}
      </Card>
    </>
  );
}
