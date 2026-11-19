import { NextResponse, type NextRequest } from "next/server";
import { audit, can, getCurrentUser } from "@/lib/auth";
import { buildReport, parseRange, REPORT_KEYS } from "@/lib/reports";

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "reports.view")) return new NextResponse("Not allowed", { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const key = sp.key ?? "";
  if (!(REPORT_KEYS as readonly string[]).includes(key)) return new NextResponse("Unknown report", { status: 400 });
  const range = parseRange(sp);
  if (range.branch && user.scope !== "all" && !user.branchIds.includes(range.branch)) return new NextResponse("Not allowed", { status: 403 });
  const r = await buildReport(user, key, range);
  if (!r) return new NextResponse("Not allowed", { status: 403 });
  const csv = "﻿" + [r.columns.map((c) => esc(c.label)).join(","), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(","))].join("\r\n");
  await audit(user, "export", "report", key, undefined, { ...range, rows: r.rows.length });
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="eplanet-${key}-${range.from}-to-${range.to}.csv"` } });
}
