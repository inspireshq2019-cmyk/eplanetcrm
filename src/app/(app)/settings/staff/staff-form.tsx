import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { saveStaff } from "../actions";

export type StaffRow = { id: string; name: string; email: string; title: string | null; phone: string | null; role_key: string; primary_branch_id: number; marn: string | null; marn_expiry: string | null; qualification: string | null; active: boolean; extra: number[] };

export function StaffForm({ staff, roles, branches, self }: { staff?: StaffRow; roles: { key: string; name: string; description: string | null }[]; branches: { id: number; name: string }[]; self?: boolean }) {
  const email = staff?.email.endsWith(".invalid") ? "" : staff?.email;
  return (
    <ActionForm action={saveStaff} className="grid gap-4 sm:grid-cols-2">
      {staff?.id && <input type="hidden" name="id" value={staff.id} />}
      <Field label="Full name *" htmlFor="name"><input className="input" id="name" name="name" required maxLength={120} defaultValue={staff?.name} /></Field>
      <Field label="Work email *" htmlFor="email" hint="Their Google Workspace address. They sign in with Google; there is no password to set.">
        <input className="input" type="email" id="email" name="email" required maxLength={150} defaultValue={email} placeholder="name@eplanetintl.com" autoComplete="off" />
      </Field>
      <Field label="Job title" htmlFor="title"><input className="input" id="title" name="title" maxLength={100} defaultValue={staff?.title ?? ""} /></Field>
      <Field label="Mobile" htmlFor="phone"><input className="input" type="tel" id="phone" name="phone" maxLength={30} defaultValue={staff?.phone ?? ""} /></Field>
      <Field label="Role *" htmlFor="role_key">
        <select className="select" id="role_key" name="role_key" defaultValue={staff?.role_key ?? "counsellor"} disabled={self}>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
        {self && <input type="hidden" name="role_key" value={staff?.role_key} />}
      </Field>
      <Field label="Main branch *" htmlFor="primary_branch_id">
        <select className="select" id="primary_branch_id" name="primary_branch_id" defaultValue={staff?.primary_branch_id}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </Field>
      {branches.length > 1 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-semibold">Also works in</legend>
          <div className="flex flex-wrap gap-2">{branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky">
              <input type="checkbox" name="extra_branch" value={b.id} defaultChecked={staff?.extra.includes(b.id)} /> {b.name}
            </label>))}</div>
        </fieldset>
      )}
      <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Registered migration agent (Australia)</legend>
        <Field label="MARN" htmlFor="marn" hint="7 digits, from the OMARA register."><input className="input tnum" id="marn" name="marn" inputMode="numeric" maxLength={7} defaultValue={staff?.marn ?? ""} /></Field>
        <Field label="Registration ends" htmlFor="marn_expiry"><input className="input" type="date" id="marn_expiry" name="marn_expiry" defaultValue={staff?.marn_expiry ?? ""} /></Field>
        <Field label="Other qualification" htmlFor="qualification" hint="e.g. PIER QEAC, British Council agent training"><input className="input" id="qualification" name="qualification" maxLength={200} defaultValue={staff?.qualification ?? ""} /></Field>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={staff?.active ?? true} disabled={self} /> Can sign in{self && <input type="hidden" name="active" value="on" />}</label>
      <div className="sm:col-span-2"><Submit>{staff?.id ? "Save" : "Add staff member"}</Submit></div>
    </ActionForm>
  );
}
