"use server";

import { revalidatePath } from "next/cache";
import { canSeeBranch, requireUser } from "@/lib/auth";
import { z } from "zod";
import { loadApplicationForUser, loadContactForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import type { ActionResult } from "@/components/action-form";

/** Converts a datetime-local value (in the branch's time zone) to UTC. */
async function toUtc(local: string | null, branchId: number) {
  if (!local) return null;
  const tz = (await q1<{ timezone: string }>("select timezone from branches where id=$1", [branchId]))?.timezone ?? "UTC";
  const r = await q1<{ t: string }>("select ($1::timestamp at time zone $2)::text t", [local, tz]);
  return r?.t ?? null;
}

export async function addTask(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const title = String(f.get("title") ?? "").trim();
  if (!title) return { error: "Describe the task." };
  const contactId = String(f.get("contact_id") ?? "") || null;
  const applicationId = String(f.get("application_id") ?? "") || null;
  let branchId = Number(f.get("branch_id") || u.primaryBranchId);
  if (contactId) {
    const c = await loadContactForUser(u, contactId);
    if (!c) return { error: "You can't add tasks for this student." };
    branchId = c.branch_id;
  }
  if (applicationId) {
    const a = await loadApplicationForUser(u, applicationId);
    if (!a) return { error: "You can't add tasks to this application." };
    branchId = a.branch_id;
  }
  if (!canSeeBranch(u, branchId)) return { error: "You can't add tasks in that branch." };
  const assignee = String(f.get("assignee_id") ?? "") || u.id;
  if (!z.uuid().safeParse(assignee).success || !(await q1("select 1 from users where id=$1 and active", [assignee]))) return { error: "Choose who the task is for." };
  const priority = ["low", "normal", "high"].includes(String(f.get("priority"))) ? String(f.get("priority")) : "normal";
  const due = await toUtc(String(f.get("due_at") ?? "") || null, branchId);
  await q(
    `insert into tasks(title,description,due_at,priority,assignee_id,branch_id,contact_id,application_id,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [title.slice(0, 300), String(f.get("description") ?? "").slice(0, 2000) || null, due, priority, assignee, branchId, contactId, applicationId, u.id]);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/tasks");
  return { ok: "Task added." };
}

export async function completeTask(f: FormData) {
  const u = await requireUser();
  const id = Number(f.get("id"));
  const t = await q1<{ branch_id: number; assignee_id: string | null; contact_id: string | null; status: string }>("select branch_id, assignee_id, contact_id, status from tasks where id=$1", [id]);
  if (!t || !canSeeBranch(u, t.branch_id)) return;
  if (t.assignee_id !== u.id && !u.permissions.has("tasks.all") && u.scope === "own") return;
  const done = t.status !== "done";
  await q("update tasks set status=$2, completed_at=case when $2='done' then now() else null end where id=$1", [id, done ? "done" : "open"]);
  if (done && t.contact_id) {
    const title = (await q1<{ title: string }>("select title from tasks where id=$1", [id]))?.title;
    await q("insert into activities(contact_id,kind,body,user_id) values($1,'task',$2,$3)", [t.contact_id, `Completed task: ${title}`, u.id]);
    revalidatePath(`/contacts/${t.contact_id}`);
  }
  revalidatePath("/tasks");
  revalidatePath("/");
}
