import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { contactOptions, resolveContact } from "@/lib/contact-pick";
import { loadContactForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { visibleStaff } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { ApplicationPicker } from "./picker";
import { createApplication } from "../actions";

export const metadata = { title: "Start application" };

export default async function NewApplication({ searchParams }: { searchParams: Promise<{ contact?: string; pick?: string }> }) {
  const user = await requirePermission("applications.edit");
  const { contact, pick } = await searchParams;
  if (!contact) {
    // No student chosen yet: let staff pick one by name, C-number or phone.
    const found = pick ? await resolveContact(user, pick) : null;
    if (found) redirect(`/applications/new?contact=${found.id}`);
    const options = await contactOptions(user);
    return (
      <>
        <PageHeader title="Start an application" back={{ href: "/applications", label: "Applications" }} subtitle="Applications always belong to a student. Choose the student first." />
        <Card>
          {pick && <div className="mb-4"><Notice tone="warn">No student matches “{pick}”. Pick from the list, or add the student first.</Notice></div>}
          <form className="flex flex-wrap items-end gap-3">
            <Field label="Student" htmlFor="pick" className="min-w-64 flex-1">
              <input className="input" id="pick" name="pick" list="contact-list" required placeholder="Type a name, C-number or mobile" autoComplete="off" defaultValue={pick} />
              <datalist id="contact-list">{options.map((o) => <option key={o.ref} value={`${o.ref} · ${o.name}`} />)}</datalist>
            </Field>
            <button className="btn btn-primary">Continue</button>
            <a className="btn" href="/contacts/new">Add a new student</a>
          </form>
        </Card>
      </>
    );
  }
  if (!(await loadContactForUser(user, contact))) notFound();
  const c = (await q1<{ id: string; ref: string; name: string; dests: string[]; owner_id: string | null }>(
    "select id, ref, first_name || ' ' || coalesce(last_name,'') name, interested_destinations dests, owner_id from contacts where id=$1", [contact]))!;
  const [workflows, partners, courses, staff] = await Promise.all([
    q<{ id: number; name: string; destination: string | null }>("select id, name, destination from workflows where active and service='admission' order by id"),
    q<{ id: number; name: string; country_code: string | null; is_partner: boolean }>("select id, name, country_code, is_partner from partners where active and kind <> 'insurer' order by is_partner desc, name"),
    q<{ id: number; partner_id: number; title: string; level: string; tuition_per_year: number | null; currency: string | null; intakes: string[] }>(
      "select id, partner_id, title, level, tuition_per_year, currency, intakes from courses where active order by title"),
    visibleStaff(user),
  ]);
  return (
    <>
      <PageHeader title={`Start an application for ${c.name}`} back={{ href: `/contacts/${c.id}`, label: c.ref }} subtitle="The steps and document checklist come from the country's workflow. Documents already on the student's file are ticked automatically." />
      <ActionForm action={createApplication} className="card grid gap-5 p-5">
        <input type="hidden" name="contact_id" value={c.id} />
        <ApplicationPicker workflows={workflows} partners={partners} courses={courses} defaultDest={c.dests[0]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Applied through" htmlFor="channel">
            <select className="select" id="channel" name="channel" defaultValue="direct">
              <option value="direct">Direct to the institution</option><option value="applyboard">ApplyBoard</option><option value="crizac">Crizac</option>
              <option value="infinite">Infinite Group</option><option value="studylink">StudyLink</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Responsible counsellor" htmlFor="owner_id">
            <select className="select" id="owner_id" name="owner_id" defaultValue={c.owner_id ?? user.id}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
        </div>
        <div><Submit>Start application</Submit></div>
      </ActionForm>
    </>
  );
}
