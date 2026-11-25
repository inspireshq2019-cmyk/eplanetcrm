import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { fieldModes, STANDARD_FIELDS, type FormRow } from "@/lib/forms";
import { saveForm } from "./actions";

/** Create or edit a registration form. Name and mobile are always asked. */
export function FormBuilder({ form, branches, staff, defaultBranch, defaultKind = "event" }: {
  defaultKind?: "event" | "walk_in"; form?: FormRow; branches: { id: number; name: string }[]; staff: { id: string; name: string; primary_branch_id: number }[]; defaultBranch: number;
}) {
  const modes = fieldModes(form?.fields ?? {});
  const qs = form?.questions ?? [];
  return (
    <ActionForm action={saveForm} className="grid gap-6">
      {form && <input type="hidden" name="id" value={form.id} />}
      <style>{".walkin-only{display:none}form:has(#kind_walk_in:checked) .event-only{display:none}form:has(#kind_walk_in:checked) .walkin-only{display:block}"}</style>
      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-semibold text-navy">What is this form for?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky">
            <input type="radio" name="kind" id="kind_event" value="event" defaultChecked={(form?.kind ?? defaultKind) === "event"} className="mt-1" />
            <span><b>An event, fair or the website</b><span className="block text-slate">Students register; each becomes a lead.</span></span></label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky">
            <input type="radio" name="kind" id="kind_walk_in" value="walk_in" defaultChecked={(form?.kind ?? defaultKind) === "walk_in"} className="mt-1" />
            <span><b>Office walk-ins (reception QR)</b><span className="block text-slate">Visitors scan at reception, fill in the form and join the check-in queue. New visitors become walk-in leads.</span></span></label>
        </div>
      </section>
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-semibold text-navy sm:col-span-2"><span className="event-only">The event</span><span className="walkin-only">The form</span></h2>
        <Field label="Title *" htmlFor="title" className="sm:col-span-2" hint="Students see this at the top of the form. For the website, e.g. &ldquo;Free study abroad consultation&rdquo;.">
          <input className="input" id="title" name="title" required maxLength={150} defaultValue={form?.title} placeholder="e.g. Australia & UK Education Fair, Dhaka" />
        </Field>
        <Field label="Short introduction" htmlFor="intro" className="sm:col-span-2">
          <textarea className="input min-h-20" id="intro" name="intro" maxLength={600} defaultValue={form?.intro ?? ""} placeholder="e.g. Meet university representatives and get free counselling. Register to get your entry pass." />
        </Field>
        <Field label="Branch *" htmlFor="branch_id" hint="Registrations become leads in this branch.">
          <select className="select" id="branch_id" name="branch_id" defaultValue={form?.branch_id ?? defaultBranch}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </Field>
        <p className="walkin-only text-sm text-slate sm:col-span-2">Title example: &ldquo;Welcome to Eplanet Uttara: please check in&rdquo;. Visitors are also asked the reason for their visit.</p>
        <Field label="Venue" htmlFor="venue" className="event-only"><input className="input" id="venue" name="venue" maxLength={200} defaultValue={form?.venue ?? ""} placeholder="e.g. Radisson Blu, Dhaka" /></Field>
        <Field label="Event date" htmlFor="event_date" className="event-only"><input className="input" type="date" id="event_date" name="event_date" defaultValue={form?.event_date ?? ""} /></Field>
        <Field label="Time" htmlFor="event_time" className="event-only"><input className="input" id="event_time" name="event_time" maxLength={60} defaultValue={form?.event_time ?? ""} placeholder="e.g. 10am – 5pm" /></Field>
        <Field label="Stop taking registrations after" htmlFor="closes_on" className="event-only" hint="Leave empty to keep it open until you close it.">
          <input className="input" type="date" id="closes_on" name="closes_on" defaultValue={form?.closes_on ?? ""} />
        </Field>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="font-display text-lg font-semibold text-navy">Questions</h2>
        <p className="text-sm text-slate">Full name and mobile number are always asked, and every student must agree to Eplanet keeping their details. Keep the form short: at a busy stand, every extra question loses registrations.</p>
        <div className="grid gap-3 sm:grid-cols-2">{STANDARD_FIELDS.map((fld) => (
          <label key={fld.key} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="min-w-0">{fld.label}</span>
            <select className="select w-32 shrink-0" name={`f_${fld.key}`} defaultValue={modes[fld.key]} aria-label={`${fld.label}: ask or not`}>
              <option value="off">Don&apos;t ask</option><option value="optional">Optional</option><option value="required">Required</option>
            </select>
          </label>))}
        </div>
        <details className="rounded-lg border border-line p-3" open={qs.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">Your own questions (up to 5)</summary>
          <div className="mt-3 grid gap-4">{[1, 2, 3, 4, 5].map((i) => {
            const qq = qs[i - 1];
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                <input className="input" name={`q${i}_label`} maxLength={150} defaultValue={qq?.label ?? ""} placeholder={`Question ${i}, e.g. Which university stall are you visiting?`} aria-label={`Question ${i}`} />
                <select className="select" name={`q${i}_type`} defaultValue={qq?.type ?? "text"} aria-label={`Question ${i} answer type`}><option value="text">Typed answer</option><option value="choice">Pick one</option></select>
                <input className="input" name={`q${i}_options`} maxLength={1000} defaultValue={qq?.options.join(", ") ?? ""} placeholder="For Pick one: choices separated by commas" aria-label={`Question ${i} choices`} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`q${i}_required`} defaultChecked={qq?.required} /> Required</label>
              </div>);
          })}</div>
        </details>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-semibold text-navy sm:col-span-2">After someone registers</h2>
        <Field label="Who gets the new leads" htmlFor="owner_id" hint="Pick the counsellor at the stand, or leave it to the branch's usual rule (Settings › Ad lead sources).">
          <select className="select" id="owner_id" name="owner_id" defaultValue={form?.owner_id ?? ""}>
            <option value="">Branch&apos;s usual rule</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Thank-you message" htmlFor="thank_you">
          <input className="input" id="thank_you" name="thank_you" maxLength={300} defaultValue={form?.thank_you ?? ""} placeholder="e.g. Show this screen at the entrance to collect your pass." />
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="follow_up" defaultChecked={form?.follow_up ?? true} className="mt-1" />
          <span>Give the counsellor a task to call each new registration by the next day</span></label>
      </section>
      <div><Submit>{form ? "Save changes" : "Create form and QR code"}</Submit></div>
    </ActionForm>
  );
}
