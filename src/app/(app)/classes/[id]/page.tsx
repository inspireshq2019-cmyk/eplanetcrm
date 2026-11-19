import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { contactOptions } from "@/lib/contact-pick";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, TableWrap } from "@/components/ui";
import { date, money } from "@/lib/format";
import { addMock, enrol, saveAttendance, setEnrolmentStatus } from "../actions";

export const metadata = { title: "Class" };

export default async function ClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ day?: string }> }) {
  const user = await requirePermission("classes.manage");
  const { id } = await params;
  const sp = await searchParams;
  const k = await q1<{ id: number; name: string; test: string; branch_id: number; branch: string; tz: string; start_date: string | null; end_date: string | null; schedule: string | null; trainer: string | null; capacity: number | null; fee: number | null; currency: string | null; status: string }>(
    "select k.*, b.name branch, b.timezone tz, u.name trainer from classes k join branches b on b.id=k.branch_id left join users u on u.id=k.trainer_id where k.id=$1", [Number(id) || 0]);
  if (!k || !canSeeBranch(user, k.branch_id)) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: k.tz }).format(new Date());
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const [roster, att, mocks, options, sessions] = await Promise.all([
    q<{ contact_id: string; ref: string; name: string; phone: string | null; status: string; present_n: number; sessions_n: number; best: number | null; last: number | null }>(
      `select e.contact_id, c.ref, c.first_name || ' ' || coalesce(c.last_name,'') name, c.phone, e.status,
              (select count(*) from class_attendance a where a.class_id=e.class_id and a.contact_id=e.contact_id and a.present) present_n,
              (select count(distinct session_date) from class_attendance a where a.class_id=e.class_id) sessions_n,
              (select max(overall) from mock_scores m where m.class_id=e.class_id and m.contact_id=e.contact_id) best,
              (select overall from mock_scores m where m.class_id=e.class_id and m.contact_id=e.contact_id order by taken_on desc, id desc limit 1) last
         from class_enrolments e join contacts c on c.id=e.contact_id where e.class_id=$1 order by e.status, c.first_name`, [k.id]),
    q<{ contact_id: string; present: boolean }>("select contact_id, present from class_attendance where class_id=$1 and session_date=$2", [k.id, day]),
    q<{ id: number; name: string; taken_on: string; listening: number | null; reading: number | null; writing: number | null; speaking: number | null; overall: number | null }>(
      "select m.id, c.first_name || ' ' || coalesce(c.last_name,'') name, m.taken_on, m.listening, m.reading, m.writing, m.speaking, m.overall from mock_scores m join contacts c on c.id=m.contact_id where m.class_id=$1 order by m.taken_on desc, m.id desc limit 40", [k.id]),
    contactOptions(user),
    q<{ session_date: string; n: number }>("select session_date, count(*) filter (where present) n from class_attendance where class_id=$1 group by 1 order by 1 desc limit 12", [k.id]),
  ]);
  const presentToday = new Map(att.map((a) => [a.contact_id, a.present]));
  const active = roster.filter((r) => r.status === "enrolled");
  return (
    <>
      <PageHeader back={{ href: "/classes", label: "Classes" }} title={k.name}
        subtitle={`${k.test} · ${k.branch} · ${date(k.start_date)} – ${date(k.end_date)}${k.schedule ? ` · ${k.schedule}` : ""}${k.trainer ? ` · ${k.trainer}` : ""} · fee ${money(k.fee, k.currency)}`} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <Card title={`Students (${active.length}${k.capacity ? ` of ${k.capacity}` : ""})`} pad={false}>
            {roster.length ? (
              <TableWrap><table className="tbl">
                <thead><tr><th>Student</th><th>Attendance</th><th>Latest mock</th><th>Best</th><th>Status</th></tr></thead>
                <tbody>{roster.map((r) => (
                  <tr key={r.contact_id} className={r.status === "dropped" ? "opacity-60" : ""}>
                    <td><Link href={`/contacts/${r.contact_id}`}>{r.name}</Link><div className="text-xs text-slate">{r.ref}{r.phone ? ` · ${r.phone}` : ""}</div></td>
                    <td className="tnum">{r.sessions_n ? `${r.present_n} / ${r.sessions_n} (${Math.round((r.present_n / r.sessions_n) * 100)}%)` : "—"}</td>
                    <td className="tnum">{r.last ?? "—"}</td><td className="tnum font-semibold">{r.best ?? "—"}</td>
                    <td>
                      <form action={setEnrolmentStatus} className="flex gap-1">
                        <input type="hidden" name="class_id" value={k.id} /><input type="hidden" name="contact_id" value={r.contact_id} />
                        <select className="select !min-h-0 !py-1 !text-xs" name="status" defaultValue={r.status} aria-label="Enrolment status"><option value="enrolled">Enrolled</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select>
                        <button className="btn btn-sm">Set</button>
                      </form>
                    </td>
                  </tr>))}</tbody>
              </table></TableWrap>
            ) : <Empty title="No students enrolled yet" />}
            <div className="border-t border-line p-5">
              <ActionForm action={enrol} resetOnSuccess className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="class_id" value={k.id} />
                <Field label="Enrol a student" htmlFor="contact" className="min-w-60 flex-1">
                  <input className="input" id="contact" name="contact" list="contact-list" placeholder="Type a name or C-number" required autoComplete="off" />
                  <datalist id="contact-list">{options.map((o) => <option key={o.ref} value={`${o.ref} · ${o.name}`} />)}</datalist>
                </Field>
                <Submit className="btn btn-navy">Enrol</Submit>
              </ActionForm>
            </div>
          </Card>

          <Card title="Mock-test scores" pad={false}>
            {mocks.length ? (
              <TableWrap><table className="tbl"><thead><tr><th>Student</th><th>Date</th><th>L</th><th>R</th><th>W</th><th>S</th><th>Overall</th></tr></thead>
                <tbody>{mocks.map((m) => <tr key={m.id}><td>{m.name}</td><td>{date(m.taken_on)}</td><td className="tnum">{m.listening ?? "—"}</td><td className="tnum">{m.reading ?? "—"}</td><td className="tnum">{m.writing ?? "—"}</td><td className="tnum">{m.speaking ?? "—"}</td><td className="tnum font-semibold">{m.overall ?? "—"}</td></tr>)}</tbody></table></TableWrap>
            ) : <Empty title="No mock tests recorded" />}
            {active.length > 0 && (
              <div className="border-t border-line p-5">
                <ActionForm action={addMock} resetOnSuccess className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 lg:items-end">
                  <input type="hidden" name="class_id" value={k.id} />
                  <Field label="Student" htmlFor="m_contact" className="col-span-2"><select className="select" id="m_contact" name="contact_id">{active.map((r) => <option key={r.contact_id} value={r.contact_id}>{r.name}</option>)}</select></Field>
                  <Field label="Date" htmlFor="taken_on" className="col-span-2"><input className="input" type="date" id="taken_on" name="taken_on" defaultValue={today} /></Field>
                  {["listening", "reading", "writing", "speaking"].map((s) => <Field key={s} label={s[0].toUpperCase()} htmlFor={`m_${s}`}><input className="input tnum" id={`m_${s}`} name={s} type="number" step="0.5" min="0" max="9" /></Field>)}
                  <p className="col-span-2 text-xs text-slate lg:col-span-6">Overall is worked out from the four bands using IELTS rounding.</p>
                  <div className="col-span-2"><Submit className="btn btn-navy">Save score</Submit></div>
                </ActionForm>
              </div>
            )}
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          <Card title="Attendance">
            <form className="mb-4 flex gap-2"><input className="input" type="date" name="day" defaultValue={day} aria-label="Class date" /><button className="btn">Open</button></form>
            {active.length ? (
              <ActionForm action={saveAttendance} className="grid gap-2">
                <input type="hidden" name="class_id" value={k.id} /><input type="hidden" name="session_date" value={day} />
                <p className="text-sm font-semibold">{date(day)}</p>
                {active.map((r) => (
                  <label key={r.contact_id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-ok has-[:checked]:bg-ok-tint">
                    <input type="checkbox" name="present" value={r.contact_id} defaultChecked={presentToday.get(r.contact_id) ?? false} /> {r.name}
                  </label>))}
                <Submit className="btn btn-navy mt-2">Save attendance</Submit>
              </ActionForm>
            ) : <p className="text-sm text-slate">Enrol students first.</p>}
          </Card>
          {sessions.length > 0 && (
            <Card title="Recent sessions">
              <ul className="space-y-1 text-sm">{sessions.map((s) => <li key={s.session_date} className="flex justify-between"><Link className="text-navy" href={`/classes/${k.id}?day=${s.session_date}`}>{date(s.session_date)}</Link><span className="tnum">{s.n} present</span></li>)}</ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
