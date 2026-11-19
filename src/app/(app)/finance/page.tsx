import Link from "next/link";
import { can, requirePermission, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { Card, Empty, PageHeader, Pager, Stat, TableWrap } from "@/components/ui";
import { date, daysUntil, INVOICE_KIND_LABEL, INVOICE_STATUS_BADGE, INVOICE_STATUS_LABEL, METHOD_LABEL, money2 } from "@/lib/format";

export const metadata = { title: "Invoices & receipts" };
const PER = 40;

export default async function Finance({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string; q?: string; page?: string }> }) {
  const user = await requirePermission("finance.view");
  const sp = await searchParams;
  const tab = sp.tab === "payments" ? "payments" : "invoices";
  const page = Math.max(1, Number(sp.page) || 1);

  // Totals per currency for the current month, within the user's scope.
  const pt: unknown[] = [];
  const totals = await q<{ currency: string; invoiced: number; received: number; outstanding: number; overdue: number; commission_due: number }>(
    `select i.currency,
            coalesce(sum(i.total) filter (where i.issue_date >= date_trunc('month', current_date)),0) invoiced,
            coalesce((select sum(p.amount) from payments p where p.currency=i.currency and p.received_on >= date_trunc('month', current_date) and ${scopeWhere(user, "p", pt)}),0) received,
            coalesce(sum(i.total - i.paid) filter (where i.status in ('sent','part_paid')),0) outstanding,
            coalesce(sum(i.total - i.paid) filter (where i.status in ('sent','part_paid') and i.due_date < current_date),0) overdue,
            coalesce(sum(i.total - i.paid) filter (where i.status in ('sent','part_paid') and i.kind like 'commission%'),0) commission_due
       from invoices i where ${scopeWhere(user, "i", pt)} and i.status <> 'void' group by i.currency order by outstanding desc`, pt);

  const p: unknown[] = [];
  const where = [scopeWhere(user, "i", p)];
  if (sp.kind === "commission") where.push("i.kind like 'commission%'");
  else if (sp.kind === "client") where.push("i.kind = 'client'");
  else if (sp.kind === "unpaid") where.push("i.status in ('sent','part_paid')");
  else if (sp.kind === "overdue") where.push("i.status in ('sent','part_paid') and i.due_date < current_date");
  if (sp.q) { p.push(`%${sp.q.trim()}%`); where.push(`(i.number ilike $${p.length} or c.first_name || ' ' || coalesce(c.last_name,'') ilike $${p.length} or c.ref ilike $${p.length} or pa.name ilike $${p.length})`); }

  const invoices = tab === "invoices" ? await q<{ id: string; number: string; kind: string; issue_date: string; due_date: string | null; currency: string; total: number; paid: number; status: string; who: string | null; branch: string; n: number }>(
    `select i.id, i.number, i.kind, i.issue_date, i.due_date, i.currency, i.total, i.paid, i.status, b.name branch,
            case when i.kind like 'commission%' then pa.name else coalesce(c.first_name || ' ' || coalesce(c.last_name,''), pa.name) end who, count(*) over() n
       from invoices i join branches b on b.id=i.branch_id left join contacts c on c.id=i.contact_id left join partners pa on pa.id=i.partner_id
      where ${where.join(" and ")} order by i.created_at desc limit ${PER} offset ${(page - 1) * PER}`, p) : [];

  const pp: unknown[] = [];
  const payments = tab === "payments" ? await q<{ id: string; receipt_no: string; received_on: string; amount: number; currency: string; method: string; reference: string; invoice_id: string; number: string; branch: string; n: number }>(
    `select p.id, p.receipt_no, p.received_on, p.amount, p.currency, p.method, p.reference, p.invoice_id, i.number, b.name branch, count(*) over() n
       from payments p join invoices i on i.id=p.invoice_id join branches b on b.id=p.branch_id
      where ${scopeWhere(user, "p", pp)} order by p.created_at desc limit ${PER} offset ${(page - 1) * PER}`, pp) : [];
  const total = (tab === "invoices" ? invoices[0]?.n : payments[0]?.n) ?? 0;
  const qs = (o: Record<string, string | undefined>) => "/finance?" + new URLSearchParams(Object.entries({ tab, kind: sp.kind, q: sp.q, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Invoices & receipts" subtitle="Every payment is by bank, card or mobile wallet with a transaction reference. No cash."
        actions={<>{can(user, "finance.edit") && <Link className="btn btn-primary" href="/finance/new">New invoice</Link>}<Link className="btn" href="/finance/sub-agents">Sub-agents</Link></>} />
      {totals.length > 0 && (
        <div className="mb-6 grid gap-3">
          {totals.map((t) => (
            <div key={t.currency} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label={`Invoiced this month (${t.currency})`} value={money2(t.invoiced, t.currency)} />
              <Stat label="Received this month" value={money2(t.received, t.currency)} tone="ok" />
              <Stat label="Outstanding" value={money2(t.outstanding, t.currency)} href={qs({ kind: "unpaid", page: undefined })} />
              <Stat label="Overdue" value={money2(t.overdue, t.currency)} tone={t.overdue > 0 ? "red" : undefined} href={qs({ kind: "overdue", page: undefined })} />
              <Stat label="Commission to collect" value={money2(t.commission_due, t.currency)} href={qs({ kind: "commission", page: undefined })} />
            </div>))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className={`btn btn-sm ${tab === "invoices" ? "btn-navy" : ""}`} href="/finance">Invoices</Link>
        <Link className={`btn btn-sm ${tab === "payments" ? "btn-navy" : ""}`} href="/finance?tab=payments">Receipts</Link>
        {tab === "invoices" && (
          <>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            {[["", "All"], ["unpaid", "Unpaid"], ["overdue", "Overdue"], ["client", "Students"], ["commission", "Commission"]].map(([k, l]) => (
              <Link key={k} className={`btn btn-sm ${(sp.kind ?? "") === k ? "btn-navy" : ""}`} href={qs({ kind: k || undefined, page: undefined })}>{l}</Link>))}
            <form className="ml-auto flex gap-2"><input type="hidden" name="kind" value={sp.kind ?? ""} /><input className="input !py-1.5" name="q" defaultValue={sp.q} placeholder="Number, student or institution" aria-label="Search invoices" /><button className="btn btn-sm">Search</button></form>
          </>
        )}
      </div>
      <Card pad={false}>
        {tab === "invoices" ? (invoices.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Number</th><th>Billed to</th><th>Type</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
            <tbody>{invoices.map((i) => {
              const bal = i.total - i.paid, late = i.status !== "paid" && i.status !== "void" && (daysUntil(i.due_date) ?? 0) < 0;
              return (
                <tr key={i.id}>
                  <td><Link className="tnum" href={`/finance/${i.id}`}>{i.number}</Link><div className="text-xs text-slate">{i.branch}</div></td>
                  <td>{i.who ?? "—"}</td><td>{INVOICE_KIND_LABEL[i.kind]}</td><td>{date(i.issue_date)}</td>
                  <td className={late ? "font-semibold text-red" : ""}>{date(i.due_date)}</td>
                  <td className="tnum text-right">{money2(i.total, i.currency)}</td><td className="tnum text-right">{i.status === "void" ? "—" : money2(bal, i.currency)}</td>
                  <td><span className={`badge ${late ? "badge-red" : INVOICE_STATUS_BADGE[i.status]}`}>{late ? "Overdue" : INVOICE_STATUS_LABEL[i.status]}</span></td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title="No invoices here">Create one from a student or an application, or with “New invoice”.</Empty>)
          : payments.length ? (
            <TableWrap><table className="tbl">
              <thead><tr><th>Receipt</th><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th></th></tr></thead>
              <tbody>{payments.map((r) => (
                <tr key={r.id}><td className="tnum">{r.receipt_no}<div className="text-xs text-slate">{r.branch}</div></td><td>{date(r.received_on)}</td>
                  <td><Link className="tnum" href={`/finance/${r.invoice_id}`}>{r.number}</Link></td><td>{METHOD_LABEL[r.method] ?? r.method}</td><td className="tnum">{r.reference}</td>
                  <td className="tnum text-right">{money2(r.amount, r.currency)}</td><td><a className="text-sm text-navy" href={`/print/receipt/${r.id}`} target="_blank" rel="noopener">Print</a></td></tr>))}</tbody>
            </table></TableWrap>
          ) : <Empty title="No payments recorded yet" />}
      </Card>
      <Pager page={page} pages={Math.ceil(total / PER)} base={qs({ page: undefined })} />
    </>
  );
}
