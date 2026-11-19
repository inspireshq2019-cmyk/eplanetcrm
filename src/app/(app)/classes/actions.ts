"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, canSeeBranch, requireUser } from "@/lib/auth";
import { resolveContact } from "@/lib/contact-pick";
import { q, q1 } from "@/lib/db";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => (str(f, k) === null ? null : Number(str(f, k)));

async function loadClass(id: number) {
  return q1<{ id: number; branch_id: number; capacity: number | null; name: string }>("select id, branch_id, capacity, name from classes where id=$1", [id]);
}

export async function createClass(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "classes.manage")) return { error: "Your role can't create classes." };
  const branchId = Number(f.get("branch_id"));
  if (!canSeeBranch(u, branchId)) return { error: "Choose your branch." };
  const name = str(f, "name");
  if (!name) return { error: "Give the class a name, e.g. IELTS Evening Batch 12." };
  const r = await q<{ id: number }>(
    `insert into classes(branch_id,name,test,start_date,end_date,schedule,trainer_id,capacity,fee,currency,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [branchId, name, str(f, "test") ?? "IELTS", str(f, "start_date"), str(f, "end_date"), str(f, "schedule"), z.uuid().safeParse(str(f, "trainer_id")).success ? str(f, "trainer_id") : null, num(f, "capacity"), num(f, "fee"),
     str(f, "currency"), ["planned", "running", "completed", "cancelled"].includes(str(f, "status") ?? "") ? str(f, "status") : "planned"]);
  redirect(`/classes/${r[0].id}`);
}

export async function enrol(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const k = await loadClass(Number(f.get("class_id")));
  if (!k || !can(u, "classes.manage") || !canSeeBranch(u, k.branch_id)) return { error: "You can't change this class." };
  const c = await resolveContact(u, str(f, "contact") ?? "");
  if (!c) return { error: "Choose a student from the list (type a name or C-number)." };
  const n = (await q1<{ n: number }>("select count(*) n from class_enrolments where class_id=$1 and status<>'dropped'", [k.id]))?.n ?? 0;
  if (k.capacity && n >= k.capacity) return { error: `The class is full (${k.capacity} places).` };
  await q("insert into class_enrolments(class_id,contact_id) values($1,$2) on conflict (class_id,contact_id) do update set status='enrolled'", [k.id, c.id]);
  await q("insert into activities(contact_id,kind,body,user_id) values($1,'class',$2,$3)", [c.id, `Enrolled in ${k.name}`, u.id]);
  revalidatePath(`/classes/${k.id}`);
  return { ok: "Student enrolled." };
}

export async function setEnrolmentStatus(f: FormData) {
  const u = await requireUser();
  const k = await loadClass(Number(f.get("class_id")));
  if (!k || !can(u, "classes.manage") || !canSeeBranch(u, k.branch_id)) return;
  const status = String(f.get("status"));
  if (!["enrolled", "completed", "dropped"].includes(status)) return;
  await q("update class_enrolments set status=$3 where class_id=$1 and contact_id=$2", [k.id, String(f.get("contact_id")), status]);
  revalidatePath(`/classes/${k.id}`);
}

export async function saveAttendance(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const k = await loadClass(Number(f.get("class_id")));
  if (!k || !can(u, "classes.manage") || !canSeeBranch(u, k.branch_id)) return { error: "You can't change this class." };
  const day = str(f, "session_date");
  if (!day) return { error: "Choose the class date." };
  const present = new Set(f.getAll("present").map(String));
  const roster = await q<{ contact_id: string }>("select contact_id from class_enrolments where class_id=$1 and status='enrolled'", [k.id]);
  for (const r of roster)
    await q(`insert into class_attendance(class_id,contact_id,session_date,present) values($1,$2,$3,$4)
             on conflict (class_id,contact_id,session_date) do update set present=excluded.present`, [k.id, r.contact_id, day, present.has(r.contact_id)]);
  revalidatePath(`/classes/${k.id}`);
  return { ok: `Attendance saved for ${day}: ${present.size} of ${roster.length} present.` };
}

export async function addMock(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const k = await loadClass(Number(f.get("class_id")));
  if (!k || !can(u, "classes.manage") || !canSeeBranch(u, k.branch_id)) return { error: "You can't change this class." };
  const contactId = str(f, "contact_id");
  if (!contactId) return { error: "Choose the student." };
  const parts = ["listening", "reading", "writing", "speaking"].map((x) => num(f, x));
  let overall = num(f, "overall");
  // IELTS overall = average of the four bands, rounded to the nearest half band (.25 rounds up to .5, .75 up to the next whole band).
  if (overall === null && parts.every((x) => x !== null)) overall = Math.round(((parts as number[]).reduce((a, b) => a + b, 0) / 4) * 2) / 2;
  await q("insert into mock_scores(class_id,contact_id,taken_on,listening,reading,writing,speaking,overall) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [k.id, contactId, str(f, "taken_on") ?? new Date().toISOString().slice(0, 10), ...parts, overall]);
  revalidatePath(`/classes/${k.id}`);
  return { ok: `Mock score saved${overall !== null ? ` (overall ${overall})` : ""}.` };
}
