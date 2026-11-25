import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { saveAgency } from "./actions";

export type AgencyRow = { id: number; name: string; contact_person: string | null; email: string | null; phone: string | null; country_code: string | null; default_share_pct: number | null; home_branch_id: number | null; active: boolean };

export function AgencyForm({ agency, branches, countries }: { agency?: AgencyRow; branches: { id: number; name: string }[]; countries: { code: string; name: string }[] }) {
  return (
    <ActionForm action={saveAgency} className="grid gap-4 sm:grid-cols-2">
      {agency && <input type="hidden" name="id" value={agency.id} />}
      <Field label="Agency name *" htmlFor="a_name"><input className="input" id="a_name" name="name" required maxLength={150} defaultValue={agency?.name} /></Field>
      <Field label="Home branch *" htmlFor="a_home" hint="This branch sees the agency's students; head office sees everything.">
        <select className="select" id="a_home" name="home_branch_id" required defaultValue={agency?.home_branch_id ?? ""}><option value="" disabled>Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </Field>
      <Field label="Contact person" htmlFor="a_person"><input className="input" id="a_person" name="contact_person" maxLength={100} defaultValue={agency?.contact_person ?? ""} /></Field>
      <Field label="Email" htmlFor="a_email"><input className="input" type="email" id="a_email" name="email" maxLength={150} defaultValue={agency?.email ?? ""} /></Field>
      <Field label="Phone" htmlFor="a_phone"><input className="input" type="tel" id="a_phone" name="phone" maxLength={30} defaultValue={agency?.phone ?? ""} /></Field>
      <Field label="Country" htmlFor="a_country"><select className="select" id="a_country" name="country_code" defaultValue={agency?.country_code ?? ""}><option value="">—</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
      <Field label="Usual commission share %" htmlFor="a_share" hint="Used when finance records their share of a commission."><input className="input tnum" type="number" min="0" max="100" step="0.01" id="a_share" name="default_share_pct" defaultValue={agency?.default_share_pct ?? ""} /></Field>
      {agency && (
        <Field label="Status" htmlFor="a_active"><select className="select" id="a_active" name="active" defaultValue={agency.active ? "on" : "off"}><option value="on">Active</option><option value="off">Switched off (nobody from the agency can sign in)</option></select></Field>
      )}
      <div className="sm:col-span-2"><Submit>{agency ? "Save" : "Add sub-agent"}</Submit></div>
    </ActionForm>
  );
}
