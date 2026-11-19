"use client";

import { useMemo, useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { createInvoice } from "../actions";

type Line = { desc: string; qty: string; price: string; pct: string };
type Props = {
  kind: string;
  contact: { id: string; name: string; ref: string } | null;
  application: { id: string; ref: string; label: string; tuition: number | null; feeCurrency: string | null; partnerId: number | null; pct: number | null; commissionBlocked: boolean } | null;
  branches: { id: number; name: string; currency: string }[];
  defaultBranch: number;
  partners: { id: number; name: string }[];
};

const CURRENCIES = ["BDT", "NPR", "INR", "AUD", "GBP", "CAD", "USD", "NZD", "EUR", "LKR", "PHP"];
const KINDS: [string, string, string][] = [
  ["client", "Student invoice", "Service fee, IELTS class, application or visa fee charged to the student."],
  ["commission_gross", "Commission claim (gross)", "Claim to an institution: full commission, the institution pays us."],
  ["commission_net", "Commission claim (net)", "We collected full tuition and keep our commission; the invoice shows the net amount sent on."],
  ["general", "Other invoice", "Anything else, e.g. a sub-agent or a corporate client."],
];

export function InvoiceForm({ kind: initialKind, contact, application, branches, defaultBranch, partners }: Props) {
  const [kind, setKind] = useState(initialKind);
  const isCommission = kind.startsWith("commission");
  const branchCurrency = branches.find((b) => b.id === defaultBranch)?.currency ?? "BDT";
  const [currency, setCurrency] = useState(isCommission && application?.feeCurrency ? application.feeCurrency : branchCurrency);
  const starter = (k: string): Line[] =>
    k.startsWith("commission") && application?.tuition
      ? [{ desc: `Commission on first-year tuition — ${application.label}`, qty: "1", price: String(application.tuition), pct: application.pct ? String(application.pct) : "" }]
      : [{ desc: k === "client" ? "Consultancy service fee" : "", qty: "1", price: "", pct: "" }];
  const [lines, setLines] = useState<Line[]>(starter(initialKind));
  const [taxPct, setTaxPct] = useState("0");

  const amounts = lines.map((l) => {
    const price = Number(l.price) || 0;
    return l.pct !== "" ? (price * Number(l.pct)) / 100 : (Number(l.qty) || 1) * price;
  });
  const subtotal = amounts.reduce((s, a) => s + a, 0);
  const tax = (subtotal * (Number(taxPct) || 0)) / 100;
  const fmt = useMemo(() => new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), []);
  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <ActionForm action={createInvoice} className="grid gap-6">
      {contact && <input type="hidden" name="contact_id" value={contact.id} />}
      {application && <input type="hidden" name="application_id" value={application.id} />}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Invoice type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map(([k, label, help]) => {
            const disabled = (k === "client" && !contact) || (k.startsWith("commission") && application?.commissionBlocked);
            return (
              <label key={k} className={`flex cursor-pointer gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} disabled={disabled} onChange={() => { setKind(k); setLines(starter(k)); if (k.startsWith("commission") && application?.feeCurrency) setCurrency(application.feeCurrency); }} />
                <span><span className="font-semibold">{label}</span><span className="block text-xs text-slate">{help}</span></span>
              </label>);
          })}
        </div>
        {application?.commissionBlocked && <p className="text-xs text-red">Commission claims are switched off for this application: it is an Australian onshore transfer accepted after 31 March 2026.</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {contact && <Field label="Student"><p className="py-2 text-sm">{contact.name} <span className="text-slate">({contact.ref})</span></p></Field>}
        {!contact && (
          <Field label="Branch" htmlFor="branch_id">
            <select className="select" id="branch_id" name="branch_id" defaultValue={defaultBranch}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
        )}
        {(isCommission || kind === "general") && (
          <Field label={isCommission ? "Institution billed *" : "Institution (optional)"} htmlFor="partner_id" className="sm:col-span-2">
            <select className="select" id="partner_id" name="partner_id" defaultValue={application?.partnerId ?? ""} required={isCommission}>
              <option value="">—</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Currency *" htmlFor="currency">
          <select className="select" id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Issue date" htmlFor="issue_date"><input className="input" type="date" id="issue_date" name="issue_date" /></Field>
        <Field label="Due date" htmlFor="due_date"><input className="input" type="date" id="due_date" name="due_date" /></Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Lines</p>
        <div className="grid gap-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_6rem_7rem_auto] sm:items-end">
              <Field label="Description" htmlFor={`d${i}`} className="col-span-2 sm:col-span-1"><input className="input" id={`d${i}`} name="line_desc" value={l.desc} onChange={(e) => set(i, "desc", e.target.value)} maxLength={300} /></Field>
              <Field label="Qty" htmlFor={`q${i}`}><input className="input tnum" id={`q${i}`} name="line_qty" type="number" min="0" step="0.01" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} disabled={l.pct !== ""} /></Field>
              <Field label={l.pct !== "" ? "Tuition" : "Price"} htmlFor={`p${i}`}><input className="input tnum" id={`p${i}`} name="line_price" type="number" min="0" step="0.01" value={l.price} onChange={(e) => set(i, "price", e.target.value)} /></Field>
              <Field label="Commission %" htmlFor={`c${i}`}><input className="input tnum" id={`c${i}`} name="line_pct" type="number" min="0" max="100" step="0.01" value={l.pct} onChange={(e) => set(i, "pct", e.target.value)} placeholder="—" /></Field>
              <div className="text-sm"><span className="block text-xs text-slate">Amount</span><span className="tnum font-semibold">{fmt.format(amounts[i])}</span></div>
              <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))} aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1}>Remove</button>
              {l.pct !== "" && <input type="hidden" name="line_qty" value="1" />}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm mt-3" onClick={() => setLines((ls) => [...ls, { desc: "", qty: "1", price: "", pct: "" }])}>Add line</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <Field label="Notes on the invoice" htmlFor="notes"><textarea className="input min-h-20" id="notes" name="notes" maxLength={1000} placeholder="Payment instructions, intake, student ID at the institution…" /></Field>
        <div className="grid content-start gap-2 rounded-lg bg-mist p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tnum">{currency} {fmt.format(subtotal)}</span></div>
          <label className="flex items-center justify-between gap-2"><span>Tax / VAT %</span><input className="input tnum !w-20 !py-1" name="tax_pct" type="number" min="0" max="50" step="0.01" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} /></label>
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span className="tnum">{currency} {fmt.format(subtotal + tax)}</span></div>
        </div>
      </div>
      <div><Submit pending="Creating…">Create invoice</Submit></div>
    </ActionForm>
  );
}
