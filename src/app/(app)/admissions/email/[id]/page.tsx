import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { loadApplicationForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { getMailbox } from "@/lib/mailbox";
import { METHOD_LABEL, ROUTE_LABEL } from "@/lib/admissions";
import { date, DEST_LABEL, LEVEL_LABEL } from "@/lib/format";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { sendPack } from "./actions";

export const metadata = { title: "Email application pack" };

const size = (b: number | null) => (b == null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function EmailPack({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("admissions.manage");
  const { id } = await params;
  const acc = await loadApplicationForUser(user, id);
  if (!acc || !acc.adm_status) notFound();
  const [a, docs, routes, box, prior] = await Promise.all([
    q1<{ ref: string; student: string; first_name: string; dob: string | null; nationality: string | null; email: string | null; phone: string | null; partner: string | null; partner_email: string | null;
         course: string | null; level: string | null; intake: string | null; destination: string | null; student_id_at_provider: string | null }>(
      `select a.ref, c.first_name || ' ' || coalesce(c.last_name,'') student, c.first_name, c.dob, c.nationality, c.email, c.phone, p.name partner, p.email partner_email,
              coalesce(co.title, a.course_title) course, co.level, a.intake, a.destination, a.student_id_at_provider
         from applications a join contacts c on c.id=a.contact_id left join partners p on p.id=a.partner_id left join courses co on co.id=a.course_id where a.id=$1`, [id]),
    q<{ id: string; filename: string; doc_type: string; size_bytes: number | null; on_app: boolean; verified: boolean }>(
      `select d.id, d.filename, d.doc_type, d.size_bytes, d.application_id is not distinct from $2 on_app, d.verified_at is not null verified
         from documents d where d.contact_id=$1 and d.doc_type not in ('offer','coe','visa_grant') order by on_app desc, d.created_at desc`, [acc.contact_id, id]),
    q<{ id: number; route_kind: string; via: string | null; email: string | null; method: string; preferred: boolean }>(
      `select r.id, r.route_kind, v.name via, r.email, r.method, r.preferred from partner_routes r left join partners v on v.id=r.via_partner_id
         join applications a on a.partner_id=r.partner_id where a.id=$1 and r.active order by r.preferred desc, (r.method='email') desc, r.id`, [id]),
    getMailbox(),
    q1<{ n: number }>("select count(*)::int n from application_submissions where application_id=$1 and outcome <> 'withdrawn'", [id]),
  ]);
  const alreadySubmitted = (prior?.n ?? 0) > 0;
  if (!a) notFound();
  const emailRoute = routes.find((r) => r.method === "email" && r.email) ?? null;
  const to = emailRoute?.email ?? a.partner_email ?? "";
  const subject = `New application: ${a.student} – ${a.course ?? "course"}${a.intake ? ` – ${a.intake}` : ""} (Eplanet ${a.ref})`;
  const body = [
    `Dear Admissions team,`,
    ``,
    `Please find attached the application of ${a.student} for the following course:`,
    ``,
    `Institution: ${a.partner ?? "—"}`,
    `Course: ${a.course ?? "—"}${a.level ? ` (${LEVEL_LABEL[a.level] ?? a.level})` : ""}`,
    `Intake: ${a.intake ?? "—"}`,
    ``,
    `Student: ${a.student}`,
    ...(a.dob ? [`Date of birth: ${date(a.dob)}`] : []),
    ...(a.nationality ? [`Nationality: ${a.nationality}`] : []),
    ...(a.email ? [`Student email: ${a.email}`] : []),
    ``,
    `Please reply to this email with any questions or the outcome. Our reference: ${a.ref}.`,
    ``,
    `Kind regards,`,
    `${user.name}`,
    `Admissions, Eplanet International`,
  ].join("\n");

  return (
    <>
      <PageHeader back={{ href: `/applications/${id}`, label: a.ref }} title="Email the application pack" subtitle={`${a.student} → ${a.partner ?? "institution"}${a.destination ? ` (${DEST_LABEL[a.destination] ?? a.destination})` : ""}`} />
      {!box ? (
        <Notice tone="warn">The admissions mailbox isn&apos;t connected yet, so emails can&apos;t be sent. An owner can connect it in Settings › Admissions mailbox. Until then, submit on the institution&apos;s portal and record it on the application.</Notice>
      ) : (
        <ActionForm action={sendPack} className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <input type="hidden" name="id" value={id} />
          <Card title={`From ${box.email}`}>
            <div className="grid gap-4">
              <Field label="To *" htmlFor="to" hint={emailRoute ? `From the institution's route: ${ROUTE_LABEL[emailRoute.route_kind]}${emailRoute.via ? `: ${emailRoute.via}` : ""}` : a.partner_email ? "The institution's email from its partner page." : "Add an applications email on the institution's partner page to fill this in next time."}>
                <input className="input" id="to" name="to" required defaultValue={to} placeholder="applications@university.edu" />
              </Field>
              <Field label="Cc" htmlFor="cc" hint="Separate several addresses with commas."><input className="input" id="cc" name="cc" /></Field>
              <Field label="Subject *" htmlFor="subject"><input className="input" id="subject" name="subject" required maxLength={200} defaultValue={subject} /></Field>
              <Field label="Message *" htmlFor="body"><textarea className="textarea min-h-72 font-mono text-[13px]" id="body" name="body" required defaultValue={body} /></Field>
            </div>
          </Card>
          <div className="grid content-start gap-6">
            <Card title="Attach documents" pad={false}>
              {docs.length ? (
                <ul className="divide-y divide-line">{docs.map((d) => (
                  <li key={d.id}><label className="flex items-start gap-3 px-5 py-3 text-sm">
                    <input type="checkbox" name="doc" value={d.id} defaultChecked={d.on_app || d.verified} className="mt-1" />
                    <span className="min-w-0"><span className="font-semibold break-all">{d.filename}</span>
                      <span className="block text-xs text-slate">{d.doc_type.replace(/_/g, " ")} · {size(d.size_bytes)}{d.verified ? " · checked" : ""}</span></span>
                  </label></li>))}</ul>
              ) : <p className="p-5 text-sm text-slate">No documents on the student&apos;s record yet.</p>}
              <p className="border-t border-line px-5 py-3 text-xs text-slate">Up to 20 MB in total. Offer letters, CoEs and visa grants are left out.</p>
            </Card>
            <Card>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="record" defaultChecked={!alreadySubmitted} className="mt-1" /> Record this as the submission to {a.partner ?? "the institution"} (by email)</label>
              {alreadySubmitted && <p className="mt-1 text-xs text-slate">A submission is already recorded on this application, so this is unticked. Tick it only if this email is a new submission.</p>}
              {routes.length > 0 && (
                <Field label="Route" htmlFor="route_id" className="mt-3">
                  <select className="select" id="route_id" name="route_id" defaultValue={emailRoute?.id ?? ""}><option value="">Direct to the institution</option>{routes.map((r) => <option key={r.id} value={r.id}>{ROUTE_LABEL[r.route_kind]}{r.via ? `: ${r.via}` : ""} ({METHOD_LABEL[r.method].toLowerCase()})</option>)}</select>
                </Field>
              )}
              <div className="mt-4"><Submit pending="Sending…">Send email</Submit></div>
            </Card>
          </div>
        </ActionForm>
      )}
    </>
  );
}
