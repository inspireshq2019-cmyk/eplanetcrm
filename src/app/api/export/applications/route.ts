import { NextResponse, type NextRequest } from "next/server";
import { audit, can, getCurrentUser, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "reports.view")) return new NextResponse("Not allowed", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const p: unknown[] = [];
  const where = [scopeWhere(user, "a", p, { ownerColumn: "owner_id" })];
  const status = sp.get("status") ?? "open";
  if (status !== "all") { p.push(status); where.push(`a.status=$${p.length}`); }
  if (sp.get("dest")) { p.push(sp.get("dest")); where.push(`a.destination=$${p.length}`); }
  if (sp.get("branch")) { p.push(Number(sp.get("branch"))); where.push(`a.branch_id=$${p.length}`); }
  if (sp.get("owner")) { p.push(sp.get("owner")); where.push(`a.owner_id=$${p.length}`); }
  if (sp.get("channel")) { p.push(sp.get("channel")); where.push(`a.channel=$${p.length}`); }
  const rows = await q(
    `select a.ref, c.ref student_ref, c.first_name || ' ' || coalesce(c.last_name,'') student, a.destination, pa.name institution, coalesce(co.title,a.course_title) course,
            a.intake, s.name step, a.status, a.channel, a.tuition_fee, a.fee_currency, a.onshore_transfer, a.accepted_date, u.name counsellor, b.name branch,
            a.created_at::date started, a.updated_at::date updated
       from applications a join contacts c on c.id=a.contact_id join workflow_stages s on s.id=a.stage_id left join partners pa on pa.id=a.partner_id
       left join courses co on co.id=a.course_id left join users u on u.id=a.owner_id join branches b on b.id=a.branch_id
      where ${where.join(" and ")} order by a.updated_at desc limit 20000`, p);
  const keys = ["ref", "student_ref", "student", "destination", "institution", "course", "intake", "step", "status", "channel", "tuition_fee", "fee_currency", "onshore_transfer", "accepted_date", "counsellor", "branch", "started", "updated"];
  const csv = "﻿" + [keys.join(","), ...rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(","))].join("\r\n");
  await audit(user, "export", "applications", null, undefined, { rows: rows.length });
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="eplanet-applications-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
