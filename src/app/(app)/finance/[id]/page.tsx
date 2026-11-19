import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { Card, Dl, Empty, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { date, INVOICE_KIND_LABEL as KIND_LABEL, INVOICE_STATUS_BADGE as STATUS_BADGE, INVOICE_STATUS_LABEL as STATUS_LABEL, METHOD_LABEL, money2 } from "@/lib/format";
import { addIncomeShare, markSharePaid, recordPayment, voidInvoice } from "../actions";

export const metadata = { title: "Invoice" };


export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const inv = await q1<{ id: string; number: string; kind: string; branch_id: number; branch: string; contact_id: string | null; student: string | null; contact_ref: string | null; partner: string | null;
    application_id: string | null; app_ref: string | null; issue_date: string; due_date: string | null; currency: string; subtotal: number; tax: number; total: number; paid: number; status: string; notes: string | null; created_by: string | null }>(
    `select i.*, b.name branch, c.first_name || ' ' || coalesce(c.last_name,'') student, c.ref contact_ref, p.name partner, a.ref app_ref, u.name created_by
       from invoices i join branches b on b.id=i.branch_id left join contacts c on c.id=i.contact_id left join partners p on p.id=i.partner_id
       left join applications a on a.id=i.application_id left join users u on u.id=i.created_by where i.id=$1`, [id]);
  if (!inv || !canSeeBranch(user, inv.branch_id)) notFound();
  const [lines, payments, shares, agents, branches] = await Promise.all([
    q<{ id: number; description: string; quantity: number; unit_price: number; commission_pct: number | null; amount: number }>("select * from invoice_lines where invoice_id=$1 order by id", [id]),
    q<{ id: string; receipt_no: string; received_on: string; amount: number; method: string; reference: string; by: string | null }>(
      "select p.id, p.receipt_no, p.received_on, p.amount, p.method, p.reference, u.name by from payments p left join users u on u.id=p.received_by where p.invoice_id=$1 order by p.created_at", [id]),
    q<{ id: number; who: string; share_pct: number; amount: number; status: string; paid_on: string | null }>(
      "select s.id, coalesce(sa.name, b.name || ' branch') who, s.share_pct, s.amount, s.status, s.paid_on from income_shares s left join sub_agents sa on sa.id=s.sub_agent_id left join branches b on b.id=s.branch_id where s.invoice_id=$1 order by s.id", [id]),
    q<{ id: number; name: string }>("select id, name from sub_agents where active order by name"),
    q<{ id: number; name: string }>("select id, name from branches where active and id<>$1 order by name", [inv.branch_id]),
  ]);
  const due = Math.round((inv.total - inv.paid) * 100) / 100;
  const edit = can(user, "finance.edit") && inv.status !== "void";
  const isCommission = inv.kind.startsWith("commission");
  const shareTotal = shares.reduce((s, x) => s + Number(x.share_pct), 0);

  return (
    <>
      <PageHeader back={{ href: "/finance", label: "Finance" }} title={inv.number}
        subtitle={<>{KIND_LABEL[inv.kind]} · {inv.branch} · <span className={`badge ${STATUS_BADGE[inv.status]}`}>{STATUS_LABEL[inv.status]}</span></>}
        actions={<a className="btn" href={`/print/invoice/${inv.id}`} target="_blank" rel="noopener">Print or save PDF</a>} />
      {inv.status === "void" && <div className="mb-4"><Notice tone="red">This invoice is void. It stays on record and its number is not reused.</Notice></div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <Card title="Details">
            <Dl rows={[
              ["Billed to", isCommission || (!inv.student && inv.partner) ? inv.partner ?? "—" : inv.student ? <Link href={`/contacts/${inv.contact_id}`}>{inv.student} ({inv.contact_ref})</Link> : "—"],
              ...(isCommission && inv.student ? [["Student", <Link key="s" href={`/contacts/${inv.contact_id}`}>{inv.student} ({inv.contact_ref})</Link>] as [string, React.ReactNode]] : []),
              ...(inv.app_ref ? [["Application", <Link key="a" href={`/applications/${inv.application_id}`}>{inv.app_ref}</Link>] as [string, React.ReactNode]] : []),
              ["Issued", date(inv.issue_date)], ["Due", date(inv.due_date)], ["Created by", inv.created_by ?? "—"],
              ...(inv.notes ? [["Notes", <span key="n" className="whitespace-pre-line">{inv.notes}</span>] as [string, React.ReactNode]] : []),
            ]} />
          </Card>
          <Card title="Lines" pad={false}>
            <TableWrap><table className="tbl">
              <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}><td>{l.description}{l.commission_pct !== null && <div className="text-xs text-slate">{l.commission_pct}% of {money2(l.unit_price, inv.currency)}</div>}</td>
                    <td className="tnum text-right">{l.commission_pct !== null ? "—" : l.quantity}</td><td className="tnum text-right">{money2(l.unit_price, inv.currency)}</td><td className="tnum text-right">{money2(l.amount, inv.currency)}</td></tr>))}
                <tr><td colSpan={3} className="text-right">Subtotal</td><td className="tnum text-right">{money2(inv.subtotal, inv.currency)}</td></tr>
                {inv.tax > 0 && <tr><td colSpan={3} className="text-right">Tax</td><td className="tnum text-right">{money2(inv.tax, inv.currency)}</td></tr>}
                <tr className="font-semibold"><td colSpan={3} className="text-right">Total</td><td className="tnum text-right">{money2(inv.total, inv.currency)}</td></tr>
                <tr><td colSpan={3} className="text-right">Paid</td><td className="tnum text-right">{money2(inv.paid, inv.currency)}</td></tr>
                <tr className="font-semibold"><td colSpan={3} className="text-right">Balance due</td><td className={`tnum text-right ${due > 0 && inv.status !== "void" ? "text-red" : ""}`}>{money2(due, inv.currency)}</td></tr>
              </tbody>
            </table></TableWrap>
          </Card>
          <Card title="Payments received" pad={false}>
            {payments.length ? (
              <TableWrap><table className="tbl">
                <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th></th></tr></thead>
                <tbody>{payments.map((p) => (
                  <tr key={p.id}><td className="tnum">{p.receipt_no}</td><td>{date(p.received_on)}</td><td>{METHOD_LABEL[p.method] ?? p.method}</td><td className="tnum">{p.reference}</td>
                    <td className="tnum text-right">{money2(p.amount, inv.currency)}</td><td><a className="text-navy text-sm" href={`/print/receipt/${p.id}`} target="_blank" rel="noopener">Receipt</a></td></tr>))}</tbody>
              </table></TableWrap>
            ) : <Empty title="No payments yet" />}
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          {edit && due > 0 && (
            <Card title="Record a payment">
              <ActionForm action={recordPayment} resetOnSuccess className="grid gap-3">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <Field label={`Amount (${inv.currency}) *`} htmlFor="amount"><input className="input tnum" id="amount" name="amount" type="number" min="0.01" step="0.01" max={due} defaultValue={due} required /></Field>
                <Field label="Paid by *" htmlFor="method" hint="Cash is not accepted in any Eplanet branch.">
                  <select className="select" id="method" name="method" required defaultValue=""><option value="" disabled>Choose…</option>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </Field>
                <Field label="Transaction reference *" htmlFor="reference" hint="Bank, card or wallet transaction ID, or cheque number."><input className="input tnum" id="reference" name="reference" required maxLength={100} autoComplete="off" /></Field>
                <Field label="Received on" htmlFor="received_on"><input className="input" type="date" id="received_on" name="received_on" /></Field>
                <Submit>Record payment</Submit>
              </ActionForm>
            </Card>
          )}
          {isCommission && (
            <Card title="Commission shares">
              <p className="mb-3 text-sm text-slate">Part of this commission owed to a sub-agent or to another branch that referred the student.</p>
              {shares.length > 0 && (
                <ul className="mb-4 divide-y divide-line text-sm">{shares.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{s.who}<span className="block text-xs text-slate">{s.share_pct}% · {money2(s.amount, inv.currency)}</span></span>
                    {s.status === "paid" ? <span className="badge badge-ok">Paid {date(s.paid_on)}</span>
                      : edit ? <form action={markSharePaid}><input type="hidden" name="share_id" value={s.id} /><ConfirmButton>Mark paid</ConfirmButton></form> : <span className="badge badge-warn">Owed</span>}
                  </li>))}</ul>
              )}
              {edit && shareTotal < 100 && (
                <ActionForm action={addIncomeShare} resetOnSuccess className="grid gap-3">
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <Field label="Share with" htmlFor="target">
                    <select className="select" id="target" name="target" required defaultValue=""><option value="" disabled>Choose…</option>
                      {agents.length > 0 && <optgroup label="Sub-agents">{agents.map((a) => <option key={a.id} value={`agent:${a.id}`}>{a.name}</option>)}</optgroup>}
                      <optgroup label="Branches">{branches.map((b) => <option key={b.id} value={`branch:${b.id}`}>{b.name}</option>)}</optgroup>
                    </select>
                  </Field>
                  <Field label="Share %" htmlFor="share_pct"><input className="input tnum" id="share_pct" name="share_pct" type="number" min="0.01" max={100 - shareTotal} step="0.01" required /></Field>
                  <Submit className="btn">Add share</Submit>
                </ActionForm>
              )}
              <p className="mt-3 text-xs text-slate"><Link className="text-navy" href="/finance/sub-agents">Manage sub-agents</Link></p>
            </Card>
          )}
          {can(user, "finance.void") && inv.status !== "void" && inv.paid === 0 && (
            <Card title="Void invoice">
              <form action={voidInvoice} className="grid gap-3">
                <input type="hidden" name="id" value={inv.id} />
                <Field label="Reason" htmlFor="reason"><input className="input" id="reason" name="reason" required maxLength={200} /></Field>
                <ConfirmButton className="btn btn-sm">Void this invoice</ConfirmButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
