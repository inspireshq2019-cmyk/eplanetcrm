import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { loadApplicationForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { visibleStaff } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Dl, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { CHANNEL_LABEL, DEST_LABEL, date, dateTime, money } from "@/lib/format";
import { moveStage, setChecklist, updateApplication } from "../actions";
import { uploadDocument, verifyDocument } from "../../documents/actions";
import { AdmissionsPanel, MessagesCard } from "./admissions-panel";

export const metadata = { title: "Application" };

// Australian rule: from 1 April 2026 providers may not pay agents commission for onshore transfers,
// unless the student was accepted by the provider on or before 31 March 2026.
function commissionEligibility(a: { destination: string | null; onshore_transfer: boolean; accepted_date: string | null }) {
  if (a.destination !== "AU" || !a.onshore_transfer) return { ok: true as const };
  if (a.accepted_date && a.accepted_date <= "2026-03-31") return { ok: true as const, note: "Onshore transfer accepted on or before 31 March 2026, so commission is still allowed." };
  return { ok: false as const, note: "Onshore transfer in Australia: the provider can't pay commission for this student. Charge the student a service fee instead." };
}

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ emailed?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { emailed } = await searchParams;
  if (!(await loadApplicationForUser(user, id))) notFound();

  const a = (await q1<{
    id: string; ref: string; contact_id: string; contact_name: string; contact_ref: string; branch: string; branch_id: number; branch_tz: string; owner_id: string | null; owner: string | null;
    workflow_id: number; workflow: string; stage_id: number; stage: string; destination: string | null; partner_id: number | null; partner: string | null;
    course_id: number | null; course: string | null; course_url: string | null; intake: string | null; channel: string; student_id_at_provider: string | null;
    tuition_fee: number | null; fee_currency: string | null; onshore_transfer: boolean; accepted_date: string | null; status: string; lost_reason: string | null; created_at: string;
    commission_pct: number | null; adm_status: string | null; adm_request: string | null; adm_officer_id: string | null; adm_officer: string | null; adm_sent_at: string | null;
  }>(
    `select a.*, ao.name adm_officer, c.first_name || ' ' || coalesce(c.last_name,'') contact_name, c.ref contact_ref, b.name branch, b.timezone branch_tz, u.name owner,
            w.name workflow, s.name stage, p.name partner, coalesce(co.title, a.course_title) course, co.url course_url,
            (select commission_pct from partner_agreements pa where pa.partner_id=a.partner_id and (pa.valid_to is null or pa.valid_to >= current_date) order by valid_from desc nulls last limit 1) commission_pct
       from applications a join contacts c on c.id=a.contact_id join branches b on b.id=a.branch_id left join users u on u.id=a.owner_id
       join workflows w on w.id=a.workflow_id join workflow_stages s on s.id=a.stage_id left join partners p on p.id=a.partner_id left join courses co on co.id=a.course_id
       left join users ao on ao.id=a.adm_officer_id
      where a.id=$1`, [id]))!;

  const [stages, history, checklist, docs, staff] = await Promise.all([
    q<{ id: number; position: number; name: string; outcome: string | null; commission_trigger: boolean }>("select id, position, name, outcome, commission_trigger from workflow_stages where workflow_id=$1 order by position", [a.workflow_id]),
    q<{ id: number; to_stage: string; changed_at: string; who: string | null; note: string | null }>(
      "select h.id, s.name to_stage, h.changed_at, u.name who, h.note from stage_history h join workflow_stages s on s.id=h.to_stage_id left join users u on u.id=h.changed_by where h.application_id=$1 order by h.changed_at desc", [id]),
    q<{ item_id: number; name: string; doc_type: string | null; status: string; document_id: string | null; filename: string | null; verified_at: string | null }>(
      `select ac.item_id, ci.name, ci.doc_type, ac.status, ac.document_id, d.filename, d.verified_at from application_checklist ac join checklist_items ci on ci.id=ac.item_id
        left join documents d on d.id=ac.document_id where ac.application_id=$1 order by ci.position`, [id]),
    q<{ id: string; filename: string; doc_type: string; verified_at: string | null; created_at: string }>("select id, filename, doc_type, verified_at, created_at from documents where application_id=$1 order by created_at desc", [id]),
    visibleStaff(user),
  ]);

  const current = stages.find((s) => s.id === a.stage_id)!;
  const progress = stages.filter((s) => !s.outcome || s.outcome === "won");
  const done = checklist.filter((c) => c.status !== "pending").length;
  const elig = commissionEligibility(a);
  const agent = user.scope === "agent";
  const edit = can(user, "applications.edit") && !agent; // sub-agents don't move steps or change details; admissions does
  const verify = can(user, "documents.manage") && !agent;
  const est = a.tuition_fee && a.commission_pct ? (a.tuition_fee * a.commission_pct) / 100 : null;

  return (
    <>
      <PageHeader
        back={{ href: `/contacts/${a.contact_id}`, label: `${a.contact_name} (${a.contact_ref})` }}
        title={<span className="flex flex-wrap items-center gap-3">{a.ref}: {a.partner ?? "Institution"}<span className={`badge ${a.status === "won" ? "badge-ok" : a.status === "lost" ? "badge-grey" : ""}`}>{a.stage}</span></span>}
        subtitle={<>{a.course ?? "Course not set"} · {DEST_LABEL[a.destination ?? ""] ?? a.destination} · {a.intake ?? "intake not set"}{agent ? "" : ` · ${a.branch}`}</>}
        actions={can(user, "finance.edit") ? <Link className="btn" href={`/finance/new?application=${a.id}`}>Commission or fee invoice</Link> : null}
      />
      {!agent && !elig.ok && <div className="mb-4"><Notice tone="red">{elig.note}</Notice></div>}
      {!agent && elig.ok && elig.note && <div className="mb-4"><Notice tone="ok">{elig.note}</Notice></div>}
      {a.status === "lost" && a.lost_reason && <div className="mb-4"><Notice tone="warn">Closed: {a.lost_reason}</Notice></div>}

      {emailed && <div className="mb-4"><Notice tone="ok">Application pack emailed from the admissions mailbox.</Notice></div>}
      <AdmissionsPanel user={user} a={a} pendingDocs={checklist.filter((c) => c.status === "pending" && !["offer", "coe", "cas", "pal", "oshc"].includes(c.doc_type ?? "")).length} />

      <Card title="Progress" className="mb-6">
        <ol className="flex flex-wrap gap-2" aria-label="Application steps">
          {progress.map((s) => {
            const state = s.position < current.position && current.outcome !== "lost" ? "done" : s.id === current.id ? "now" : "next";
            return (
              <li key={s.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                state === "done" ? "border-ok/30 bg-ok-tint text-ok" : state === "now" ? "border-navy bg-navy text-white" : "border-line bg-white text-slate"}`}
                aria-current={state === "now" ? "step" : undefined}>
                {state === "done" ? "✓ " : ""}{s.name}{s.commission_trigger && !agent ? " · commission" : ""}
              </li>);
          })}
        </ol>
        {edit && (
          <ActionForm action={moveStage} className="mt-5 grid gap-3 border-t border-line pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-end">
            <input type="hidden" name="id" value={a.id} />
            <Field label="Move to step" htmlFor="stage_id">
              <select className="select" id="stage_id" name="stage_id" defaultValue={stages.find((s) => s.position === current.position + 1 && !s.outcome)?.id ?? current.id}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.outcome === "lost" ? `✗ ${s.name}` : s.name}</option>)}
              </select>
            </Field>
            <Field label="Note (required when withdrawn or refused)" htmlFor="note"><input className="input" id="note" name="note" placeholder="e.g. Offer received with conditions" /></Field>
            <Submit className="btn btn-navy">Move</Submit>
          </ActionForm>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <Card title={`Document checklist (${done} of ${checklist.length})`} pad={false}>
            <TableWrap><table className="tbl">
              <thead><tr><th>Document</th><th>File</th><th>Status</th>{can(user, "documents.manage") && <th></th>}</tr></thead>
              <tbody>{checklist.map((c) => (
                <tr key={c.item_id}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.document_id ? <a href={`/api/documents/${c.document_id}`} target="_blank" rel="noopener">{c.filename}</a> : <span className="text-slate">—</span>}</td>
                  <td><span className={`badge ${c.status === "verified" ? "badge-ok" : c.status === "received" ? "" : c.status === "not_needed" ? "badge-grey" : "badge-warn"}`}>{c.status.replace("_", " ")}</span></td>
                  {can(user, "documents.manage") && (
                    <td className="whitespace-nowrap">
                      <form action={setChecklist} className="flex gap-1">
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="item_id" value={c.item_id} />
                        <select name="status" defaultValue={c.status} className="select !min-h-0 !py-1 !text-xs" aria-label={`Status of ${c.name}`}>
                          <option value="pending">Pending</option><option value="received">Received</option>{verify && <><option value="verified">Checked</option><option value="not_needed">Not needed</option></>}
                        </select>
                        <button className="btn btn-sm">Set</button>
                      </form>
                    </td>)}
                </tr>))}</tbody>
            </table></TableWrap>
            {can(user, "documents.manage") && (
              <div className="border-t border-line p-5">
                <ActionForm action={uploadDocument} resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-end">
                  <input type="hidden" name="contact_id" value={a.contact_id} /><input type="hidden" name="application_id" value={a.id} />
                  <Field label="Upload for this application" htmlFor="file"><input className="input !py-1.5" id="file" type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /></Field>
                  <Field label="Checklist item" htmlFor="doc_type">
                    <select className="select" id="doc_type" name="doc_type">{checklist.filter((c) => c.doc_type).map((c) => <option key={c.item_id} value={c.doc_type!}>{c.name}</option>)}<option value="other">Other</option></select>
                  </Field>
                  <Submit className="btn btn-navy" pending="Uploading…">Upload</Submit>
                </ActionForm>
              </div>
            )}
          </Card>

          {docs.length > 0 && (
            <Card title="Files on this application" pad={false}>
              <ul className="divide-y divide-line">{docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span><a className="font-semibold text-navy" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">{d.filename}</a> <span className="text-xs text-slate">{d.doc_type.replace(/_/g, " ")}</span></span>
                  {d.verified_at ? <span className="badge badge-ok">Checked</span> : verify && <form action={verifyDocument}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm">Mark checked</button></form>}
                </li>))}</ul>
            </Card>
          )}

          <Card title="History" pad={false}>
            <ol className="divide-y divide-line">{history.map((h) => (
              <li key={h.id} className="px-5 py-3 text-sm"><p className="font-semibold">{h.to_stage}</p>{h.note && <p>{h.note}</p>}<p className="text-xs text-slate">{dateTime(h.changed_at, a.branch_tz)}{h.who ? ` · ${h.who}` : ""}</p></li>))}</ol>
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <MessagesCard user={user} a={a} />
          <Card title="Details">
            <Dl rows={agent ? [
              ["Institution", a.partner],
              ["Course", a.course_url ? <a className="text-navy" href={a.course_url} target="_blank" rel="noopener">{a.course}</a> : a.course],
              ["Intake", a.intake],
              ["Tuition per year", money(a.tuition_fee, a.fee_currency)],
              ["Started", date(a.created_at)],
            ] : [
              ["Workflow", a.workflow],
              ["Institution", a.partner],
              ["Course", a.course_url ? <a className="text-navy" href={a.course_url} target="_blank" rel="noopener">{a.course}</a> : a.course],
              ["Applied through", CHANNEL_LABEL[a.channel] ?? a.channel],
              ["Tuition per year", money(a.tuition_fee, a.fee_currency)],
              ["Commission rate", a.commission_pct ? `${a.commission_pct}% (partner agreement)` : "No agreement on file"],
              ["Estimated commission", elig.ok ? (est ? money(est, a.fee_currency) : "—") : "Not allowed (onshore transfer)"],
              ["Student ID at provider", a.student_id_at_provider],
              ["Accepted by provider", date(a.accepted_date)],
              ["Counsellor", a.owner],
              ["Started", date(a.created_at)],
            ]} />
          </Card>

          {edit && (
            <Card title="Update details">
              <ActionForm action={updateApplication} className="grid gap-3">
                <input type="hidden" name="id" value={a.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Intake" htmlFor="u_intake"><input className="input" id="u_intake" name="intake" defaultValue={a.intake ?? ""} /></Field>
                  <Field label="Applied through" htmlFor="u_channel">
                    <select className="select" id="u_channel" name="channel" defaultValue={a.channel}>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </Field>
                  <Field label="Tuition per year" htmlFor="u_fee"><input className="input tnum" id="u_fee" name="tuition_fee" type="number" min="0" defaultValue={a.tuition_fee ?? ""} /></Field>
                  <Field label="Currency" htmlFor="u_cur"><select className="select" id="u_cur" name="fee_currency" defaultValue={a.fee_currency ?? "AUD"}>{["AUD", "GBP", "CAD", "USD", "NZD", "EUR", "SEK"].map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Student ID at provider" htmlFor="u_sid"><input className="input" id="u_sid" name="student_id_at_provider" defaultValue={a.student_id_at_provider ?? ""} /></Field>
                  <Field label="Accepted by provider on" htmlFor="u_acc"><input className="input" id="u_acc" type="date" name="accepted_date" defaultValue={a.accepted_date ?? ""} /></Field>
                </div>
                <Field label="Counsellor" htmlFor="u_owner"><select className="select" id="u_owner" name="owner_id" defaultValue={a.owner_id ?? ""}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                {a.destination === "AU" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onshore_transfer" defaultChecked={a.onshore_transfer} /> Onshore transfer (already in Australia, changing provider)</label>}
                <Submit className="btn btn-sm btn-navy">Save</Submit>
              </ActionForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
