import { NextResponse, type NextRequest } from "next/server";
import { claimLead, failLead, saveLead } from "@/lib/ad-leads";
import { q1 } from "@/lib/db";
import { fetchLead, metaConfigured, validSignature } from "@/lib/meta";
import { open } from "@/lib/secret-box";

// Facebook's webhook. Facebook calls GET once to check the address, then POSTs each new lead's id.

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (metaConfigured() && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === process.env.META_VERIFY_TOKEN)
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  return new NextResponse("Forbidden", { status: 403 });
}

type Change = { field?: string; value?: { leadgen_id?: string | number; page_id?: string | number; form_id?: string | number } };

export async function POST(request: NextRequest) {
  if (!metaConfigured()) return new NextResponse("Not configured", { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000 || !validSignature(raw, request.headers.get("x-hub-signature-256"))) return new NextResponse("Bad signature", { status: 401 });
  let body: { object?: string; entry?: { id?: string; changes?: Change[] }[] };
  try { body = JSON.parse(raw); } catch { return new NextResponse("Bad JSON", { status: 400 }); }
  if (body.object !== "page") return NextResponse.json({ ok: true });

  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "leadgen" || !ch.value?.leadgen_id) continue;
      const pageId = String(ch.value.page_id ?? entry.id ?? "");
      const leadId = String(ch.value.leadgen_id);
      const src = await q1<{ id: number; branch_id: number; secret_enc: string | null }>(
        "select id, branch_id, secret_enc from lead_sources where kind='facebook' and active and external_id=$1", [pageId]);
      if (!src?.secret_enc) continue; // a page no branch has connected
      const eventId = await claimLead(src.id, src.branch_id, "facebook", leadId);
      if (!eventId) continue; // already handled
      try {
        const lead = await fetchLead(leadId, open(src.secret_enc));
        await saveLead(eventId, src.id, src.branch_id, lead);
      } catch (e) {
        await failLead(eventId, src.id, e instanceof Error ? e.message : "Couldn't read this lead from Facebook");
      }
    }
  }
  return NextResponse.json({ ok: true });
}
