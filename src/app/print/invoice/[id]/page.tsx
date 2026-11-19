import { notFound } from "next/navigation";
import { z } from "zod";
import { audit, canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { date, INVOICE_KIND_LABEL, money2 } from "@/lib/format";
import { PrintDoc } from "../../doc";

export const metadata = { title: "Invoice" };

export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("finance.view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const inv = await q1<{ id: string; number: string; kind: string; branch_id: number; b_name: string; b_address: string | null; b_phone: string | null; b_email: string | null; student: string | null; contact_ref: string | null;
    partner: string | null; app_ref: string | null; course_title: string | null; issue_date: string; due_date: string | null; currency: string; subtotal: number; tax: number; total: number; paid: number; status: string; notes: string | null }>(
    `select i.*, b.name b_name, b.address b_address, b.phone b_phone, b.email b_email, c.first_name || ' ' || coalesce(c.last_name,'') student, c.ref contact_ref,
            p.name partner, a.ref app_ref, a.course_title
       from invoices i join branches b on b.id=i.branch_id left join contacts c on c.id=i.contact_id left join partners p on p.id=i.partner_id left join applications a on a.id=i.application_id
      where i.id=$1`, [id]);
  if (!inv || !canSeeBranch(user, inv.branch_id)) notFound();
  const lines = await q<{ id: number; description: string; quantity: number; unit_price: number; commission_pct: number | null; amount: number }>("select * from invoice_lines where invoice_id=$1 order by id", [id]);
  await audit(user, "export", "invoice", inv.id);
  const commission = inv.kind.startsWith("commission");
  return (
    <PrintDoc title={inv.status === "void" ? "Invoice (void)" : commission ? "Commission invoice" : "Invoice"} number={inv.number} branch={{ name: inv.b_name, address: inv.b_address, phone: inv.b_phone, email: inv.b_email }}>
      <div className="mb-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-slate">Bill to</p>
          <p className="mt-1 font-semibold">{commission ? inv.partner : inv.student ?? inv.partner ?? "—"}</p>
          {!commission && inv.contact_ref && <p className="text-slate">Student no. {inv.contact_ref}</p>}
          {commission && inv.student && <p className="text-slate">Student: {inv.student}{inv.course_title ? ` — ${inv.course_title}` : ""}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:text-right">
          <dt className="text-slate">Type</dt><dd>{INVOICE_KIND_LABEL[inv.kind]}</dd>
          <dt className="text-slate">Issued</dt><dd>{date(inv.issue_date)}</dd>
          {inv.due_date && <><dt className="text-slate">Due</dt><dd>{date(inv.due_date)}</dd></>}
          {inv.app_ref && <><dt className="text-slate">Our reference</dt><dd className="tnum">{inv.app_ref}</dd></>}
        </dl>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-ink text-left"><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-line align-top">
              <td className="py-2 pr-4">{l.description}{l.commission_pct !== null && <div className="text-xs text-slate">{l.commission_pct}% of {money2(l.unit_price, inv.currency)}</div>}</td>
              <td className="tnum py-2 text-right">{l.commission_pct !== null ? "—" : l.quantity}</td>
              <td className="tnum py-2 text-right">{money2(l.unit_price, inv.currency)}</td>
              <td className="tnum py-2 text-right">{money2(l.amount, inv.currency)}</td>
            </tr>))}
        </tbody>
        <tfoot className="text-right">
          <tr><td colSpan={3} className="pt-3">Subtotal</td><td className="tnum pt-3">{money2(inv.subtotal, inv.currency)}</td></tr>
          {inv.tax > 0 && <tr><td colSpan={3}>Tax</td><td className="tnum">{money2(inv.tax, inv.currency)}</td></tr>}
          <tr className="text-base font-bold"><td colSpan={3} className="pt-2">Total</td><td className="tnum pt-2">{money2(inv.total, inv.currency)}</td></tr>
          {inv.paid > 0 && <><tr><td colSpan={3}>Paid</td><td className="tnum">{money2(inv.paid, inv.currency)}</td></tr>
            <tr className="font-semibold"><td colSpan={3}>Balance due</td><td className="tnum">{money2(inv.total - inv.paid, inv.currency)}</td></tr></>}
        </tfoot>
      </table>
      {inv.notes && <p className="mt-8 whitespace-pre-line text-sm">{inv.notes}</p>}
    </PrintDoc>
  );
}
