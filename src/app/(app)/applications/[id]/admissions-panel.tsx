import Link from "next/link";
import { can, type CurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { ADM_STATUS, admLabel, METHOD_LABEL, NEXT_STATUS, OUTCOME_LABEL, ROUTE_LABEL, type AdmStatus } from "@/lib/admissions";
import { date, dateTime } from "@/lib/format";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Field, Notice, TableWrap } from "@/components/ui";
import { assignOfficer, postMessage, recordOutcome, recordSubmission, sendToAdmissions, setAdmStatus } from "../../admissions/actions";

type App = {
  id: string; partner_id: number | null; partner: string | null; adm_status: string | null; adm_request: string | null; adm_officer: string | null;
  adm_officer_id: string | null; adm_sent_at: string | null; branch_tz: string;
};

const ACTION_LABEL: Partial<Record<AdmStatus, string>> = {
  in_review: "Checking it", needs_info: "Needs something from the branch", offer: "Offer received", refused: "Refused", withdrawn: "Withdrawn",
};

/** Where the application is with the central admission team, and what each side can do next. */
export async function AdmissionsPanel({ user, a, pendingDocs }: { user: CurrentUser; a: App; pendingDocs: number }) {
  const team = can(user, "admissions.manage");
  const agent = user.scope === "agent";
  const st = admLabel(a.adm_status);
  const [subs, routes, officers, brokers] = await Promise.all([
    q<{ id: number; route_kind: string; via: string | null; method: string; external_ref: string | null; submitted_on: string; outcome: string; outcome_on: string | null; notes: string | null; by: string | null }>(
      `select s.id, s.route_kind, v.name via, s.method, s.external_ref, s.submitted_on, s.outcome, s.outcome_on, s.notes, u.name by
         from application_submissions s left join partners v on v.id=s.via_partner_id left join users u on u.id=s.submitted_by
        where s.application_id=$1 order by s.submitted_on desc, s.id desc`, [a.id]),
    team && a.partner_id ? q<{ id: number; route_kind: string; via: string | null; method: string; preferred: boolean }>(
      `select r.id, r.route_kind, v.name via, r.method, r.preferred from partner_routes r left join partners v on v.id=r.via_partner_id
        where r.partner_id=$1 and r.active order by r.preferred desc, r.id`, [a.partner_id]) : Promise.resolve([]),
    team ? q<{ id: string; name: string }>(
      `select u.id, u.name from users u join roles r on r.key=u.role_key where u.active and u.sub_agent_id is null and 'admissions.manage' = any(r.permissions) order by u.name`) : Promise.resolve([]),
    team ? q<{ id: number; name: string; kind: string }>("select id, name, kind from partners where active and kind in ('aggregator','portal') order by name") : Promise.resolve([]),
  ]);

  return (
    <Card title="Admissions" className="mb-6" actions={st ? <span className={`badge ${st.badge}`}>{st.short}</span> : <span className="badge badge-grey">Not sent yet</span>}>
      <div className="grid gap-4">
        {/* Status line everyone sees */}
        {!a.adm_status && (
          can(user, "applications.edit") ? (
            <ActionForm action={sendToAdmissions} className="grid gap-3">
              <input type="hidden" name="id" value={a.id} />
              <p className="text-sm">When the documents are ready, send this application to the central admission team. They check it and submit it to {a.partner ?? "the institution"}.</p>
              {pendingDocs > 0 && <Notice tone="warn">{pendingDocs} checklist {pendingDocs === 1 ? "document is" : "documents are"} still pending. You can send it now, but the team may ask for {pendingDocs === 1 ? "it" : "them"} before submitting.</Notice>}
              <Field label="Message for the admission team (optional)" htmlFor="send_msg"><textarea className="textarea" id="send_msg" name="message" maxLength={2000} placeholder="e.g. Student prefers the February intake; scholarship requested" /></Field>
              <div><Submit pending="Sending…">Send to admissions</Submit></div>
            </ActionForm>
          ) : <p className="text-sm text-slate">The branch hasn&apos;t sent this application to the admission team yet.</p>
        )}
        {a.adm_status && (
          <div className="grid gap-1 text-sm">
            <p><b>{st?.label}</b>{a.adm_sent_at ? ` · sent ${dateTime(a.adm_sent_at, a.branch_tz)}` : ""}</p>
            {!agent && <p className="text-slate">{a.adm_officer ? `Handled by ${a.adm_officer}` : "Not yet picked up by an admission officer"}</p>}
          </div>
        )}
        {a.adm_status === "needs_info" && (
          <>
            <Notice tone="red"><b>The admission team needs:</b> {a.adm_request}</Notice>
            {can(user, "applications.edit") && (
              <ActionForm action={sendToAdmissions} className="grid gap-3">
                <input type="hidden" name="id" value={a.id} />
                <Field label="What you've sent or changed" htmlFor="resend_msg"><textarea className="textarea" id="resend_msg" name="message" required maxLength={2000} placeholder="e.g. Uploaded the updated bank statement and the HSC transcript" /></Field>
                <div><Submit pending="Sending…">Send back to admissions</Submit></div>
              </ActionForm>
            )}
          </>
        )}

        {/* Submissions to the institution */}
        {subs.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Submitted to {a.partner ?? "the institution"}</p>
            <TableWrap><table className="tbl">
              <thead><tr><th>Submitted</th>{!agent && <th>Route</th>}{!agent && <th>Reference</th>}<th>Decision</th></tr></thead>
              <tbody>{subs.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">{date(s.submitted_on)}</td>
                  {!agent && <td>{ROUTE_LABEL[s.route_kind]}{s.via ? `: ${s.via}` : ""}<div className="text-xs text-slate">{METHOD_LABEL[s.method]}{s.by ? ` · ${s.by}` : ""}</div></td>}
                  {!agent && <td className="tnum">{s.external_ref ?? "—"}</td>}
                  <td><span className={`badge ${s.outcome === "unconditional" || s.outcome === "conditional" ? "badge-ok" : s.outcome === "pending" ? "badge-warn" : "badge-grey"}`}>{OUTCOME_LABEL[s.outcome]}</span>
                    {s.outcome_on && <div className="text-xs text-slate">{date(s.outcome_on)}</div>}
                    {team && (
                      <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-navy">Record decision</summary>
                        <ActionForm action={recordOutcome} className="mt-2 grid gap-2">
                          <input type="hidden" name="id" value={a.id} /><input type="hidden" name="submission_id" value={s.id} />
                          <select className="select" name="outcome" defaultValue={s.outcome} aria-label="Decision">{Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                          <input className="input" type="date" name="outcome_on" aria-label="Decision date" defaultValue={s.outcome_on ?? ""} />
                          <input className="input" name="note" maxLength={500} placeholder="Conditions or reason (shown to the branch)" aria-label="Note" />
                          <Submit className="btn btn-sm btn-navy">Save decision</Submit>
                        </ActionForm>
                      </details>)}
                  </td>
                </tr>))}</tbody>
            </table></TableWrap>
            {(subs.some((s) => s.outcome === "conditional" || s.outcome === "unconditional")) && <p className="mt-2 text-xs text-slate">Offer letters are added to “Files on this application” below.</p>}
          </div>
        )}

        {/* Admission team controls */}
        {team && a.adm_status && (
          <div className="grid gap-4 border-t border-line pt-4">
            <p className="text-sm font-semibold text-navy">Admission team</p>
            <form action={assignOfficer} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={a.id} />
              <label className="grid gap-1 text-sm">Handled by
                <select className="select" name="officer_id" defaultValue={a.adm_officer_id ?? ""}><option value="">Nobody yet</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
              </label>
              <button className="btn btn-sm">Save</button>
              {a.adm_officer_id !== user.id && <button className="btn btn-sm btn-navy" name="take" value="1">Take it</button>}
            </form>

            {NEXT_STATUS[a.adm_status as AdmStatus]?.some((s) => ACTION_LABEL[s]) && (
              <ActionForm action={setAdmStatus} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
                <input type="hidden" name="id" value={a.id} />
                <Field label="Change status" htmlFor="adm_to">
                  <select className="select" id="adm_to" name="status">{NEXT_STATUS[a.adm_status as AdmStatus].filter((s) => ACTION_LABEL[s]).map((s) => <option key={s} value={s}>{ACTION_LABEL[s]}</option>)}</select>
                </Field>
                <Field label="What's needed, or the reason (shown to the branch)" htmlFor="adm_text"><input className="input" id="adm_text" name="text" maxLength={2000} placeholder="e.g. Bank statement must be under 1 month old" /></Field>
                <Submit className="btn btn-sm">Update</Submit>
              </ActionForm>
            )}

            {["submitted", "in_review", "lodged", "offer", "refused"].includes(a.adm_status) && (
              <details className="rounded-xl border border-line p-3" open={a.adm_status === "in_review" && subs.length === 0}>
                <summary className="cursor-pointer text-sm font-semibold">Record a submission to {a.partner ?? "the institution"}</summary>
                <ActionForm action={recordSubmission} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={a.id} />
                  {routes.length > 0 && (
                    <Field label="Route" htmlFor="route_id" className="sm:col-span-2" hint="Set up the usual routes on the institution's partner page.">
                      <select className="select" id="route_id" name="route_id" defaultValue={routes[0].id}>
                        {routes.map((r) => <option key={r.id} value={r.id}>{ROUTE_LABEL[r.route_kind]}{r.via ? `: ${r.via}` : ""} ({METHOD_LABEL[r.method].toLowerCase()}){r.preferred ? " · usual" : ""}</option>)}
                        <option value="">Another route…</option>
                      </select>
                    </Field>
                  )}
                  <Field label={routes.length ? "Other route (if not listed)" : "Route"} htmlFor="route_kind">
                    <select className="select" id="route_kind" name="route_kind" defaultValue="direct">{Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </Field>
                  <Field label="Master agent or portal" htmlFor="via_partner_id">
                    <select className="select" id="via_partner_id" name="via_partner_id" defaultValue=""><option value="">— (direct)</option>{brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                  </Field>
                  <Field label="How" htmlFor="method"><select className="select" id="method" name="method" defaultValue="portal">{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="Submitted on" htmlFor="submitted_on"><input className="input" type="date" id="submitted_on" name="submitted_on" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                  <Field label="Reference / application number" htmlFor="external_ref"><input className="input" id="external_ref" name="external_ref" maxLength={100} /></Field>
                  <Field label="Notes (admission team only)" htmlFor="sub_notes"><input className="input" id="sub_notes" name="notes" maxLength={500} /></Field>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Submit className="btn btn-navy">Record submission</Submit>
                    <Link className="btn" href={`/admissions/email/${a.id}`}>Email the application pack</Link>
                  </div>
                </ActionForm>
              </details>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** The conversation between the branch or sub-agent and the admission team. Internal notes stay with the team. */
export async function MessagesCard({ user, a }: { user: CurrentUser; a: App }) {
  const team = can(user, "admissions.manage");
  const msgs = await q<{ id: number; body: string; internal: boolean; kind: string; created_at: string; who: string | null; agency: string | null; is_team: boolean }>(
    `select m.id, m.body, m.internal, m.kind, m.created_at, u.name who, sa.name agency,
            coalesce('admissions.manage' = any(r.permissions), false) is_team
       from application_messages m left join users u on u.id=m.author_id left join roles r on r.key=u.role_key left join sub_agents sa on sa.id=u.sub_agent_id
      where m.application_id=$1 and ($2 or not m.internal) order by m.created_at`, [a.id, team]);
  // Opening the application marks the conversation as read for this person.
  await q("insert into application_reads(user_id,application_id) values($1,$2) on conflict (user_id,application_id) do update set last_read_at=now()", [user.id, a.id]);
  return (
    <Card title="Messages with admissions" pad={false}>
      {msgs.length ? (
        <ol className="grid gap-3 p-5">{msgs.map((m) => (
          <li key={m.id} className={`rounded-xl px-4 py-3 text-sm ${m.internal ? "border border-dashed border-amber-300 bg-amber-50" : m.kind === "status" ? "bg-sky" : m.is_team ? "bg-white border border-line" : "bg-mist"}`}>
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
              <span className="font-semibold">{m.kind === "status" ? "Update" : m.who ?? "Eplanet"}{m.agency ? ` · ${m.agency}` : m.is_team && m.kind !== "status" ? " · Admissions" : ""}{m.internal ? " · admission team only" : ""}</span>
              <span>{dateTime(m.created_at, a.branch_tz)}</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
          </li>))}</ol>
      ) : <p className="p-5 text-sm text-slate">No messages yet.</p>}
      <div className="border-t border-line p-5">
        <ActionForm action={postMessage} resetOnSuccess className="grid gap-2">
          <input type="hidden" name="id" value={a.id} />
          <textarea className="textarea" name="body" required maxLength={4000} aria-label="Message" placeholder={team ? "Message the branch, or add a note for the team" : "Message the admission team"} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {team ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="internal" /> Admission team only</label> : <span />}
            <Submit className="btn btn-sm btn-navy">Send</Submit>
          </div>
        </ActionForm>
      </div>
    </Card>
  );
}
