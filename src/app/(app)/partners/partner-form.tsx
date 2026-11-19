import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { PARTNER_KINDS } from "@/lib/lookups";
import { savePartner } from "./actions";

export type PartnerRow = { id: number; name: string; kind: string; country_code: string | null; city: string | null; website: string | null; email: string | null; phone: string | null; cricos: string | null; is_partner: boolean; notes: string | null };

export function PartnerForm({ partner, countries }: { partner?: PartnerRow; countries: { code: string; name: string }[] }) {
  return (
    <ActionForm action={savePartner} className="grid gap-4 sm:grid-cols-2">
      {partner && <input type="hidden" name="id" value={partner.id} />}
      <Field label="Name *" htmlFor="name" className="sm:col-span-2"><input className="input" id="name" name="name" required maxLength={200} defaultValue={partner?.name} /></Field>
      <Field label="Type" htmlFor="kind"><select className="select" id="kind" name="kind" defaultValue={partner?.kind ?? "university"}>{PARTNER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Country" htmlFor="country_code"><select className="select" id="country_code" name="country_code" defaultValue={partner?.country_code ?? ""}><option value="">—</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
      <Field label="City" htmlFor="city"><input className="input" id="city" name="city" maxLength={100} defaultValue={partner?.city ?? ""} /></Field>
      <Field label="CRICOS provider code" htmlFor="cricos" hint="Australian providers only."><input className="input tnum" id="cricos" name="cricos" maxLength={20} defaultValue={partner?.cricos ?? ""} /></Field>
      <Field label="Website" htmlFor="website"><input className="input" id="website" name="website" maxLength={300} defaultValue={partner?.website ?? ""} /></Field>
      <Field label="Admissions email" htmlFor="email"><input className="input" type="email" id="email" name="email" maxLength={150} defaultValue={partner?.email ?? ""} /></Field>
      <Field label="Phone" htmlFor="phone"><input className="input" type="tel" id="phone" name="phone" maxLength={40} defaultValue={partner?.phone ?? ""} /></Field>
      <label className="flex items-center gap-2 self-end py-2 text-sm"><input type="checkbox" name="is_partner" defaultChecked={partner?.is_partner ?? true} /> On Eplanet&apos;s official partner list</label>
      <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><textarea className="input min-h-20" id="notes" name="notes" maxLength={2000} defaultValue={partner?.notes ?? ""} placeholder="Contacts at the institution, portal login owner, special conditions…" /></Field>
      <div><Submit>{partner ? "Save changes" : "Add institution"}</Submit></div>
    </ActionForm>
  );
}
