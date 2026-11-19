import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingLead } from "./ad-leads";

// Facebook / Instagram Lead Ads, through Eplanet's own Meta app.
// META_APP_ID, META_APP_SECRET and META_VERIFY_TOKEN come from the Meta developer dashboard.
export const metaConfigured = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN);
const VERSION = () => process.env.META_GRAPH_VERSION || "v27.0";
const GRAPH = () => (process.env.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
export const META_SCOPES = (process.env.META_SCOPES ||
  "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_ads,leads_retrieval,ads_management,business_management").split(",");

export function dialogUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: redirectUri, state, scope: META_SCOPES.join(","), response_type: "code" });
  return `${process.env.META_DIALOG_BASE || "https://www.facebook.com"}/${VERSION()}/dialog/oauth?${p}`;
}

export class GraphError extends Error {}

async function graph<T>(path: string, params: Record<string, string>, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T> {
  const url = new URL(`${GRAPH()}/${VERSION()}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams(params);
  if (method === "GET") url.search = body.toString();
  const r = await fetch(url, { method, body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(15000), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!r.ok || j.error) throw new GraphError(j.error?.message ? `Facebook said: ${j.error.message}` : `Facebook returned ${r.status}`);
  return j;
}

/** Exchanges the sign-in code for a long-lived user token, then lists the pages that person manages. */
export async function pagesFromCode(code: string, redirectUri: string) {
  const short = await graph<{ access_token: string }>("oauth/access_token", {
    client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirectUri, code });
  const long = await graph<{ access_token: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: short.access_token });
  const pages: { id: string; name: string; access_token: string; tasks?: string[] }[] = [];
  let after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const r = await graph<{ data: typeof pages; paging?: { cursors?: { after?: string }; next?: string } }>("me/accounts", {
      access_token: long.access_token, fields: "id,name,access_token,tasks", limit: "100", ...(after ? { after } : {}) });
    pages.push(...r.data);
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return pages.filter((p) => p.access_token);
}

/** Tells Facebook to send this page's new leads to the CRM. */
export async function subscribePage(pageId: string, pageToken: string) {
  await graph(`${pageId}/subscribed_apps`, { subscribed_fields: "leadgen", access_token: pageToken }, "POST");
}

export async function unsubscribePage(pageId: string, pageToken: string) {
  await graph(`${pageId}/subscribed_apps`, { access_token: pageToken }, "DELETE");
}

/** Checks the X-Hub-Signature-256 header Facebook sends with every webhook. */
export function validSignature(raw: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", process.env.META_APP_SECRET!).update(raw, "utf8").digest("hex");
  const a = Buffer.from(header.slice(7)), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type FbLead = { id: string; created_time?: string; field_data?: { name: string; values?: string[] }[]; form_id?: string; platform?: string };

/** Reads one lead's answers, and the form's name, with the page's token. */
export async function fetchLead(leadId: string, pageToken: string): Promise<IncomingLead> {
  let lead: FbLead;
  try {
    lead = await graph<FbLead>(leadId, { access_token: pageToken, fields: "id,created_time,field_data,form_id,platform" });
  } catch {
    lead = await graph<FbLead>(leadId, { access_token: pageToken, fields: "id,created_time,field_data,form_id" });
  }
  let formName: string | null = null;
  if (lead.form_id) formName = (await graph<{ name?: string }>(lead.form_id, { access_token: pageToken, fields: "name" }).catch(() => null))?.name ?? null;
  return { ...fromFieldData(lead.field_data ?? []), channel: /^(ig|instagram)$/i.test(lead.platform ?? "") ? "instagram" : "facebook",
    formName, submittedAt: lead.created_time ? new Date(lead.created_time) : null };
}

const STANDARD: Record<string, "first" | "last" | "full" | "email" | "phone" | "city"> = {
  full_name: "full", first_name: "first", last_name: "last", email: "email", work_email: "email", phone_number: "phone", work_phone_number: "phone", city: "city",
};

export function fromFieldData(fields: { name: string; values?: string[] }[]): Pick<IncomingLead, "first" | "last" | "full" | "email" | "phone" | "city" | "answers"> {
  const out: ReturnType<typeof fromFieldData> = { answers: [] };
  for (const f of fields) {
    const v = (f.values ?? []).join(", ").trim();
    if (!v) continue;
    const k = STANDARD[f.name.toLowerCase()];
    if (k && !out[k]) out[k] = v;
    else out.answers.push([f.name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), v]);
  }
  return out;
}
