import { requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { contactOptions } from "@/lib/contact-pick";
import { visibleStaff, DESTINATIONS } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { createVisaCase } from "../actions";

export const metadata = { title: "Open visa case" };

export default async function NewVisa({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const user = await requirePermission("visa.edit");
  const { contact } = await searchParams;
  const [options, staff] = await Promise.all([contactOptions(user), visibleStaff(user)]);
  const pre = contact ? await q1<{ ref: string; name: string; dest: string | null }>(
    "select ref, first_name || ' ' || coalesce(last_name,'') name, interested_destinations[1] dest from contacts where id::text=$1", [contact]) : null;
  const apps = contact ? await q<{ id: string; ref: string; partner: string | null }>(
    "select a.id, a.ref, p.name partner from applications a left join partners p on p.id=a.partner_id where a.contact_id::text=$1 and a.status<>'lost'", [contact]) : [];
  const agents = staff.filter((s) => s.marn);
  return (
    <>
      <PageHeader title="Open a visa case" back={{ href: "/visa", label: "Visa cases" }} subtitle="For Australia, the agent must be a registered migration agent with a current MARN." />
      <ActionForm action={createVisaCase} className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Student *" htmlFor="contact" hint="Type a name or C-number and pick from the list." className="sm:col-span-2">
          <input className="input" id="contact" name="contact" list="contact-list" required defaultValue={pre ? `${pre.ref} · ${pre.name}` : ""} autoComplete="off" />
          <datalist id="contact-list">{options.map((o) => <option key={o.ref} value={`${o.ref} · ${o.name}`}>{o.phone ?? ""}</option>)}</datalist>
        </Field>
        <Field label="Country" htmlFor="destination"><select className="select" id="destination" name="destination" defaultValue={pre?.dest ?? "AU"}>{DESTINATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Visa type" htmlFor="subclass"><input className="input" id="subclass" name="subclass" list="subclasses" placeholder="e.g. 500 Student" />
          <datalist id="subclasses">{["500 Student", "590 Student Guardian", "485 Temporary Graduate", "600 Visitor", "UK Student route", "UK Graduate route", "Canada study permit", "US F-1", "NZ Fee Paying Student", "Schengen national D visa"].map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="Registered agent" htmlFor="agent_id" hint={agents.length ? undefined : "No staff in your branches have a MARN yet. Add it in Settings → Staff."}>
          <select className="select" id="agent_id" name="agent_id"><option value="">Choose later</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} (MARN {a.marn})</option>)}</select>
        </Field>
        {apps.length > 0 && (
          <Field label="Linked application" htmlFor="application_id"><select className="select" id="application_id" name="application_id"><option value="">None</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.ref} · {a.partner}</option>)}</select></Field>
        )}
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><textarea className="textarea" id="notes" name="notes" /></Field>
        <div><Submit>Open visa case</Submit></div>
      </ActionForm>
    </>
  );
}
