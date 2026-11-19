import { NextResponse, type NextRequest } from "next/server";
import { claimLead, failLead, saveLead, type IncomingLead } from "@/lib/ad-leads";
import { q, q1 } from "@/lib/db";
import { open, sameSecret, sha256 } from "@/lib/secret-box";

// Google Ads lead form webhook. Each branch connection has its own address and key.
// Google expects {} with 200 on success, 4xx for requests it should not retry, 5xx for ones it should.

type Column = { column_id?: string; column_name?: string; string_value?: string };
type Body = { lead_id?: string; google_key?: string; user_column_data?: Column[]; form_id?: string | number; campaign_id?: string | number; is_test?: boolean; lead_submit_time?: string };

const STANDARD: Record<string, "first" | "last" | "full" | "email" | "phone" | "city"> = {
  FULL_NAME: "full", FIRST_NAME: "first", LAST_NAME: "last", EMAIL: "email", WORK_EMAIL: "email", PHONE_NUMBER: "phone", WORK_PHONE: "phone", CITY: "city",
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const src = await q1<{ id: number; branch_id: number; secret_enc: string | null; name: string }>(
    "select id, branch_id, secret_enc, name from lead_sources where kind='google' and active and url_token_hash=$1", [sha256(token)]);
  if (!src?.secret_enc) return NextResponse.json({ message: "Unknown webhook address" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 200_000) return NextResponse.json({ message: "Too large" }, { status: 413 });
  let body: Body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ message: "Bad JSON" }, { status: 400 }); }
  const { key } = JSON.parse(open(src.secret_enc)) as { key: string };
  if (typeof body.google_key !== "string" || !sameSecret(body.google_key, key))return NextResponse.json({ message: "Wrong key" }, { status: 403 });
  if (!body.lead_id) return NextResponse.json({ message: "No lead_id" }, { status: 400 });

  if (body.is_test) {
    // "Send test data" in Google Ads: confirm the connection works without adding a pretend student.
    await q("update lead_sources set last_test_at=now() where id=$1", [src.id]);
    await claimLead(src.id, src.branch_id, "google", `test:${body.lead_id}:${Date.now()}`, "test");
    return NextResponse.json({});
  }
  const eventId = await claimLead(src.id, src.branch_id, "google", String(body.lead_id));
  if (!eventId) return NextResponse.json({}); // already received

  const lead: IncomingLead = { channel: "google", answers: [], campaign: body.campaign_id ? String(body.campaign_id) : null,
    formName: body.form_id ? `Google form ${body.form_id}` : null, submittedAt: body.lead_submit_time ? new Date(body.lead_submit_time) : null };
  if (lead.submittedAt && Number.isNaN(lead.submittedAt.getTime())) lead.submittedAt = null;
  for (const c of body.user_column_data ?? []) {
    const v = (c.string_value ?? "").trim();
    if (!v) continue;
    const k = STANDARD[(c.column_id ?? "").toUpperCase()];
    if (k && !lead[k]) lead[k] = v;
    else lead.answers.push([c.column_name || (c.column_id ?? "Answer").replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase()), v]);
  }
  try {
    await saveLead(eventId, src.id, src.branch_id, lead);
    return NextResponse.json({});
  } catch (e) {
    await failLead(eventId, src.id, e instanceof Error ? e.message : "Couldn't save this lead");
    return NextResponse.json({ message: "Temporary problem, please retry" }, { status: 500 });
  }
}
