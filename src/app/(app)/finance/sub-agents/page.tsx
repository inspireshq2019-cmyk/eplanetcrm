import { can, requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, TableWrap } from "@/components/ui";
import { addSubAgent } from "../actions";

export const metadata = { title: "Sub-agents" };

export default async function SubAgents() {
  const user = await requirePermission("finance.view");
  const [rows, countries] = await Promise.all([
    q<{ id: number; name: string; contact_person: string | null; email: string | null; phone: string | null; country: string | null; default_share_pct: number | null; owed: string | null }>(
      `select s.id, s.name, s.contact_person, s.email, s.phone, c.name country, s.default_share_pct,
              (select string_agg(t.currency || ' ' || to_char(t.total, 'FM999,999,990.00'), ' · ') from (select i.currency, sum(x.amount) total from income_shares x join invoices i on i.id=x.invoice_id where x.sub_agent_id=s.id and x.status='owed' group by 1) t) owed
         from sub_agents s left join countries c on c.code=s.country_code where s.active order by s.name`),
    q<{ code: string; name: string }>("select code, name from countries order by name"),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/finance", label: "Finance" }} title="Sub-agents" subtitle="Partners who refer students to Eplanet and receive a share of the commission." />
      <Card pad={false} className="mb-6">
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Name</th><th>Contact</th><th>Country</th><th className="text-right">Usual share</th><th className="text-right">Shares owed</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="font-semibold">{r.name}</td>
                <td>{r.contact_person ?? "—"}<div className="text-xs text-slate">{[r.email, r.phone].filter(Boolean).join(" · ")}</div></td>
                <td>{r.country ?? "—"}</td><td className="tnum text-right">{r.default_share_pct !== null ? `${r.default_share_pct}%` : "—"}</td>
                <td className="tnum text-right">{r.owed ?? "—"}</td></tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title="No sub-agents yet" />}
      </Card>
      {can(user, "finance.edit") && (
        <Card title="Add a sub-agent">
          <ActionForm action={addSubAgent} resetOnSuccess className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Agency name *" htmlFor="name"><input className="input" id="name" name="name" required maxLength={150} /></Field>
            <Field label="Contact person" htmlFor="contact_person"><input className="input" id="contact_person" name="contact_person" maxLength={100} /></Field>
            <Field label="Email" htmlFor="email"><input className="input" type="email" id="email" name="email" maxLength={150} /></Field>
            <Field label="Phone" htmlFor="phone"><input className="input" type="tel" id="phone" name="phone" maxLength={30} /></Field>
            <Field label="Country" htmlFor="country_code"><select className="select" id="country_code" name="country_code"><option value="">—</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
            <Field label="Usual share %" htmlFor="default_share_pct"><input className="input tnum" type="number" min="0" max="100" step="0.01" id="default_share_pct" name="default_share_pct" /></Field>
            <div><Submit>Add sub-agent</Submit></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
