import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { visibleStaff } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, TableWrap } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { addTask, completeTask } from "./actions";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string; show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const team = can(user, "tasks.all") && sp.who === "team";
  const showDone = sp.show === "done";
  const p: unknown[] = [];
  let where = "";
  if (team) {
    if (user.scope === "all") where = "true";
    else { p.push(user.branchIds); where = `t.branch_id = any($${p.length}::int[])`; }
  } else { p.push(user.id); where = `t.assignee_id=$${p.length}`; }
  where += showDone ? " and t.status='done' and t.completed_at > now() - interval '30 days'" : " and t.status='open'";

  const [rows, staff] = await Promise.all([
    q<{ id: number; title: string; due_at: string | null; priority: string; status: string; contact_id: string | null; contact: string | null; assignee: string | null; tz: string }>(
      `select t.id, t.title, t.due_at, t.priority, t.status, t.contact_id, c.first_name || ' ' || coalesce(c.last_name,'') contact, u.name assignee, b.timezone tz
         from tasks t join branches b on b.id=t.branch_id left join contacts c on c.id=t.contact_id left join users u on u.id=t.assignee_id
        where ${where} order by ${showDone ? "t.completed_at desc" : "t.due_at nulls last, t.created_at"} limit 300`, p),
    visibleStaff(user),
  ]);
  const now = Date.now();

  return (
    <>
      <PageHeader title="Tasks" subtitle={team ? "Everyone in your branches" : "Assigned to you"}
        actions={<>
          <Link className={`btn btn-sm ${!team ? "btn-navy" : ""}`} href="/tasks">Mine</Link>
          {can(user, "tasks.all") && <Link className={`btn btn-sm ${team ? "btn-navy" : ""}`} href="/tasks?who=team">Team</Link>}
          <Link className="btn btn-sm" href={`/tasks?${team ? "who=team&" : ""}show=${showDone ? "open" : "done"}`}>{showDone ? "Show open" : "Done (30 days)"}</Link>
        </>} />

      <Card title="New task" className="mb-6">
        <ActionForm action={addTask} resetOnSuccess className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:items-end">
          <Field label="Task" htmlFor="title"><input className="input" id="title" name="title" required /></Field>
          <Field label="Due" htmlFor="due_at"><input className="input" id="due_at" type="datetime-local" name="due_at" /></Field>
          <Field label="Assign to" htmlFor="assignee_id"><select className="select" id="assignee_id" name="assignee_id" defaultValue={user.id}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Priority" htmlFor="priority"><select className="select" id="priority" name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field>
          <Submit className="btn btn-navy">Add</Submit>
        </ActionForm>
      </Card>

      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th className="w-10"><span className="sr-only">Done</span></th><th>Task</th><th>Student</th>{team && <th>Assigned to</th>}<th>Due</th></tr></thead>
            <tbody>{rows.map((t) => {
              const overdue = t.status === "open" && t.due_at && new Date(t.due_at).getTime() < now;
              return (
                <tr key={t.id}>
                  <td><form action={completeTask}><input type="hidden" name="id" value={t.id} /><button className={`grid h-6 w-6 place-items-center rounded-md border ${t.status === "done" ? "border-ok bg-ok text-white" : "border-line bg-white hover:border-navy"}`} aria-label={t.status === "done" ? "Reopen" : "Mark done"}>{t.status === "done" ? "✓" : ""}</button></form></td>
                  <td className={t.status === "done" ? "text-slate line-through" : "font-medium"}>{t.title}{t.priority === "high" && <span className="badge badge-red ml-2">High</span>}</td>
                  <td>{t.contact_id ? <Link href={`/contacts/${t.contact_id}`}>{t.contact}</Link> : "—"}</td>
                  {team && <td>{t.assignee ?? "—"}</td>}
                  <td className="whitespace-nowrap">{t.due_at ? <span className={overdue ? "font-semibold text-red" : ""}>{overdue ? "Overdue · " : ""}{dateTime(t.due_at, t.tz)}</span> : "—"}</td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title={showDone ? "Nothing finished in the last 30 days" : "No open tasks"}>Tasks created on a student's page or here appear in this list.</Empty>}
      </Card>
    </>
  );
}
