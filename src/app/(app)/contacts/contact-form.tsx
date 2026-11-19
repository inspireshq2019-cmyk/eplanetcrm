import { ActionForm, Submit, type ActionResult } from "@/components/action-form";
import { Field } from "@/components/ui";
import { DESTINATIONS, FIELDS, LEVELS, SOURCES, type BranchOpt, type UserOpt } from "@/lib/lookups";

export type ContactValues = Partial<{
  id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; whatsapp: string | null; dob: string | null;
  gender: string | null; nationality: string | null; city: string | null; address: string | null; source: string | null; source_detail: string | null;
  interested_destinations: string[]; interested_level: string | null; interested_field: string | null; intake: string | null;
  budget_amount: number | null; budget_currency: string | null; onshore: boolean; guardian_name: string | null; guardian_phone: string | null;
  tags: string[]; branch_id: number; owner_id: string | null; passport_no: string | null; passport_expiry: string | null;
}>;

export function ContactForm({ action, values = {}, branches, staff, mode, canOwn, canSensitive, defaultBranchId }: {
  action: (p: ActionResult, f: FormData) => Promise<ActionResult>; values?: ContactValues; branches: BranchOpt[]; staff: UserOpt[];
  mode: "new" | "edit"; canOwn: boolean; canSensitive: boolean; defaultBranchId: number;
}) {
  const v = values;
  const branchId = v.branch_id ?? defaultBranchId;
  const currency = branches.find((b) => b.id === branchId)?.currency ?? "BDT";
  return (
    <ActionForm action={action} className="grid gap-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <fieldset className="card p-5">
        <legend className="px-1 font-display text-[15px] font-semibold text-navy">Student</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name *" htmlFor="first_name"><input className="input" id="first_name" name="first_name" defaultValue={v.first_name} required maxLength={80} autoComplete="off" /></Field>
          <Field label="Last name" htmlFor="last_name"><input className="input" id="last_name" name="last_name" defaultValue={v.last_name ?? ""} maxLength={80} autoComplete="off" /></Field>
          <Field label="Date of birth" htmlFor="dob"><input className="input" type="date" id="dob" name="dob" defaultValue={v.dob ?? ""} /></Field>
          <Field label="Mobile *" htmlFor="phone" hint="Local numbers get the branch's country code added."><input className="input tnum" id="phone" name="phone" defaultValue={v.phone ?? ""} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
          <Field label="WhatsApp" htmlFor="whatsapp">
            <input className="input tnum" id="whatsapp" name="whatsapp" defaultValue={v.whatsapp ?? ""} inputMode="tel" />
            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate"><input type="checkbox" name="whatsapp_same" defaultChecked={mode === "new"} /> Same as mobile</label>
          </Field>
          <Field label="Email" htmlFor="email"><input className="input" type="email" id="email" name="email" defaultValue={v.email ?? ""} /></Field>
          <Field label="Gender" htmlFor="gender">
            <select className="select" id="gender" name="gender" defaultValue={v.gender ?? ""}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select>
          </Field>
          <Field label="City" htmlFor="city"><input className="input" id="city" name="city" defaultValue={v.city ?? ""} /></Field>
          <Field label="Nationality" htmlFor="nationality">
            <select className="select" id="nationality" name="nationality" defaultValue={v.nationality ?? branches.find((b) => b.id === branchId)?.country_code ?? ""}>
              <option value="">—</option><option value="BD">Bangladeshi</option><option value="NP">Nepali</option><option value="IN">Indian</option><option value="LK">Sri Lankan</option><option value="PH">Filipino</option><option value="AU">Australian</option>
            </select>
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2 lg:col-span-3"><input className="input" id="address" name="address" defaultValue={v.address ?? ""} /></Field>
          {mode === "edit" && canSensitive && (
            <>
              <Field label="Passport number" htmlFor="passport_no" hint="Only staff with ID access can see or change this; every view is logged."><input className="input tnum uppercase" id="passport_no" name="passport_no" defaultValue={v.passport_no ?? ""} autoComplete="off" /></Field>
              <Field label="Passport expiry" htmlFor="passport_expiry"><input className="input" type="date" id="passport_expiry" name="passport_expiry" defaultValue={v.passport_expiry ?? ""} /></Field>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="card p-5">
        <legend className="px-1 font-display text-[15px] font-semibold text-navy">Study plans</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="label">Countries interested in</span>
            <div className="flex flex-wrap gap-2">
              {DESTINATIONS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky">
                  <input type="checkbox" name="interested_destinations" value={k} defaultChecked={v.interested_destinations?.includes(k)} /> {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Level" htmlFor="interested_level">
            <select className="select" id="interested_level" name="interested_level" defaultValue={v.interested_level ?? ""}><option value="">—</option>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Subject" htmlFor="interested_field">
            <select className="select" id="interested_field" name="interested_field" defaultValue={v.interested_field ?? ""}><option value="">—</option>{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Preferred intake" htmlFor="intake"><input className="input" id="intake" name="intake" defaultValue={v.intake ?? ""} placeholder="e.g. Feb 2027" /></Field>
          <Field label="Yearly budget" htmlFor="budget_amount">
            <div className="flex gap-2">
              <input className="input tnum" type="number" min="0" step="1" id="budget_amount" name="budget_amount" defaultValue={v.budget_amount ?? ""} />
              <select className="select !w-28" name="budget_currency" aria-label="Budget currency" defaultValue={v.budget_currency ?? currency}>
                {[currency, "BDT", "NPR", "AUD", "GBP", "CAD", "USD", "NZD", "EUR"].filter((x, i, a) => a.indexOf(x) === i).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="onshore" defaultChecked={v.onshore} /> Already living in the destination country (onshore)</label>
        </div>
      </fieldset>

      <fieldset className="card p-5">
        <legend className="px-1 font-display text-[15px] font-semibold text-navy">Where they came from and who looks after them</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Source" htmlFor="source">
            <select className="select" id="source" name="source" defaultValue={v.source ?? "walk_in"}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}{v.source === "agentcis" && <option value="agentcis">Imported from Agentcis</option>}</select>
          </Field>
          <Field label="Source details" htmlFor="source_detail"><input className="input" id="source_detail" name="source_detail" defaultValue={v.source_detail ?? ""} placeholder="e.g. Europe Expo 2026, referred by…" /></Field>
          <Field label="Branch" htmlFor="branch_id">
            <select className="select" id="branch_id" name="branch_id" defaultValue={branchId}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
          {mode === "new" && canOwn && (
            <Field label="Counsellor" htmlFor="owner_id">
              <select className="select" id="owner_id" name="owner_id" defaultValue={v.owner_id ?? ""}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
          )}
          {mode === "new" && (
            <Field label="Status" htmlFor="stage">
              <select className="select" id="stage" name="stage" defaultValue="lead"><option value="lead">Lead (enquiry)</option><option value="prospect">Prospect (counselled, interested)</option><option value="client">Client (signed up)</option></select>
            </Field>
          )}
          <Field label="Tags" htmlFor="tags" hint="Separate with commas."><input className="input" id="tags" name="tags" defaultValue={v.tags?.join(", ") ?? ""} placeholder="scholarship, parents involved" /></Field>
          <Field label="Parent / guardian name" htmlFor="guardian_name"><input className="input" id="guardian_name" name="guardian_name" defaultValue={v.guardian_name ?? ""} /></Field>
          <Field label="Parent / guardian phone" htmlFor="guardian_phone"><input className="input tnum" id="guardian_phone" name="guardian_phone" defaultValue={v.guardian_phone ?? ""} inputMode="tel" /></Field>
        </div>
        {mode === "new" && (
          <div className="mt-4 grid gap-3">
            <Field label="First note" htmlFor="first_note"><textarea className="textarea" id="first_note" name="first_note" placeholder="What did they ask about? Any results, budget or timing they mentioned?" /></Field>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1" required /> The student agreed to Eplanet storing and using their details to help them apply to study abroad.</label>
            <label className="flex items-start gap-2 text-sm text-slate"><input type="checkbox" name="confirm_duplicate" value="1" className="mt-1" /> Add anyway, even if the phone or email matches an existing record.</label>
          </div>
        )}
      </fieldset>

      <div className="flex gap-3"><Submit>{mode === "new" ? "Add student" : "Save changes"}</Submit></div>
    </ActionForm>
  );
}
