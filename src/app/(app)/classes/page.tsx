import Link from "next/link";
import { requirePermission, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { visibleBranches, visibleStaff } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, TableWrap } from "@/components/ui";
import { date, money } from "@/lib/format";
import { createClass } from "./actions";

export const metadata = { title: "IELTS & PTE classes" };

export default async function Classes() {
  const user = await requirePermission("classes.manage");
  const p: unknown[] = [];
  const [rows, branches, staff] = await Promise.all([
    q<{ id: number; name: string; test: string; start_date: string | null; end_date: string | null; schedule: string | null; status: string; capacity: number | null; fee: number | null; currency: string | null; trainer: string | null; branch: string; n: number }>(
      `select k.id, k.name, k.test, k.start_date, k.end_date, k.schedule, k.status, k.capacity, k.fee, k.currency, u.name trainer, b.name branch,
              (select count(*) from class_enrolments e where e.class_id=k.id and e.status<>'dropped') n
         from classes k join branches b on b.id=k.branch_id left join users u on u.id=k.trainer_id
        where ${scopeWhere(user, "k", p)} order by k.status='completed', k.start_date desc nulls last`, p),
    visibleBranches(user), visibleStaff(user),
  ]);
  return (
    <>
      <PageHeader title="IELTS & PTE classes" subtitle="Batches, enrolment, attendance and mock-test scores." />
      <Card pad={false} className="mb-6">
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Class</th><th>Dates</th><th>Schedule</th><th>Trainer</th><th>Students</th><th>Fee</th><th>Status</th>{branches.length > 1 && <th>Branch</th>}</tr></thead>
            <tbody>{rows.map((k) => (
              <tr key={k.id}>
                <td><Link href={`/classes/${k.id}`}>{k.name}</Link><div className="text-xs text-slate">{k.test}</div></td>
                <td className="whitespace-nowrap">{date(k.start_date)} – {date(k.end_date)}</td>
                <td>{k.schedule ?? "—"}</td><td>{k.trainer ?? "—"}</td>
                <td className="tnum">{k.n}{k.capacity ? ` / ${k.capacity}` : ""}</td>
                <td className="tnum">{money(k.fee, k.currency)}</td>
                <td><span className={`badge ${k.status === "running" ? "badge-ok" : k.status === "completed" ? "badge-grey" : ""}`}>{k.status}</span></td>
                {branches.length > 1 && <td>{k.branch}</td>}
              </tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title="No classes yet">Create your first batch below.</Empty>}
      </Card>
      <Card title="New class">
        <ActionForm action={createClass} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name *" htmlFor="name" className="sm:col-span-2"><input className="input" id="name" name="name" required placeholder="IELTS Evening Batch 12" /></Field>
          <Field label="Test" htmlFor="test"><select className="select" id="test" name="test"><option>IELTS</option><option>PTE</option><option>TOEFL</option><option>Duolingo</option><option>Spoken English</option></select></Field>
          <Field label="Branch" htmlFor="branch_id"><select className="select" id="branch_id" name="branch_id" defaultValue={user.primaryBranchId}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Starts" htmlFor="start_date"><input className="input" type="date" id="start_date" name="start_date" /></Field>
          <Field label="Ends" htmlFor="end_date"><input className="input" type="date" id="end_date" name="end_date" /></Field>
          <Field label="Days and time" htmlFor="schedule"><input className="input" id="schedule" name="schedule" placeholder="Sun, Tue, Thu 6–8 pm" /></Field>
          <Field label="Trainer" htmlFor="trainer_id"><select className="select" id="trainer_id" name="trainer_id"><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Places" htmlFor="capacity"><input className="input tnum" type="number" min="1" id="capacity" name="capacity" /></Field>
          <Field label="Course fee" htmlFor="fee"><input className="input tnum" type="number" min="0" id="fee" name="fee" /></Field>
          <Field label="Currency" htmlFor="currency"><select className="select" id="currency" name="currency" defaultValue={branches.find((b) => b.id === user.primaryBranchId)?.currency}>{["BDT", "NPR", "INR", "AUD", "LKR", "PHP"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Status" htmlFor="status"><select className="select" id="status" name="status"><option value="planned">Planned</option><option value="running">Running</option></select></Field>
          <div className="self-end"><Submit>Create class</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
