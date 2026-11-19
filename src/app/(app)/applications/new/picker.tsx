"use client";

import { useMemo, useState } from "react";

type Wf = { id: number; name: string; destination: string | null };
type Partner = { id: number; name: string; country_code: string | null; is_partner: boolean };
type Course = { id: number; partner_id: number; title: string; level: string; tuition_per_year: number | null; currency: string | null; intakes: string[] };

const DEST_COUNTRY: Record<string, string[]> = { AU: ["AU"], UK: ["GB"], CA: ["CA"], US: ["US"], NZ: ["NZ"], EU: ["IE", "DE", "FR", "NL", "ES", "SE", "IT", "MT", "FI", "DK", "HU", "PL", "LT", "LV", "AT", "BE", "CZ", "PT", "CH", "CY"] };
const CUR: Record<string, string> = { AU: "AUD", UK: "GBP", CA: "CAD", US: "USD", NZ: "NZD", EU: "EUR" };

/** Country → institution → course pickers that narrow each other, plus fee and intake filled from the course list. */
export function ApplicationPicker({ workflows, partners, courses, defaultDest }: { workflows: Wf[]; partners: Partner[]; courses: Course[]; defaultDest?: string }) {
  const [wfId, setWfId] = useState<number>(workflows.find((w) => w.destination === defaultDest)?.id ?? workflows[0]?.id);
  const wf = workflows.find((w) => w.id === wfId);
  const [partnerId, setPartnerId] = useState<number | "">("");
  const [courseId, setCourseId] = useState<number | "">("");
  const [filter, setFilter] = useState("");
  const course = courses.find((c) => c.id === courseId);
  const [fee, setFee] = useState<string>("");
  const [cur, setCur] = useState<string>(CUR[wf?.destination ?? ""] ?? "AUD");

  const plist = useMemo(() => {
    const allowed = wf?.destination ? DEST_COUNTRY[wf.destination] : null;
    const f = filter.toLowerCase();
    return partners.filter((p) => (!allowed || (p.country_code && allowed.includes(p.country_code))) && (!f || p.name.toLowerCase().includes(f)));
  }, [partners, wf, filter]);
  const clist = courses.filter((c) => c.partner_id === partnerId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="workflow_id">Country and workflow *</label>
        <select className="select" id="workflow_id" name="workflow_id" value={wfId} onChange={(e) => { const w = workflows.find((x) => x.id === Number(e.target.value)); setWfId(Number(e.target.value)); setPartnerId(""); setCourseId(""); setCur(CUR[w?.destination ?? ""] ?? cur); }}>
          {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pfilter">Find institution</label>
        <input className="input" id="pfilter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type part of the name" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="partner_id">Institution * <span className="font-normal">({plist.length} in this country)</span></label>
        <select className="select" id="partner_id" name="partner_id" required value={partnerId} onChange={(e) => { setPartnerId(e.target.value ? Number(e.target.value) : ""); setCourseId(""); }}>
          <option value="">Choose…</option>
          {plist.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_partner ? "" : " (not on partner list)"}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="course_id">Course {clist.length ? `(${clist.length} checked courses on file)` : ""}</label>
        {clist.length > 0 && (
          <select className="select mb-2" id="course_id" name="course_id" value={courseId} onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : ""; setCourseId(id);
            const c = courses.find((x) => x.id === id); if (c?.tuition_per_year) { setFee(String(c.tuition_per_year)); if (c.currency) setCur(c.currency); }
          }}>
            <option value="">Not in the list — type it below</option>
            {clist.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
        {!courseId && <input className="input" name="course_title" placeholder="Course name, e.g. Master of Information Technology" aria-label="Course name" />}
      </div>
      <div>
        <label className="label" htmlFor="intake">Intake</label>
        <input className="input" id="intake" name="intake" placeholder={course?.intakes?.length ? `e.g. ${course.intakes[0]} 2027` : "e.g. Feb 2027"} list="intake-list" />
        <datalist id="intake-list">{(course?.intakes ?? []).map((m) => <option key={m} value={`${m} 2027`} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor="tuition_fee">Tuition per year</label>
        <div className="flex gap-2">
          <input className="input tnum" id="tuition_fee" name="tuition_fee" type="number" min="0" step="1" value={fee} onChange={(e) => setFee(e.target.value)} />
          <select className="select !w-28" name="fee_currency" aria-label="Currency" value={cur} onChange={(e) => setCur(e.target.value)}>
            {["AUD", "GBP", "CAD", "USD", "NZD", "EUR", "SEK"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <p className="mt-1 text-xs text-slate">Used to work out commission. Filled in from the course list where we have it.</p>
      </div>
      {wf?.destination === "AU" && (
        <label className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-warn-tint px-4 py-3 text-sm text-warn">
          <input type="checkbox" name="onshore_transfer" className="mt-1" />
          <span><b>Onshore transfer</b>: the student is already in Australia on a student visa and is moving from another provider. Since 31 March 2026 providers can't pay agents commission for these students; charge a service fee instead.</span>
        </label>
      )}
    </div>
  );
}
