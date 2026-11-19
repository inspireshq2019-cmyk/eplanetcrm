import Link from "next/link";
import { can, requirePermission, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { DESTINATIONS } from "@/lib/lookups";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { DEST_LABEL, VISA_STATUS_LABEL, date, daysUntil } from "@/lib/format";

export const metadata = { title: "Visa cases" };

export default async function VisaList({ searchParams }: { searchParams: Promise<{ status?: string; dest?: string; agent?: string; expiring?: string }> }) {
  const user = await requirePermission("visa.view");
  const sp = await searchParams;
  const p: unknown[] = [];
  const where = [scopeWhere(user, "v", p)];
  if (sp.expiring) where.push("v.status='granted' and v.visa_expiry between current_date and current_date + 90");
  else if (sp.status === "closed") where.push("v.status in ('granted','refused','withdrawn')");
  else if (sp.status) { p.push(sp.status); where.push(`v.status=$${p.length}`); }
  else where.push("v.status in ('preparing','lodged','further_info')");
  if (sp.dest) { p.push(sp.dest); where.push(`v.destination=$${p.length}`); }
  if (sp.agent === "me") { p.push(user.id); where.push(`v.agent_id=$${p.length}`); }
  const rows = await q<{ id: string; ref: string; contact_id: string; student: string; destination: string; subclass: string | null; status: string; lodged_on: string | null; decision_on: string | null; visa_expiry: string | null; agent: string | null; marn: string | null; branch: string }>(
    `select v.id, v.ref, v.contact_id, c.first_name || ' ' || coalesce(c.last_name,'') student, v.destination, v.subclass, v.status, v.lodged_on, v.decision_on,
            v.visa_expiry, u.name agent, u.marn, b.name branch
       from visa_cases v join contacts c on c.id=v.contact_id join branches b on b.id=v.branch_id left join users u on u.id=v.agent_id
      where ${where.join(" and ")} order by v.updated_at desc limit 300`, p);
  const tab = (label: string, params: Record<string, string>) => {
    const href = "/visa?" + new URLSearchParams(params).toString();
    const active = JSON.stringify(params) === JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([k]) => k !== "dest")));
    return <Link key={label} href={href} className={`btn btn-sm ${active ? "btn-navy" : ""}`}>{label}</Link>;
  };
  return (
    <>
      <PageHeader title="Visa cases" subtitle="Australian cases must be handled by a registered migration agent with a current MARN."
        actions={can(user, "visa.edit") ? <Link className="btn btn-primary" href="/visa/new">Open visa case</Link> : null} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tab("Open", {})}{tab("Lodged", { status: "lodged" })}{tab("Further info", { status: "further_info" })}{tab("Closed", { status: "closed" })}{tab("Expiring in 90 days", { expiring: "1" })}
        {user.marn && tab("My cases", { agent: "me" })}
        <form className="ml-auto flex gap-2">
          {Object.entries(sp).filter(([k]) => k !== "dest").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select className="select !min-h-0 !py-1.5" name="dest" defaultValue={sp.dest ?? ""} aria-label="Country"><option value="">Any country</option>{DESTINATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="btn btn-sm">Filter</button>
        </form>
      </div>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Ref</th><th>Student</th><th>Visa</th><th>Status</th><th>Lodged</th><th>Decision</th><th>Visa expiry</th><th>Agent (MARN)</th><th>Branch</th></tr></thead>
            <tbody>{rows.map((v) => {
              const exp = daysUntil(v.visa_expiry);
              return (
                <tr key={v.id}>
                  <td><Link href={`/visa/${v.id}`}>{v.ref}</Link></td>
                  <td><Link href={`/contacts/${v.contact_id}`} className="!font-medium">{v.student}</Link></td>
                  <td>{DEST_LABEL[v.destination] ?? v.destination} {v.subclass}</td>
                  <td><span className={`badge ${v.status === "granted" ? "badge-ok" : v.status === "refused" ? "badge-red" : v.status === "further_info" ? "badge-warn" : ""}`}>{VISA_STATUS_LABEL[v.status]}</span></td>
                  <td>{date(v.lodged_on)}</td><td>{date(v.decision_on)}</td>
                  <td>{v.visa_expiry ? <span className={exp !== null && exp < 90 ? "font-semibold text-warn" : ""}>{date(v.visa_expiry)}</span> : "—"}</td>
                  <td>{v.agent ?? <span className="badge badge-red">No agent</span>}{v.marn && <div className="text-xs text-slate">MARN {v.marn}</div>}</td>
                  <td>{v.branch}</td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title="No visa cases here">Open a visa case from a student's page or with the button above.</Empty>}
      </Card>
    </>
  );
}
