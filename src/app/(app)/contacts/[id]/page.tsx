import Link from "next/link";
import { notFound } from "next/navigation";
import { can, getCurrentUser, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { visibleStaff, EDU_LEVELS, FIELDS, TESTS } from "@/lib/lookups";
import { waLink } from "@/lib/phone";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { Avatar, Card, Dl, Empty, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { DEST_LABEL, LEVEL_LABEL, SOURCE_LABEL, STAGE_LABEL, TEST_LABEL, VISA_STATUS_LABEL, ago, date, dateTime, daysUntil, money } from "@/lib/format";
import { addEducation, addNote, addTest, assignOwner, deleteContact, deleteRow, revealSensitive, setStage } from "../actions";
import { addTask } from "../../tasks/actions";
import { uploadDocument, verifyDocument } from "../../documents/actions";
import { cancelUploadLink, createUploadLink, emailUploadLink } from "../upload-link-actions";
import { CopyField } from "@/components/copy-field";
import { publicBase } from "@/lib/qr";
import { LINK_DAYS, STUDENT_DOC_TYPES, tokenOf } from "@/lib/upload-links";

type Contact = {
  id: string; ref: string; stage: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; whatsapp: string | null;
  dob: string | null; gender: string | null; nationality: string | null; passport_no: string | null; passport_expiry: string | null; address: string | null;
  city: string | null; source: string | null; source_detail: string | null; interested_destinations: string[]; interested_level: string | null;
  interested_field: string | null; intake: string | null; budget_amount: number | null; budget_currency: string | null; onshore: boolean;
  branch_id: number; branch: string; branch_tz: string; owner_id: string | null; owner: string | null; owner_photo: string | null; tags: string[];
  lost_reason: string | null; guardian_name: string | null; guardian_phone: string | null; consent_at: string | null; consent_source: string | null;
  created_at: string; created_by_name: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only name the page for people allowed to see this student.
  const user = await getCurrentUser();
  if (!user || !(await loadContactForUser(user, id))) return { title: "Student" };
  const c = await q1<{ name: string }>("select first_name || ' ' || coalesce(last_name,'') name from contacts where id::text=$1", [id]);
  return { title: c?.name ?? "Student" };
}

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reveal?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { reveal } = await searchParams;
  if (!can(user, "contacts.view") || !(await loadContactForUser(user, id))) notFound();

  const c = (await q1<Contact>(
    `select c.*, b.name branch, b.timezone branch_tz, u.name owner, u.photo_url owner_photo, cb.name created_by_name
       from contacts c join branches b on b.id=c.branch_id left join users u on u.id=c.owner_id left join users cb on cb.id=c.created_by
      where c.id=$1`, [id]))!;

  const [edu, tests, apps, visas, oshc, classes, invoices, docs, tasks, timeline, staff] = await Promise.all([
    q<{ id: number; level: string; institution: string | null; result: string | null; year: number | null }>("select * from contact_education where contact_id=$1 order by year desc nulls last", [id]),
    q<{ id: number; test: string; overall: number; listening: number | null; reading: number | null; writing: number | null; speaking: number | null; test_date: string | null; expiry: string | null }>("select * from contact_tests where contact_id=$1 order by test_date desc nulls last", [id]),
    q<{ id: string; ref: string; destination: string | null; partner: string | null; course: string | null; intake: string | null; stage: string; status: string; channel: string; owner: string | null; updated_at: string }>(
      `select a.id, a.ref, a.destination, p.name partner, coalesce(co.title, a.course_title) course, a.intake, s.name stage, a.status, a.channel, u.name owner, a.updated_at
         from applications a join workflow_stages s on s.id=a.stage_id left join partners p on p.id=a.partner_id left join courses co on co.id=a.course_id left join users u on u.id=a.owner_id
        where a.contact_id=$1 order by a.created_at desc`, [id]),
    q<{ id: string; ref: string; destination: string; subclass: string | null; status: string; lodged_on: string | null; visa_expiry: string | null; agent: string | null }>(
      "select v.id, v.ref, v.destination, v.subclass, v.status, v.lodged_on, v.visa_expiry, u.name agent from visa_cases v left join users u on u.id=v.agent_id where v.contact_id=$1 order by v.created_at desc", [id]),
    q<{ id: string; insurer: string | null; policy_no: string | null; cover_type: string; start_date: string | null; end_date: string | null; status: string; premium: number | null; currency: string }>(
      "select o.id, p.name insurer, o.policy_no, o.cover_type, o.start_date, o.end_date, o.status, o.premium, o.currency from oshc_policies o left join partners p on p.id=o.insurer_id where o.contact_id=$1 order by o.created_at desc", [id]),
    q<{ id: number; name: string; status: string; test: string }>("select cl.id, cl.name, e.status, cl.test from class_enrolments e join classes cl on cl.id=e.class_id where e.contact_id=$1", [id]),
    can(user, "finance.view") ? q<{ id: string; number: string; kind: string; total: number; paid: number; currency: string; status: string; issue_date: string }>(
      "select id, number, kind, total, paid, currency, status, issue_date from invoices where contact_id=$1 order by issue_date desc", [id]) : Promise.resolve([]),
    q<{ id: string; doc_type: string; filename: string; size_bytes: number | null; expiry: string | null; verified_at: string | null; created_at: string; uploader: string | null; by_student: boolean }>(
      "select d.id, d.doc_type, d.filename, d.size_bytes, d.expiry, d.verified_at, d.created_at, u.name uploader, d.via_link_id is not null by_student from documents d left join users u on u.id=d.uploaded_by where d.contact_id=$1 order by d.created_at desc", [id]),
    q<{ id: number; title: string; due_at: string | null; status: string; assignee: string | null }>(
      "select t.id, t.title, t.due_at, t.status, u.name assignee from tasks t left join users u on u.id=t.assignee_id where t.contact_id=$1 order by t.status, t.due_at nulls last limit 20", [id]),
    q<{ id: number; kind: string; body: string | null; created_at: string; who: string | null }>(
      "select a.id, a.kind, a.body, a.created_at, u.name who from activities a left join users u on u.id=a.user_id where a.contact_id=$1 order by a.created_at desc limit 60", [id]),
    visibleStaff(user),
  ]);

  const name = `${c.first_name} ${c.last_name ?? ""}`.trim();
  const linkStaff = user.scope !== "agent" && can(user, "documents.manage");
  const [links, base] = linkStaff ? await Promise.all([
    q<{ id: number; token_enc: string; expires_at: string; created_at: string; uploads: number; last_used_at: string | null; app_ref: string | null; by: string | null }>(
      `select l.id, l.token_enc, l.expires_at, l.created_at, l.uploads, l.last_used_at, a.ref app_ref, u.name by from upload_links l
         left join applications a on a.id=l.application_id left join users u on u.id=l.created_by
        where l.contact_id=$1 and l.revoked_at is null and l.expires_at > now() order by l.created_at desc`, [id]),
    publicBase(),
  ]) : [[], ""];
  const agent = user.scope === "agent"; // sub-agents see the student's file and applications, not the branch's internal work
  const edit = can(user, "contacts.edit");
  const showPassport = reveal === "1" && can(user, "contacts.sensitive");
  const masked = c.passport_no ? c.passport_no.replace(/.(?=.{3})/g, "•") : null;
  const pExp = daysUntil(c.passport_expiry);
  const fieldLabel = Object.fromEntries(FIELDS)[c.interested_field ?? ""] ?? c.interested_field;

  return (
    <>
      <PageHeader
        back={{ href: "/contacts", label: "Students & leads" }}
        title={<span className="flex flex-wrap items-center gap-3">{name}<span className={`badge ${c.stage === "client" ? "badge-ok" : c.stage === "lead" ? "badge-warn" : c.stage === "archived" ? "badge-grey" : ""}`}>{STAGE_LABEL[c.stage]}</span></span>}
        subtitle={<>{c.ref} · {c.branch} · added {date(c.created_at)}{c.created_by_name ? ` by ${c.created_by_name}` : ""}</>}
        actions={<>
          {c.whatsapp && <a className="btn" href={waLink(c.whatsapp)!} target="_blank" rel="noopener">WhatsApp</a>}
          {c.phone && <a className="btn" href={`tel:${c.phone}`}>Call</a>}
          {edit && <Link className="btn" href={`/contacts/${c.id}/edit`}>Edit</Link>}
          {can(user, "applications.edit") && <Link className="btn btn-primary" href={`/applications/new?contact=${c.id}`}>Start application</Link>}
        </>}
      />
      {c.stage === "archived" && c.lost_reason && <div className="mb-4"><Notice tone="warn">Archived: {c.lost_reason}</Notice></div>}
      {pExp !== null && pExp < 180 && <div className="mb-4"><Notice tone={pExp < 0 ? "red" : "warn"}>{pExp < 0 ? "The passport has expired." : `The passport expires in ${pExp} days (${date(c.passport_expiry)}). Most visas need at least 6 months' validity.`}</Notice></div>}

      <div className={agent ? "grid gap-6" : "grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"}>
        <div className="grid min-w-0 content-start gap-6">
          <Card title="Details">
            <div className="grid gap-6 md:grid-cols-2">
              <Dl rows={[
                ["Mobile", c.phone ? <span className="tnum">{c.phone}</span> : null],
                ["WhatsApp", c.whatsapp ? <a className="tnum text-navy" href={waLink(c.whatsapp)!} target="_blank" rel="noopener">{c.whatsapp}</a> : null],
                ["Email", c.email ? <a className="text-navy break-all" href={`mailto:${c.email}`}>{c.email}</a> : null],
                ["Date of birth", c.dob ? date(c.dob) : null],
                ["City", c.city],
                ["Guardian", c.guardian_name ? `${c.guardian_name}${c.guardian_phone ? ` · ${c.guardian_phone}` : ""}` : null],
                ["Passport", c.passport_no ? (
                  showPassport ? <span className="tnum">{c.passport_no}</span> :
                    <span className="flex flex-wrap items-center gap-2"><span className="tnum">{masked}</span>{can(user, "contacts.sensitive") && <form action={revealSensitive}><input type="hidden" name="id" value={c.id} /><button className="text-xs font-semibold text-red underline">Show (logged)</button></form>}</span>
                ) : null],
                ["Passport expiry", c.passport_expiry ? date(c.passport_expiry) : null],
              ]} />
              <Dl rows={[
                ["Wants to study in", c.interested_destinations.map((d) => DEST_LABEL[d] ?? d).join(", ") || null],
                ["Level", c.interested_level ? LEVEL_LABEL[c.interested_level] : null],
                ["Subject", fieldLabel],
                ["Intake", c.intake],
                ["Yearly budget", c.budget_amount ? money(c.budget_amount, c.budget_currency) : null],
                ["Onshore", c.onshore ? "Yes, already in the destination country" : "No"],
                ["Source", `${SOURCE_LABEL[c.source ?? ""] ?? c.source ?? "—"}${c.source_detail ? ` · ${c.source_detail}` : ""}`],
                ["Consent", c.consent_at ? `${date(c.consent_at)}${c.consent_source ? ` · ${c.consent_source}` : ""}` : <span className="badge badge-red">Not recorded</span>],
              ]} />
            </div>
            {c.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{c.tags.map((t) => <span key={t} className="badge badge-grey">{t}</span>)}</div>}
          </Card>

          <Card title={`Applications (${apps.length})`} actions={can(user, "applications.edit") ? <Link href={`/applications/new?contact=${c.id}`} className="btn btn-sm">Start application</Link> : null} pad={false}>
            {apps.length ? (
              <TableWrap><table className="tbl">
                <thead><tr><th>Ref</th><th>Institution and course</th><th>Intake</th><th>Step</th><th>Via</th><th>Counsellor</th></tr></thead>
                <tbody>{apps.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/applications/${a.id}`}>{a.ref}</Link><div className="text-xs text-slate">{DEST_LABEL[a.destination ?? ""] ?? a.destination}</div></td>
                    <td>{a.partner ?? "—"}<div className="text-xs text-slate">{a.course}</div></td>
                    <td>{a.intake ?? "—"}</td>
                    <td><span className={`badge ${a.status === "won" ? "badge-ok" : a.status === "lost" ? "badge-grey" : ""}`}>{a.stage}</span></td>
                    <td className="capitalize">{a.channel}</td>
                    <td>{a.owner ?? "—"}</td>
                  </tr>))}</tbody>
              </table></TableWrap>
            ) : <Empty title="No applications yet">Start one when the student has chosen a course.</Empty>}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Education">
              {edu.length ? (
                <ul className="space-y-2 text-sm">{edu.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3">
                    <span><b>{Object.fromEntries(EDU_LEVELS)[e.level] ?? e.level}</b>{e.result ? ` · ${e.result}` : ""}{e.year ? ` · ${e.year}` : ""}<span className="block text-xs text-slate">{e.institution}</span></span>
                    {edit && <form action={deleteRow}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="table" value="contact_education" /><input type="hidden" name="row_id" value={e.id} /><ConfirmButton className="text-xs text-slate underline" confirmLabel="Remove?">Remove</ConfirmButton></form>}
                  </li>))}</ul>
              ) : <p className="text-sm text-slate">No qualifications added.</p>}
              {edit && (
                <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-red">Add a qualification</summary>
                  <ActionForm action={addEducation} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={c.id} />
                    <Field label="Qualification" htmlFor="edu_level"><select className="select" id="edu_level" name="level" required>{EDU_LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                    <Field label="Result" htmlFor="edu_result"><input className="input" id="edu_result" name="result" placeholder="GPA 4.50 / 5" /></Field>
                    <Field label="Institution" htmlFor="edu_inst"><input className="input" id="edu_inst" name="institution" /></Field>
                    <Field label="Year" htmlFor="edu_year"><input className="input tnum" id="edu_year" name="year" type="number" min="1980" max="2035" /></Field>
                    <div><Submit className="btn btn-sm btn-navy">Add</Submit></div>
                  </ActionForm>
                </details>)}
            </Card>

            <Card title="English tests">
              {tests.length ? (
                <ul className="space-y-2 text-sm">{tests.map((t) => {
                  const exp = daysUntil(t.expiry);
                  return (
                    <li key={t.id} className="flex items-start justify-between gap-3">
                      <span><b>{TEST_LABEL[t.test] ?? t.test} {t.overall}</b>{t.listening !== null && <span className="text-slate"> · L {t.listening} R {t.reading} W {t.writing} S {t.speaking}</span>}
                        <span className="block text-xs text-slate">{t.test_date ? `Taken ${date(t.test_date)}` : ""}{exp !== null ? ` · ${exp < 0 ? "expired" : `valid ${exp} more days`}` : ""}</span></span>
                      {edit && <form action={deleteRow}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="table" value="contact_tests" /><input type="hidden" name="row_id" value={t.id} /><ConfirmButton className="text-xs text-slate underline" confirmLabel="Remove?">Remove</ConfirmButton></form>}
                    </li>);
                })}</ul>
              ) : <p className="text-sm text-slate">No test results added.</p>}
              {edit && (
                <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-red">Add a test result</summary>
                  <ActionForm action={addTest} resetOnSuccess className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <input type="hidden" name="id" value={c.id} />
                    <Field label="Test" htmlFor="t_test" className="col-span-2"><select className="select" id="t_test" name="test">{TESTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                    <Field label="Overall" htmlFor="t_over" className="col-span-2"><input className="input tnum" id="t_over" name="overall" type="number" step="0.5" min="0" max="120" required /></Field>
                    {["listening", "reading", "writing", "speaking"].map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} htmlFor={`t_${k}`}><input className="input tnum" id={`t_${k}`} name={k} type="number" step="0.5" min="0" max="90" /></Field>)}
                    <Field label="Test date" htmlFor="t_date" className="col-span-2"><input className="input" id="t_date" name="test_date" type="date" /></Field>
                    <Field label="Valid until" htmlFor="t_exp" className="col-span-2"><input className="input" id="t_exp" name="expiry" type="date" /></Field>
                    <div className="col-span-2"><Submit className="btn btn-sm btn-navy">Add</Submit></div>
                  </ActionForm>
                </details>)}
            </Card>
          </div>

          <Card title={`Documents (${docs.length})`} pad={false}>
            {docs.length ? (
              <TableWrap><table className="tbl">
                <thead><tr><th>Document</th><th>Type</th><th>Expiry</th><th>Uploaded</th><th>Checked</th></tr></thead>
                <tbody>{docs.map((d) => (
                  <tr key={d.id}>
                    <td><a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{d.filename}</a><div className="text-xs text-slate">{d.size_bytes ? `${Math.ceil(d.size_bytes / 1024)} KB` : ""}</div></td>
                    <td className="capitalize">{d.doc_type === "cv" ? "CV" : d.doc_type === "ielts" ? "English test" : d.doc_type.replace(/_/g, " ")}</td>
                    <td>{d.expiry ? date(d.expiry) : "—"}</td>
                    <td className="whitespace-nowrap">{ago(d.created_at)}<div className="text-xs text-slate">{d.by_student ? "Student (upload link)" : d.uploader}</div></td>
                    <td>{d.verified_at ? <span className="badge badge-ok">Checked</span> : linkStaff ? (
                      <form action={verifyDocument} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={d.id} /><span className="badge badge-warn">To check</span><button className="text-xs font-semibold text-navy underline">Mark checked</button></form>
                    ) : <span className="badge badge-grey">Not yet</span>}</td>
                  </tr>))}</tbody>
              </table></TableWrap>
            ) : <Empty title="No documents yet">Upload passports, transcripts, test results and offer letters here.</Empty>}
            {can(user, "documents.manage") && (
              <div className="border-t border-line p-5">
                <ActionForm action={uploadDocument} resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <input type="hidden" name="contact_id" value={c.id} />
                  <Field label="File (PDF, JPG, PNG or Word, up to 10 MB)" htmlFor="doc_file"><input className="input !py-1.5" id="doc_file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /></Field>
                  <Field label="Type" htmlFor="doc_type">
                    <select className="select" id="doc_type" name="doc_type">
                      {["passport", "transcript", "certificate", "ielts", "sop", "cv", "financials", "offer", "coe", "cas", "i20", "visa_grant", "oshc", "reference", "other"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                  </Field>
                  <Field label="Expiry (if any)" htmlFor="doc_exp"><input className="input" id="doc_exp" name="expiry" type="date" /></Field>
                  <Submit className="btn btn-navy" pending="Uploading…">Upload</Submit>
                </ActionForm>
              </div>
            )}
          </Card>

          {linkStaff && (
            <Card title="Student upload link" pad={false}>
              <div className="p-5">
                <p className="mb-4 text-sm text-slate">Send {c.first_name} a private link to upload documents from their phone, with no account or password. Uploads arrive here marked &ldquo;To check&rdquo;, and you get a task. If the application is with the admission team, they see the upload too.</p>
                <ActionForm action={createUploadLink} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="contact_id" value={c.id} />
                  <Field label="For" htmlFor="ul_app" hint="With an application, the student sees its document checklist.">
                    <select className="select" id="ul_app" name="application_id" defaultValue={apps.find((a) => a.status === "open")?.id ?? ""}>
                      <option value="">No application: choose documents below</option>
                      {apps.map((a) => <option key={a.id} value={a.id}>{a.ref} · {a.partner ?? "Application"}</option>)}
                    </select>
                  </Field>
                  <Field label="Link works for" htmlFor="ul_days"><select className="select" id="ul_days" name="days" defaultValue="7">{LINK_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field>
                  <style>{`.ul-types{display:none}form:has(#ul_app option[value=""]:checked) .ul-types{display:grid}`}</style>
                  <fieldset className="ul-types gap-1.5 sm:col-span-2"><legend className="mb-1 text-sm font-semibold">Documents to ask for</legend>
                    <div className="flex flex-wrap gap-2">{STUDENT_DOC_TYPES.filter(([k]) => k !== "other").map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky"><input type="checkbox" name="doc_type" value={k} defaultChecked={k === "passport" || k === "transcript"} /> {l}</label>))}
                    </div>
                  </fieldset>
                  <Field label="Message to the student (optional)" htmlFor="ul_note" className="sm:col-span-2"><input className="input" id="ul_note" name="note" maxLength={500} placeholder="e.g. Please upload all pages of your bank statement" /></Field>
                  <div><Submit className="btn btn-navy" pending="Creating…">Create upload link</Submit></div>
                </ActionForm>
              </div>
              {links.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">{links.map((l) => {
                  const url = `${base}/u/${tokenOf(l.token_enc)}`;
                  const wa = waLink(c.whatsapp ?? c.phone);
                  return (
                    <li key={l.id} className="grid gap-3 px-5 py-4">
                      <p className="text-sm"><b>{l.app_ref ? `For ${l.app_ref}` : "General documents"}</b><span className="text-slate"> · made {ago(l.created_at)}{l.by ? ` by ${l.by}` : ""} · works until {date(l.expires_at)} · {l.uploads} upload{l.uploads === 1 ? "" : "s"}{l.last_used_at ? `, last ${ago(l.last_used_at)}` : ""}</span></p>
                      <CopyField id={`ul-${l.id}`} label="Private link: send it only to the student" value={url} />
                      <div className="flex flex-wrap items-center gap-2">
                        {wa && <a className="btn btn-sm" target="_blank" rel="noopener" href={`${wa}?text=${encodeURIComponent(`Hi ${c.first_name}, please upload your documents for Eplanet International here (private link, works until ${date(l.expires_at)}): ${url}`)}`}>Send on WhatsApp</a>}
                        {c.email && <ActionForm action={emailUploadLink} className="contents"><input type="hidden" name="id" value={l.id} /><Submit className="btn btn-sm" pending="Sending…">Email to {c.email}</Submit></ActionForm>}
                        <form action={cancelUploadLink}><input type="hidden" name="id" value={l.id} /><ConfirmButton className="btn btn-sm" confirmLabel="Click again to cancel the link">Cancel link</ConfirmButton></form>
                      </div>
                    </li>);
                })}</ul>
              )}
            </Card>
          )}

          {!agent && (visas.length > 0 || can(user, "visa.edit")) && (
            <Card title="Visa cases" actions={can(user, "visa.edit") ? <Link href={`/visa/new?contact=${c.id}`} className="btn btn-sm">Open visa case</Link> : null} pad={false}>
              {visas.length ? (
                <TableWrap><table className="tbl"><thead><tr><th>Ref</th><th>Visa</th><th>Status</th><th>Lodged</th><th>Expiry</th><th>Agent</th></tr></thead>
                  <tbody>{visas.map((v) => (
                    <tr key={v.id}><td><Link href={`/visa/${v.id}`}>{v.ref}</Link></td><td>{DEST_LABEL[v.destination] ?? v.destination} {v.subclass}</td>
                      <td><span className={`badge ${v.status === "granted" ? "badge-ok" : v.status === "refused" ? "badge-red" : ""}`}>{VISA_STATUS_LABEL[v.status]}</span></td>
                      <td>{date(v.lodged_on)}</td><td>{date(v.visa_expiry)}</td><td>{v.agent ?? "—"}</td></tr>))}</tbody></table></TableWrap>
              ) : <Empty title="No visa cases" />}
            </Card>
          )}

          {!agent && (oshc.length > 0 || classes.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="OSHC">
                {oshc.length ? <ul className="space-y-2 text-sm">{oshc.map((o) => <li key={o.id}><b>{o.insurer ?? "Insurer"}</b> · {o.cover_type} · <span className="capitalize">{o.status}</span><span className="block text-xs text-slate">{date(o.start_date)} – {date(o.end_date)} · {money(o.premium, o.currency)}</span></li>)}</ul> : <p className="text-sm text-slate">No OSHC policies.</p>}
              </Card>
              <Card title="Classes">
                {classes.length ? <ul className="space-y-2 text-sm">{classes.map((k) => <li key={k.id}><Link className="font-semibold text-navy" href={`/classes/${k.id}`}>{k.name}</Link> · <span className="capitalize">{k.status}</span></li>)}</ul> : <p className="text-sm text-slate">Not enrolled in a class.</p>}
              </Card>
            </div>
          )}

          {can(user, "finance.view") && (
            <Card title="Invoices and receipts" actions={can(user, "finance.edit") ? <Link href={`/finance/new?contact=${c.id}`} className="btn btn-sm">New invoice</Link> : null} pad={false}>
              {invoices.length ? (
                <TableWrap><table className="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
                  <tbody>{invoices.map((i) => <tr key={i.id}><td><Link href={`/finance/${i.id}`}>{i.number}</Link></td><td>{date(i.issue_date)}</td><td className="tnum">{money(i.total, i.currency)}</td><td className="tnum">{money(i.paid, i.currency)}</td><td><span className={`badge ${i.status === "paid" ? "badge-ok" : i.status === "void" ? "badge-grey" : "badge-warn"}`}>{i.status.replace("_", " ")}</span></td></tr>)}</tbody></table></TableWrap>
              ) : <Empty title="No invoices" />}
            </Card>
          )}
        </div>

        {!agent && <aside className="grid min-w-0 content-start gap-6">
          <Card title="Counsellor and status">
            <div className="flex items-center gap-3">
              <Avatar name={c.owner ?? "?"} photo={c.owner_photo} size={40} />
              <div><p className="font-semibold">{c.owner ?? "Unassigned"}</p><p className="text-xs text-slate">{c.branch}</p></div>
            </div>
            {edit && (
              <div className="mt-4 grid gap-3">
                {user.scope !== "own" && (
                  <form action={assignOwner} className="flex gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <select className="select" name="owner_id" defaultValue={c.owner_id ?? ""} aria-label="Assign counsellor"><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    <button className="btn btn-sm">Assign</button>
                  </form>
                )}
                <ActionForm action={setStage} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <select className="select flex-1" name="stage" defaultValue={c.stage} aria-label="Status">{Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input className="input flex-1 basis-full" name="lost_reason" placeholder="Reason, if archiving (e.g. chose another agent)" aria-label="Reason" />
                  <Submit className="btn btn-sm">Update status</Submit>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title="Add to timeline">
            <ActionForm action={addNote} resetOnSuccess className="grid gap-3">
              <input type="hidden" name="id" value={c.id} />
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
                {[["note", "Note"], ["call", "Call"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["meeting", "Meeting"]].map(([k, l], i) => (
                  <label key={k} className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-white">
                    <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="sr-only" />{l}
                  </label>))}
              </div>
              <textarea className="textarea" name="body" placeholder="What happened or was agreed?" aria-label="Note" required />
              <Submit className="btn btn-sm btn-navy">Save</Submit>
            </ActionForm>
          </Card>

          <Card title="Tasks">
            {tasks.length ? (
              <ul className="mb-4 space-y-2 text-sm">{tasks.map((t) => (
                <li key={t.id} className={t.status === "done" ? "text-slate line-through" : ""}>{t.title}<span className="block text-xs text-slate no-underline">{t.assignee ?? "Unassigned"}{t.due_at ? ` · due ${dateTime(t.due_at, c.branch_tz)}` : ""}
                  {t.status !== "done" && t.due_at && new Date(t.due_at).getTime() < Date.now() && <span className="badge badge-red ml-2">Overdue</span>}</span></li>))}</ul>
            ) : <p className="mb-4 text-sm text-slate">No tasks for this student.</p>}
            <ActionForm action={addTask} resetOnSuccess className="grid gap-2">
              <input type="hidden" name="contact_id" value={c.id} />
              <input type="hidden" name="branch_id" value={c.branch_id} />
              <input className="input" name="title" placeholder="e.g. Follow up on bank statement" aria-label="Task" required />
              <div className="grid grid-cols-2 gap-2">
                <input className="input" type="datetime-local" name="due_at" aria-label="Due" />
                <select className="select" name="assignee_id" defaultValue={c.owner_id ?? user.id} aria-label="Assign to">{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
              <Submit className="btn btn-sm">Add task</Submit>
            </ActionForm>
          </Card>

          <Card title="Timeline" pad={false}>
            <ol className="divide-y divide-line">
              {timeline.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p className="flex items-center justify-between gap-2 text-xs text-slate"><span className="font-semibold uppercase tracking-wide">{a.kind}</span><span>{dateTime(a.created_at, c.branch_tz)}</span></p>
                  {a.body && <p className="mt-1 whitespace-pre-wrap">{a.body}</p>}
                  {a.who && <p className="mt-0.5 text-xs text-slate">{a.who}</p>}
                </li>))}
            </ol>
          </Card>

          {can(user, "contacts.delete") && (
            <form action={deleteContact} className="text-right">
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton className="text-xs font-semibold text-red underline" confirmLabel="Click again to delete permanently">Delete this record</ConfirmButton>
            </form>
          )}
        </aside>}
      </div>
    </>
  );
}
