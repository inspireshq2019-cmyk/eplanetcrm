import { redirect } from "next/navigation";
import { can, requireUser, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { ActionForm, Submit } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { saveBranch } from "../actions";

export const metadata = { title: "Branches" };

export default async function Branches() {
  const user = await requireUser();
  if (!can(user, "settings.system") && !can(user, "settings.users")) redirect("/?denied=settings.system");
  const p: unknown[] = [];
  const rows = await q<{ id: number; code: string; name: string; country: string; address: string | null; phone: string | null; email: string | null; timezone: string; currency: string; receipt_prefix: string; receipt_seq: number; invoice_seq: number; active: boolean; is_head_office: boolean }>(
    `select b.*, c.name country from branches b join countries c on c.code=b.country_code where ${scopeWhere(user, "b", p).replace("b.branch_id", "b.id")} order by c.name, b.name`, p);
  const sys = can(user, "settings.system");
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Branches" subtitle="These details print on every invoice and receipt from the branch." />
      <div className="grid gap-4">
        {rows.map((b) => (
          <details key={b.id} className="card group" open={rows.length === 1}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
              <span><span className="font-semibold">{b.name}</span> <span className="text-sm text-slate">· {b.country}{b.is_head_office ? " · Head office" : ""}</span></span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-slate">
                {!b.active && <span className="badge badge-grey">Closed</span>}
                {!b.address && <span className="badge badge-warn">No address</span>}
                <span className="tnum">Code {b.code} · {b.currency} · last receipt {b.receipt_prefix}-{String(b.receipt_seq).padStart(6, "0")}</span>
              </span>
            </summary>
            <div className="border-t border-line p-4">
              <ActionForm action={saveBranch} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={b.id} />
                <Field label="Name" htmlFor={`n${b.id}`}><input className="input" id={`n${b.id}`} name="name" defaultValue={b.name} required maxLength={100} /></Field>
                <Field label="Time zone" htmlFor={`t${b.id}`} hint="Used for task due times and the dashboard."><input className="input" id={`t${b.id}`} name="timezone" defaultValue={b.timezone} required /></Field>
                <Field label="Address" htmlFor={`a${b.id}`} className="sm:col-span-2"><input className="input" id={`a${b.id}`} name="address" defaultValue={b.address ?? ""} maxLength={300} /></Field>
                <Field label="Phone" htmlFor={`p${b.id}`}><input className="input" id={`p${b.id}`} name="phone" defaultValue={b.phone ?? ""} maxLength={40} /></Field>
                <Field label="Email" htmlFor={`e${b.id}`}><input className="input" type="email" id={`e${b.id}`} name="email" defaultValue={b.email ?? ""} maxLength={150} /></Field>
                {sys && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={b.active} /> Open</label>}
                <p className="text-xs text-slate sm:col-span-2">Receipt and invoice numbers can&apos;t be changed: they run on from the last one issued so none is ever reused.</p>
                <div><Submit>Save branch</Submit></div>
              </ActionForm>
            </div>
          </details>))}
      </div>
    </>
  );
}
