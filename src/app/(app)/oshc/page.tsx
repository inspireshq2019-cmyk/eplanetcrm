import Link from "next/link";
import { requirePermission, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { contactOptions } from "@/lib/contact-pick";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, Stat, TableWrap } from "@/components/ui";
import { date, daysUntil, money } from "@/lib/format";
import { createPolicy, updatePolicy } from "./actions";

export const metadata = { title: "OSHC" };

export default async function Oshc({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requirePermission("oshc.manage");
  const sp = await searchParams;
  const p: unknown[] = [];
  const where = [scopeWhere(user, "o", p)];
  if (sp.show === "expiring") where.push("o.status in ('purchased','active') and o.end_date between current_date and current_date + 60");
  else if (sp.show !== "all") where.push("o.status in ('quoted','purchased','active')");
  const [rows, insurers, options] = await Promise.all([
    q<{ id: string; contact_id: string; student: string; insurer: string | null; policy_no: string | null; cover_type: string; start_date: string | null; end_date: string | null; premium: number | null; commission: number | null; status: string; branch: string }>(
      `select o.id, o.contact_id, c.first_name || ' ' || coalesce(c.last_name,'') student, pa.name insurer, o.policy_no, o.cover_type, o.start_date, o.end_date,
              o.premium, o.commission, o.status, b.name branch
         from oshc_policies o join contacts c on c.id=o.contact_id join branches b on b.id=o.branch_id left join partners pa on pa.id=o.insurer_id
        where ${where.join(" and ")} order by o.end_date nulls last limit 300`, p),
    q<{ id: number; name: string }>("select id, name from partners where kind='insurer' and active order by name"),
    contactOptions(user),
  ]);
  const p2: unknown[] = [];
  const totals = (await q<{ sold: number; premium: number; commission: number }>(
    `select count(*) filter (where o.status in ('purchased','active')) sold, coalesce(sum(o.premium) filter (where o.status in ('purchased','active')),0) premium,
            coalesce(sum(o.commission) filter (where o.status in ('purchased','active')),0) commission
       from oshc_policies o where ${scopeWhere(user, "o", p2)} and o.created_at >= date_trunc('year', now())`, p2))[0];
  return (
    <>
      <PageHeader title="OSHC" subtitle="Overseas Student Health Cover sold to students going to Australia."
        actions={<><Link className={`btn btn-sm ${!sp.show ? "btn-navy" : ""}`} href="/oshc">Current</Link><Link className={`btn btn-sm ${sp.show === "expiring" ? "btn-navy" : ""}`} href="/oshc?show=expiring">Ending in 60 days</Link><Link className={`btn btn-sm ${sp.show === "all" ? "btn-navy" : ""}`} href="/oshc?show=all">All</Link></>} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Policies sold this year" value={totals.sold} />
        <Stat label="Premiums this year" value={money(totals.premium, "AUD")} />
        <Stat label="Commission this year" value={money(totals.commission, "AUD")} tone="ok" />
      </div>
      <Card pad={false} className="mb-6">
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Student</th><th>Insurer and policy</th><th>Cover</th><th>Dates</th><th>Premium</th><th>Commission</th><th>Status</th></tr></thead>
            <tbody>{rows.map((o) => {
              const left = daysUntil(o.end_date);
              return (
                <tr key={o.id}>
                  <td><Link href={`/contacts/${o.contact_id}`}>{o.student}</Link><div className="text-xs text-slate">{o.branch}</div></td>
                  <td>{o.insurer ?? "—"}<div className="text-xs text-slate tnum">{o.policy_no ?? "No policy number yet"}</div></td>
                  <td className="capitalize">{o.cover_type.replace("_", " ")}</td>
                  <td className="whitespace-nowrap">{date(o.start_date)} – {date(o.end_date)}{left !== null && left >= 0 && left <= 60 && <div><span className="badge badge-warn">{left} days left</span></div>}</td>
                  <td className="tnum">{money(o.premium, "AUD")}</td><td className="tnum">{money(o.commission, "AUD")}</td>
                  <td>
                    <form action={updatePolicy} className="flex gap-1">
                      <input type="hidden" name="id" value={o.id} />
                      <select className="select !min-h-0 !py-1 !text-xs" name="status" defaultValue={o.status} aria-label="Status">{["quoted", "purchased", "active", "cancelled", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
                      <button className="btn btn-sm">Set</button>
                    </form>
                  </td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title="No OSHC policies here" />}
      </Card>
      <Card title="Record OSHC">
        <ActionForm action={createPolicy} resetOnSuccess className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Student *" htmlFor="contact" className="sm:col-span-2">
            <input className="input" id="contact" name="contact" list="contact-list" required placeholder="Type a name or C-number" autoComplete="off" />
            <datalist id="contact-list">{options.map((o) => <option key={o.ref} value={`${o.ref} · ${o.name}`} />)}</datalist>
          </Field>
          <Field label="Insurer" htmlFor="insurer_id"><select className="select" id="insurer_id" name="insurer_id">{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
          <Field label="Cover" htmlFor="cover_type"><select className="select" id="cover_type" name="cover_type"><option value="single">Single</option><option value="couple">Couple</option><option value="single_parent">Single parent</option><option value="family">Family</option></select></Field>
          <Field label="Cover starts" htmlFor="start_date"><input className="input" type="date" id="start_date" name="start_date" /></Field>
          <Field label="Cover ends" htmlFor="end_date"><input className="input" type="date" id="end_date" name="end_date" /></Field>
          <Field label="Premium (AUD)" htmlFor="premium"><input className="input tnum" type="number" min="0" step="0.01" id="premium" name="premium" /></Field>
          <Field label="Our commission (AUD)" htmlFor="commission"><input className="input tnum" type="number" min="0" step="0.01" id="commission" name="commission" /></Field>
          <Field label="Policy number" htmlFor="policy_no"><input className="input tnum" id="policy_no" name="policy_no" /></Field>
          <Field label="Status" htmlFor="status"><select className="select" id="status" name="status"><option value="quoted">Quoted</option><option value="purchased">Purchased</option><option value="active">Active</option></select></Field>
          <div className="self-end"><Submit>Save</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
