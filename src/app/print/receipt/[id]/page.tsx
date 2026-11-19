import { notFound } from "next/navigation";
import { z } from "zod";
import { audit, canSeeBranch, requirePermission } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { date, METHOD_LABEL, money2 } from "@/lib/format";
import { PrintDoc } from "../../doc";

export const metadata = { title: "Receipt" };

export default async function PrintReceipt({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const r = await q1<{ id: string; receipt_no: string; received_on: string; amount: number; currency: string; method: string; reference: string; branch_id: number; b_name: string; b_address: string | null; b_phone: string | null; b_email: string | null;
    number: string; total: number; paid: number; payer: string | null; contact_ref: string | null; staff: string | null; kind: string }>(
    `select p.id, p.receipt_no, p.received_on, p.amount, p.currency, p.method, p.reference, p.branch_id, b.name b_name, b.address b_address, b.phone b_phone, b.email b_email,
            i.number, i.total, i.paid, i.kind, case when i.kind like 'commission%' then pa.name else coalesce(c.first_name || ' ' || coalesce(c.last_name,''), pa.name) end payer, c.ref contact_ref, u.name staff
       from payments p join invoices i on i.id=p.invoice_id join branches b on b.id=p.branch_id left join contacts c on c.id=i.contact_id left join partners pa on pa.id=i.partner_id left join users u on u.id=p.received_by
      where p.id=$1`, [id]);
  if (!r || !canSeeBranch(user, r.branch_id)) notFound();
  await audit(user, "export", "receipt", r.id);
  return (
    <PrintDoc title="Payment receipt" number={r.receipt_no} branch={{ name: r.b_name, address: r.b_address, phone: r.b_phone, email: r.b_email }}>
      <p className="mb-6 text-sm">Received with thanks from <strong>{r.payer ?? "—"}</strong>{r.kind === "client" && r.contact_ref ? ` (student no. ${r.contact_ref})` : ""}:</p>
      <p className="tnum mb-8 font-display text-3xl font-bold text-navy">{money2(r.amount, r.currency)}</p>
      <dl className="grid max-w-md grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate">Date received</dt><dd>{date(r.received_on)}</dd>
        <dt className="text-slate">Paid by</dt><dd>{METHOD_LABEL[r.method] ?? r.method}</dd>
        <dt className="text-slate">Transaction ref.</dt><dd className="tnum">{r.reference}</dd>
        <dt className="text-slate">Against invoice</dt><dd className="tnum">{r.number}</dd>
        <dt className="text-slate">Invoice total</dt><dd className="tnum">{money2(r.total, r.currency)}</dd>
        <dt className="text-slate">Invoice balance today</dt><dd className="tnum">{money2(r.total - r.paid, r.currency)}</dd>
        <dt className="text-slate">Received by</dt><dd>{r.staff ?? "—"}</dd>
      </dl>
    </PrintDoc>
  );
}
