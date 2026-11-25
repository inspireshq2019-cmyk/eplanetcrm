import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser, scopeWhere } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { LEVELS } from "@/lib/lookups";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { Card, Dl, Empty, Field, PageHeader, Stat, TableWrap } from "@/components/ui";
import { date, LEVEL_LABEL, money } from "@/lib/format";
import { addAgreement, addRoute, endAgreement, removeRoute, saveCourse, setCourseActive } from "../actions";
import { METHOD_LABEL, ROUTE_LABEL } from "@/lib/admissions";
import { PartnerForm, type PartnerRow } from "../partner-form";

export const metadata = { title: "Institution" };

export default async function PartnerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; course?: string; inactive?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const pa = await q1<PartnerRow & { country: string | null }>("select pa.*, co.name country from partners pa left join countries co on co.code=pa.country_code where pa.id=$1", [Number(id) || 0]);
  if (!pa) notFound();
  const edit = can(user, "partners.edit");
  const p: unknown[] = [pa.id];
  const routes = await q<{ id: number; route_kind: string; via: string | null; method: string; portal_url: string | null; email: string | null; notes: string | null; preferred: boolean }>(
    `select r.id, r.route_kind, v.name via, r.method, r.portal_url, r.email, r.notes, r.preferred from partner_routes r left join partners v on v.id=r.via_partner_id
      where r.partner_id=$1 and r.active order by r.preferred desc, r.id`, [pa.id]);
  const brokers = await q<{ id: number; name: string; kind: string }>("select id, name, kind from partners where active and kind in ('aggregator','portal') and id<>$1 order by name", [pa.id]);
  const [agreements, courses, stats, countries, aggregators] = await Promise.all([
    q<{ id: number; commission_pct: number | null; bonus: string | null; claim_basis: string | null; currency: string | null; valid_from: string | null; valid_to: string | null; notes: string | null; via: string | null; current: boolean }>(
      `select g.*, v.name via, (g.valid_to is null or g.valid_to >= current_date) and (g.valid_from is null or g.valid_from <= current_date) current
         from partner_agreements g left join partners v on v.id=g.via_partner_id where g.partner_id=$1 order by current desc, g.valid_from desc nulls last`, [pa.id]),
    q<{ id: number; title: string; level: string; field: string | null; campus: string | null; duration_years: number | null; intakes: string[]; tuition_per_year: number | null; currency: string | null; fee_year: string | null; ielts: string | null; cricos: string | null; url: string | null; checked_on: string | null; active: boolean }>(
      `select * from courses where partner_id=$1 ${sp.inactive ? "" : "and active"} order by level, title`, [pa.id]),
    q1<{ total: number; open: number; won: number; lost: number }>(
      `select count(*) total, count(*) filter (where a.status='open') open, count(*) filter (where a.status='won') won, count(*) filter (where a.status='lost') lost
         from applications a where a.partner_id=$1 and ${scopeWhere(user, "a", p, { ownerColumn: "owner_id" })}`, p),
    edit && sp.edit ? q<{ code: string; name: string }>("select code, name from countries order by name") : Promise.resolve([]),
    edit ? q<{ id: number; name: string }>("select id, name from partners where kind='aggregator' and active order by name") : Promise.resolve([]),
  ]);
  const editing = sp.course ? courses.find((c) => String(c.id) === sp.course) : undefined;

  return (
    <>
      <PageHeader back={{ href: "/partners", label: "Partners & courses" }} title={pa.name}
        subtitle={[pa.city, pa.country, pa.cricos ? `CRICOS ${pa.cricos}` : null, pa.is_partner ? "Partner" : "Not on the partner list"].filter(Boolean).join(" · ")}
        actions={<>
          {pa.website && <a className="btn" href={pa.website} target="_blank" rel="noopener noreferrer">Website</a>}
          {edit && !sp.edit && <Link className="btn" href={`/partners/${pa.id}?edit=1`}>Edit details</Link>}
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applications" value={stats?.total ?? 0} href={`/applications?partner=${pa.id}&status=all`} />
        <Stat label="In progress" value={stats?.open ?? 0} />
        <Stat label="Enrolled / won" value={stats?.won ?? 0} tone="ok" />
        <Stat label="Lost" value={stats?.lost ?? 0} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {sp.edit && edit ? (
            <Card title="Edit details" actions={<Link className="btn btn-sm" href={`/partners/${pa.id}`}>Done</Link>}><PartnerForm partner={pa} countries={countries} /></Card>
          ) : (
            <Card title="Contact">
              <Dl rows={[["Email", pa.email ? <a key="e" href={`mailto:${pa.email}`}>{pa.email}</a> : "—"], ["Phone", pa.phone ?? "—"], ["Notes", <span key="n" className="whitespace-pre-line">{pa.notes ?? "—"}</span>]]} />
            </Card>
          )}
          <Card title={`Courses (${courses.length})`} pad={false}
            actions={<Link className="btn btn-sm" href={`/partners/${pa.id}${sp.inactive ? "" : "?inactive=1"}`}>{sp.inactive ? "Hide withdrawn" : "Show withdrawn"}</Link>}>
            {courses.length ? (
              <TableWrap><table className="tbl">
                <thead><tr><th>Course</th><th>Level</th><th>Intakes</th><th className="text-right">Tuition / year</th><th>English</th>{edit && <th></th>}</tr></thead>
                <tbody>{courses.map((c) => (
                  <tr key={c.id} className={c.active ? "" : "opacity-60"}>
                    <td>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> : c.title}
                      <div className="text-xs text-slate">{[c.campus, c.duration_years ? `${c.duration_years} yr` : null, c.cricos ? `CRICOS ${c.cricos}` : null, c.checked_on ? `checked ${date(c.checked_on)}` : null].filter(Boolean).join(" · ")}</div></td>
                    <td>{LEVEL_LABEL[c.level] ?? c.level}</td><td>{c.intakes.join(", ") || "—"}</td>
                    <td className="tnum text-right">{money(c.tuition_per_year, c.currency)}{c.fee_year && <div className="text-xs text-slate">{c.fee_year}</div>}</td>
                    <td className="text-xs">{c.ielts ?? "—"}</td>
                    {edit && <td className="whitespace-nowrap">
                      <Link className="btn btn-sm" href={`/partners/${pa.id}?course=${c.id}#course-form`}>Edit</Link>{" "}
                      <form action={setCourseActive} className="inline"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? "0" : "1"} /><button className="btn btn-sm">{c.active ? "Withdraw" : "Restore"}</button></form>
                    </td>}
                  </tr>))}</tbody>
              </table></TableWrap>
            ) : <Empty title="No courses recorded" />}
            {edit && (
              <div id="course-form" className="border-t border-line p-5">
                <p className="mb-3 text-sm font-semibold">{editing ? `Edit: ${editing.title}` : "Add a course"}</p>
                <ActionForm action={saveCourse} resetOnSuccess={!editing} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" key={editing?.id ?? "new"}>
                  <input type="hidden" name="partner_id" value={pa.id} />{editing && <input type="hidden" name="id" value={editing.id} />}
                  <Field label="Title *" htmlFor="title" className="sm:col-span-2"><input className="input" id="title" name="title" required maxLength={250} defaultValue={editing?.title} /></Field>
                  <Field label="Level *" htmlFor="level"><select className="select" id="level" name="level" defaultValue={editing?.level ?? "BACHELOR"}>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="OTHER">Other</option></select></Field>
                  <Field label="Field" htmlFor="field"><input className="input" id="field" name="field" maxLength={100} defaultValue={editing?.field ?? ""} /></Field>
                  <Field label="Campus" htmlFor="campus"><input className="input" id="campus" name="campus" maxLength={100} defaultValue={editing?.campus ?? ""} /></Field>
                  <Field label="Years" htmlFor="duration_years"><input className="input tnum" type="number" min="0" max="10" step="0.25" id="duration_years" name="duration_years" defaultValue={editing?.duration_years ?? ""} /></Field>
                  <Field label="Intakes" htmlFor="intakes" hint="Comma separated, e.g. Feb, Jul"><input className="input" id="intakes" name="intakes" defaultValue={editing?.intakes.join(", ")} /></Field>
                  <Field label="CRICOS course code" htmlFor="cricos_c"><input className="input tnum" id="cricos_c" name="cricos" maxLength={20} defaultValue={editing?.cricos ?? ""} /></Field>
                  <Field label="Tuition per year" htmlFor="tuition_per_year"><input className="input tnum" type="number" min="0" step="1" id="tuition_per_year" name="tuition_per_year" defaultValue={editing?.tuition_per_year ?? ""} /></Field>
                  <Field label="Currency" htmlFor="c_currency"><select className="select" id="c_currency" name="currency" defaultValue={editing?.currency ?? ({ AU: "AUD", UK: "GBP", GB: "GBP", CA: "CAD", US: "USD", NZ: "NZD" } as Record<string, string>)[pa.country_code ?? ""] ?? "EUR"}>{["AUD", "GBP", "CAD", "USD", "NZD", "EUR"].map((c) => <option key={c}>{c}</option>)}</select></Field>
                  <Field label="Fee year" htmlFor="fee_year"><input className="input" id="fee_year" name="fee_year" maxLength={10} placeholder="2026" defaultValue={editing?.fee_year ?? ""} /></Field>
                  <Field label="English requirement" htmlFor="ielts"><input className="input" id="ielts" name="ielts" maxLength={100} placeholder="IELTS 6.5 (no band < 6.0)" defaultValue={editing?.ielts ?? ""} /></Field>
                  <Field label="Course page" htmlFor="c_url" className="sm:col-span-2"><input className="input" id="c_url" name="url" maxLength={400} defaultValue={editing?.url ?? ""} /></Field>
                  <div className="flex items-end gap-2"><Submit>{editing ? "Save course" : "Add course"}</Submit>{editing && <Link className="btn" href={`/partners/${pa.id}`}>Cancel</Link>}</div>
                </ActionForm>
                <p className="mt-2 text-xs text-slate">Saving marks the course as checked today. Only enter fees you have confirmed from the institution.</p>
              </div>
            )}
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          {!["aggregator", "portal", "insurer"].includes(pa.kind) && (
          <Card title="How we submit applications">
            {routes.length ? (
              <ul className="mb-4 divide-y divide-line text-sm">{routes.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{ROUTE_LABEL[r.route_kind]}{r.via ? `: ${r.via}` : ""}</span>
                    {r.preferred && <span className="badge badge-ok">Usual</span>}
                  </div>
                  <p className="text-xs text-slate">{METHOD_LABEL[r.method]}{r.email ? ` · ${r.email}` : ""}</p>
                  {r.portal_url && <a className="text-xs text-navy break-all" href={r.portal_url} target="_blank" rel="noopener">{r.portal_url}</a>}
                  {r.notes && <p className="text-xs whitespace-pre-line">{r.notes}</p>}
                  {edit && <form action={removeRoute} className="mt-2"><input type="hidden" name="id" value={r.id} /><ConfirmButton>Remove</ConfirmButton></form>}
                </li>))}</ul>
            ) : <p className="mb-4 text-sm text-slate">No routes yet. The admission team picks from these when recording a submission.</p>}
            {edit && (
              <ActionForm action={addRoute} resetOnSuccess className="grid gap-3">
                <input type="hidden" name="partner_id" value={pa.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Route" htmlFor="r_kind"><select className="select" id="r_kind" name="route_kind" defaultValue="direct">{Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="How" htmlFor="r_method"><select className="select" id="r_method" name="method" defaultValue="portal">{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                </div>
                <Field label="Master agent or portal" htmlFor="r_via" hint="Add master agents and portals as partners of that kind first.">
                  <select className="select" id="r_via" name="via_partner_id" defaultValue=""><option value="">— (direct)</option>{brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                </Field>
                <Field label="Portal link" htmlFor="r_url"><input className="input" id="r_url" name="portal_url" maxLength={300} placeholder="https://" /></Field>
                <Field label="Applications email" htmlFor="r_email"><input className="input" id="r_email" type="email" name="email" maxLength={150} /></Field>
                <Field label="Notes" htmlFor="r_notes"><input className="input" id="r_notes" name="notes" maxLength={500} placeholder="e.g. Use the Crizac portal for postgraduate courses" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="preferred" /> Usual route for this institution</label>
                <Submit className="btn">Add route</Submit>
              </ActionForm>
            )}
          </Card>
          )}
          <Card title="Commission agreements">
            {agreements.length ? (
              <ul className="mb-4 divide-y divide-line text-sm">{agreements.map((g) => (
                <li key={g.id} className={`py-3 ${g.current ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold tnum">{g.commission_pct}%{g.via ? <span className="font-normal text-slate"> via {g.via}</span> : null}</span>
                    {g.current ? <span className="badge badge-ok">Current</span> : <span className="badge badge-grey">Ended</span>}
                  </div>
                  <p className="text-xs text-slate">{date(g.valid_from)} – {g.valid_to ? date(g.valid_to) : "open"}{g.claim_basis ? ` · ${g.claim_basis}` : ""}</p>
                  {g.bonus && <p className="text-xs">Bonus: {g.bonus}</p>}
                  {g.notes && <p className="text-xs whitespace-pre-line">{g.notes}</p>}
                  {edit && g.current && <form action={endAgreement} className="mt-2"><input type="hidden" name="id" value={g.id} /><ConfirmButton>End agreement</ConfirmButton></form>}
                </li>))}</ul>
            ) : <p className="mb-4 text-sm text-slate">No agreement recorded. Commission invoices for this institution will need the rate typed in.</p>}
            {edit && (
              <ActionForm action={addAgreement} resetOnSuccess className="grid gap-3">
                <input type="hidden" name="partner_id" value={pa.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Commission % *" htmlFor="commission_pct"><input className="input tnum" type="number" min="0" max="100" step="0.01" id="commission_pct" name="commission_pct" required /></Field>
                  <Field label="Currency" htmlFor="g_currency"><input className="input" id="g_currency" name="currency" maxLength={3} placeholder="AUD" /></Field>
                  <Field label="From" htmlFor="valid_from"><input className="input" type="date" id="valid_from" name="valid_from" /></Field>
                  <Field label="To" htmlFor="valid_to"><input className="input" type="date" id="valid_to" name="valid_to" /></Field>
                </div>
                {aggregators.length > 0 && <Field label="Through an aggregator" htmlFor="via_partner_id"><select className="select" id="via_partner_id" name="via_partner_id"><option value="">Direct with the institution</option>{aggregators.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
                <Field label="Paid on" htmlFor="claim_basis"><input className="input" id="claim_basis" name="claim_basis" placeholder="First-year tuition, after census date" /></Field>
                <Field label="Bonus" htmlFor="bonus"><input className="input" id="bonus" name="bonus" placeholder="e.g. AUD 1,000 for 10+ enrolments" /></Field>
                <Field label="Notes" htmlFor="g_notes"><textarea className="input min-h-16" id="g_notes" name="notes" maxLength={1000} /></Field>
                <Submit className="btn">Save agreement</Submit>
              </ActionForm>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
