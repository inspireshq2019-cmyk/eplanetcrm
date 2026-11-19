import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { isOpen, type FormRow } from "@/lib/forms";
import { publicBase, qrSvg } from "@/lib/qr";
import { date, dateTime } from "@/lib/format";
import { CopyField } from "@/components/copy-field";
import { Card, Empty, PageHeader, Stat, TableWrap } from "@/components/ui";
import { setFormActive } from "../actions";

export const metadata = { title: "Event form" };

export default async function FormDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePermission("forms.manage");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const form = await q1<FormRow & { branch: string; timezone: string; owner: string | null }>(
    `select f.id, f.branch_id, f.slug, f.title, f.intro, to_char(f.event_date,'YYYY-MM-DD') event_date, f.event_time, f.venue, f.fields, f.questions, f.owner_id, f.follow_up,
            f.thank_you, f.active, to_char(f.closes_on,'YYYY-MM-DD') closes_on, b.name branch, b.timezone, o.name owner
       from lead_forms f join branches b on b.id=f.branch_id left join users o on o.id=f.owner_id where f.id=$1`, [Number(id)]);
  if (!form || !canSeeBranch(u, form.branch_id)) notFound();
  const url = `${await publicBase()}/f/${form.slug}`;
  const [svg, subs] = await Promise.all([
    qrSvg(url),
    q<{ id: string; created_at: string; status: string; contact_id: string | null; name: string | null; phone: string | null; counsellor: string | null }>(
      `select s.id, s.created_at, s.status, c.id contact_id, trim(c.first_name || ' ' || coalesce(c.last_name,'')) name, c.phone, o.name counsellor
         from form_submissions s left join contacts c on c.id=s.contact_id left join users o on o.id=c.owner_id
        where s.form_id=$1 order by s.created_at desc limit 500`, [form.id]),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: form.timezone }).format(new Date());
  const open = isOpen(form, today);
  const created = subs.filter((s) => s.status === "created").length;
  return (
    <>
      <PageHeader back={{ href: "/forms", label: "Event forms" }} title={form.title}
        subtitle={[form.branch, form.event_date ? date(form.event_date) : null, form.event_time, form.venue].filter(Boolean).join(" · ")}
        actions={<><Link className="btn" href={`/forms/${form.id}/edit`}>Edit</Link><a className="btn btn-primary" href={`/print/form/${form.id}`} target="_blank" rel="noopener">Print QR poster</a></>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registrations" value={subs.length} />
        <Stat label="New leads" value={created} tone="ok" href={`/contacts?tag=form-${form.slug}`} />
        <Stat label="Already in the CRM" value={subs.length - created} />
        <Stat label="Status" value={open ? "Open" : "Closed"} tone={open ? "ok" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card title="QR code">
          <div className="mx-auto w-full max-w-64 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="mt-4 grid gap-3">
            <CopyField id="form-url" label="Form link (for WhatsApp, Facebook or SMS)" value={url} />
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-sm" href={`${url}?preview=1`} target="_blank" rel="noopener">Preview the form</a>
              <a className="btn btn-sm" href={`/api/forms/${form.id}/qr`}>Download QR (SVG)</a>
            </div>
            <form action={setFormActive} className="border-t border-line pt-3">
              <input type="hidden" name="id" value={form.id} /><input type="hidden" name="active" value={open ? "0" : "1"} />
              <p className="mb-2 text-sm text-slate">{open ? "The form is taking registrations." : "The form is closed. Students who scan the code see a closed message."}</p>
              <button className="btn btn-sm">{open ? "Close registrations" : "Reopen registrations"}</button>
            </form>
            <p className="text-xs text-slate">New leads go to {form.owner ?? "the branch's usual rule (Settings › Ad lead sources)"}{form.follow_up ? ", with a task to call by the next day." : "."}</p>
          </div>
        </Card>
        <Card title="Registrations" pad={false}>
          {subs.length ? (
            <TableWrap><table className="tbl">
              <thead><tr><th>Registered</th><th>Student</th><th>Mobile</th><th>Counsellor</th><th>Result</th></tr></thead>
              <tbody>{subs.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">{dateTime(s.created_at, form.timezone)}</td>
                  <td>{s.contact_id ? <Link className="font-semibold text-navy" href={`/contacts/${s.contact_id}`}>{s.name}</Link> : "Deleted"}</td>
                  <td className="tnum whitespace-nowrap">{s.phone ?? "—"}</td>
                  <td>{s.counsellor ?? <span className="badge badge-red">Unassigned</span>}</td>
                  <td>{s.status === "created" ? <span className="badge badge-ok">New lead</span> : <span className="badge">Already in CRM</span>}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          ) : <Empty title="No registrations yet">Use Preview the form to try it without saving anything. Registrations appear here as they arrive.</Empty>}
        </Card>
      </div>
    </>
  );
}
