import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { visibleStaff } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Dl, Field, Notice, PageHeader } from "@/components/ui";
import { DEST_LABEL, VISA_STATUS_LABEL, date, dateTime, daysUntil } from "@/lib/format";
import { updateVisaCase } from "../actions";
import { uploadDocument } from "../../documents/actions";

export const metadata = { title: "Visa case" };

export default async function VisaCase({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("visa.view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const v = await q1<{
    id: string; ref: string; contact_id: string; student: string; contact_ref: string; passport_expiry: string | null; application_id: string | null; app_ref: string | null;
    branch_id: number; branch: string; tz: string; agent_id: string | null; agent: string | null; marn: string | null; destination: string; subclass: string | null; status: string;
    lodged_on: string | null; trn: string | null; decision_on: string | null; visa_expiry: string | null; notes: string | null; created_at: string;
  }>(
    `select v.*, c.first_name || ' ' || coalesce(c.last_name,'') student, c.ref contact_ref, c.passport_expiry, a.ref app_ref, b.name branch, b.timezone tz, u.name agent, u.marn
       from visa_cases v join contacts c on c.id=v.contact_id join branches b on b.id=v.branch_id left join applications a on a.id=v.application_id left join users u on u.id=v.agent_id
      where v.id=$1`, [id]);
  if (!v || !canSeeBranch(user, v.branch_id)) notFound();
  const [docs, log, staff] = await Promise.all([
    q<{ id: string; filename: string; doc_type: string; created_at: string }>("select id, filename, doc_type, created_at from documents where visa_case_id=$1 order by created_at desc", [id]),
    q<{ id: number; body: string; created_at: string; who: string | null }>("select a.id, a.body, a.created_at, u.name who from activities a left join users u on u.id=a.user_id where a.contact_id=$1 and a.kind='visa' order by a.created_at desc limit 30", [v.contact_id]),
    visibleStaff(user),
  ]);
  const pexp = daysUntil(v.passport_expiry);
  const vexp = daysUntil(v.visa_expiry);
  const edit = can(user, "visa.edit");
  return (
    <>
      <PageHeader back={{ href: "/visa", label: "Visa cases" }}
        title={<span className="flex flex-wrap items-center gap-3">{v.ref}: {DEST_LABEL[v.destination] ?? v.destination} {v.subclass}<span className={`badge ${v.status === "granted" ? "badge-ok" : v.status === "refused" ? "badge-red" : ""}`}>{VISA_STATUS_LABEL[v.status]}</span></span>}
        subtitle={<><Link className="font-semibold text-navy no-underline" href={`/contacts/${v.contact_id}`}>{v.student} ({v.contact_ref})</Link> · {v.branch}{v.app_ref && <> · application <Link className="text-navy" href={`/applications/${v.application_id}`}>{v.app_ref}</Link></>}</>} />
      {v.destination === "AU" && !v.marn && <div className="mb-4"><Notice tone="red">No registered migration agent is assigned. Australian visa advice must be given by an agent with a current MARN.</Notice></div>}
      {pexp !== null && pexp < 180 && <div className="mb-4"><Notice tone="warn">The student's passport {pexp < 0 ? "has expired" : `expires in ${pexp} days`}.</Notice></div>}
      {vexp !== null && vexp >= 0 && vexp < 90 && <div className="mb-4"><Notice tone="warn">This visa expires in {vexp} days ({date(v.visa_expiry)}). Contact the student about their next visa.</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {edit ? (
            <Card title="Update case">
              <ActionForm action={updateVisaCase} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={v.id} />
                <Field label="Status" htmlFor="status"><select className="select" id="status" name="status" defaultValue={v.status}>{Object.entries(VISA_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Registered agent" htmlFor="agent_id"><select className="select" id="agent_id" name="agent_id" defaultValue={v.agent_id ?? ""}><option value="">None</option>{staff.filter((s) => s.marn).map((s) => <option key={s.id} value={s.id}>{s.name} (MARN {s.marn})</option>)}</select></Field>
                <Field label="Visa type" htmlFor="subclass"><input className="input" id="subclass" name="subclass" defaultValue={v.subclass ?? ""} /></Field>
                <Field label="Application / transaction number" htmlFor="trn"><input className="input tnum" id="trn" name="trn" defaultValue={v.trn ?? ""} /></Field>
                <Field label="Lodged on" htmlFor="lodged_on"><input className="input" type="date" id="lodged_on" name="lodged_on" defaultValue={v.lodged_on ?? ""} /></Field>
                <Field label="Decision on" htmlFor="decision_on"><input className="input" type="date" id="decision_on" name="decision_on" defaultValue={v.decision_on ?? ""} /></Field>
                <Field label="Visa expiry (if granted)" htmlFor="visa_expiry"><input className="input" type="date" id="visa_expiry" name="visa_expiry" defaultValue={v.visa_expiry ?? ""} /></Field>
                <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><textarea className="textarea" id="notes" name="notes" defaultValue={v.notes ?? ""} /></Field>
                <div><Submit>Save</Submit></div>
              </ActionForm>
            </Card>
          ) : (
            <Card title="Case"><Dl rows={[["Lodged", date(v.lodged_on)], ["Reference", v.trn], ["Decision", date(v.decision_on)], ["Visa expiry", date(v.visa_expiry)], ["Notes", v.notes]]} /></Card>
          )}
          <Card title={`Visa documents (${docs.length})`}>
            {docs.length ? <ul className="mb-4 space-y-1.5 text-sm">{docs.map((d) => <li key={d.id}><a className="font-semibold text-navy" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{d.filename}</a> <span className="text-xs text-slate">{d.doc_type.replace(/_/g, " ")} · {date(d.created_at)}</span></li>)}</ul> : <p className="mb-4 text-sm text-slate">No visa documents yet.</p>}
            {can(user, "documents.manage") && (
              <ActionForm action={uploadDocument} resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-end">
                <input type="hidden" name="contact_id" value={v.contact_id} /><input type="hidden" name="visa_case_id" value={v.id} />
                {v.application_id && <input type="hidden" name="application_id" value={v.application_id} />}
                <Field label="File" htmlFor="vfile"><input className="input !py-1.5" id="vfile" type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /></Field>
                <Field label="Type" htmlFor="vtype"><select className="select" id="vtype" name="doc_type">{["visa_application", "visa_grant", "visa_refusal", "health", "biometrics", "financials", "gs_statement", "other"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Field>
                <Submit className="btn btn-navy" pending="Uploading…">Upload</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
        <aside className="grid min-w-0 content-start gap-6">
          <Card title="Summary"><Dl rows={[["Agent", v.agent], ["MARN", v.marn], ["Opened", date(v.created_at)], ["Passport expiry", date(v.passport_expiry)]]} /></Card>
          <Card title="Visa history" pad={false}>
            {log.length ? (
              <ol className="divide-y divide-line">{log.map((l) => <li key={l.id} className="px-5 py-3 text-sm"><p>{l.body}</p><p className="text-xs text-slate">{dateTime(l.created_at, v.tz)}{l.who ? ` · ${l.who}` : ""}</p></li>)}</ol>
            ) : <p className="px-5 py-4 text-sm text-slate">No updates recorded yet. Status changes appear here.</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
