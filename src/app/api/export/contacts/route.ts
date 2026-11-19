import { NextResponse, type NextRequest } from "next/server";
import { audit, can, getCurrentUser, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  // Neutralise spreadsheet formulas so exported data can't run as a formula in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// Exports the student list with the same filters as the list page. Passport numbers are never exported.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "contacts.export")) return new NextResponse("Not allowed", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const p: unknown[] = [];
  const where = [scopeWhere(user, "c", p, { ownerColumn: "owner_id" })];
  if (sp.get("q")) { p.push(`%${sp.get("q")}%`); where.push(`(c.first_name || ' ' || coalesce(c.last_name,'') ilike $${p.length} or c.email ilike $${p.length} or c.phone ilike $${p.length})`); }
  if (sp.get("stage")) { p.push(sp.get("stage")); where.push(`c.stage=$${p.length}`); }
  if (sp.get("branch")) { p.push(Number(sp.get("branch"))); where.push(`c.branch_id=$${p.length}`); }
  if (sp.get("dest")) { p.push(sp.get("dest")); where.push(`$${p.length}=any(c.interested_destinations)`); }
  if (sp.get("source")) { p.push(sp.get("source")); where.push(`c.source=$${p.length}`); }
  if (sp.get("owner") === "none") where.push("c.owner_id is null"); else if (sp.get("owner")) { p.push(sp.get("owner")); where.push(`c.owner_id=$${p.length}`); }

  const rows = await q(
    `select c.ref, c.stage, c.first_name, c.last_name, c.phone, c.whatsapp, c.email, c.city, c.interested_destinations, c.interested_level,
            c.interested_field, c.intake, c.source, c.source_detail, b.name branch, u.name counsellor, c.tags, c.created_at::date created
       from contacts c join branches b on b.id=c.branch_id left join users u on u.id=c.owner_id
      where ${where.join(" and ")} order by c.created_at desc limit 20000`, p);
  const head = ["Ref", "Status", "First name", "Last name", "Mobile", "WhatsApp", "Email", "City", "Countries", "Level", "Subject", "Intake", "Source", "Source details", "Branch", "Counsellor", "Tags", "Added"];
  const keys = ["ref", "stage", "first_name", "last_name", "phone", "whatsapp", "email", "city", "interested_destinations", "interested_level", "interested_field", "intake", "source", "source_detail", "branch", "counsellor", "tags", "created"];
  const csv = "﻿" + [head.join(","), ...rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(","))].join("\r\n");
  await audit(user, "export", "contacts", null, undefined, { rows: rows.length, filters: Object.fromEntries(sp) });
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="eplanet-students-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
