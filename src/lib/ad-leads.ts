import "server-only";
import type { PoolClient } from "pg";
import { q, q1, tx } from "./db";
import { normalisePhone } from "./phone";
import { toDestinations, toLevel } from "./import-fields";

export type Channel = "facebook" | "instagram" | "google" | "form";
export const CHANNEL_NAME: Record<Channel, string> = { facebook: "Facebook", instagram: "Instagram", google: "Google Ads", form: "Event form" };

/** One lead form submission, already read from Facebook or Google. */
export type IncomingLead = {
  channel: Channel;
  first?: string; last?: string; full?: string; email?: string; phone?: string; city?: string;
  answers: [question: string, answer: string][]; // every other question on the form
  formName?: string | null;
  campaign?: string | null;
  submittedAt?: Date | null;
};

/**
 * Records that a lead has arrived. Returns the event id to process, or null when this lead was
 * already handled (Facebook and Google may deliver the same lead more than once). A lead that
 * failed before is handed back for another try.
 */
export async function claimLead(sourceId: number, branchId: number, kind: "facebook" | "google", externalLeadId: string, status: "processing" | "test" = "processing") {
  const r = await q1<{ id: string }>(
    `insert into lead_events(source_id,branch_id,kind,external_lead_id,status) values($1,$2,$3,$4,$5)
     on conflict (kind, external_lead_id) do update set status=excluded.status, error=null, received_at=now()
       where lead_events.status='error'
     returning id`, [sourceId, branchId, kind, externalLeadId.slice(0, 200), status]);
  return r?.id ?? null;
}

export async function failLead(eventId: string, sourceId: number, message: string) {
  const m = message.slice(0, 300);
  await q("update lead_events set status='error', error=$2 where id=$1", [eventId, m]);
  await q("update lead_sources set last_error=$2, last_error_at=now() where id=$1", [sourceId, m]);
}

const clean = (v: string | undefined | null, max = 150) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const validEmail = (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null);

async function branchHead(db: PoolClient, branchId: number) {
  const r = await db.query<{ id: string }>(
    `select id from users where active and role_key='branch_head' and primary_branch_id=$1 order by created_at limit 1`, [branchId]);
  return r.rows[0]?.id ?? null;
}

/** The branch counsellor who has gone longest without a new ad lead. */
async function nextCounsellor(db: PoolClient, branchId: number) {
  const r = await db.query<{ id: string }>(
    `select u.id from users u
      where u.active and u.role_key='counsellor' and u.email not like '%.invalid'
        and (u.primary_branch_id=$1 or exists (select 1 from user_branches ub where ub.user_id=u.id and ub.branch_id=$1))
      order by (select max(c.created_at) from contacts c where c.owner_id=u.id and 'ad-lead' = any(c.tags)) asc nulls first, u.name
      limit 1`, [branchId]);
  return r.rows[0]?.id ?? null;
}

/** What to record with a lead, decided by where it came from. */
export type LeadContext = {
  source: string;            // contacts.source, e.g. facebook, google_ads, event
  about: string;             // shown as the source detail and in the timeline, e.g. Facebook lead form “Study in Australia”
  tags: string[];
  consent: string;
  ownerId?: string | null;   // a set counsellor; otherwise the branch's rule decides
  task: { title: (name: string, existing: boolean) => string; due: "1 hour" | "1 day"; priority: "high" | "normal" } | null;
};

/** Adds a new lead to the branch, or adds the enquiry to the student who already has that mobile or email. */
export async function addLead(db: PoolClient, branchId: number, lead: IncomingLead & { destinations?: string[]; level?: string | null; intake?: string | null }, ctx: LeadContext) {
  const br = (await db.query<{ country_code: string; lead_assign: string }>("select country_code, lead_assign from branches where id=$1", [branchId])).rows[0];
  let first = clean(lead.first, 100), last = clean(lead.last, 100);
  if (!first && lead.full) { const parts = clean(lead.full, 200).split(" "); first = parts.shift() ?? ""; last = last || parts.join(" "); }
  const email = validEmail(clean(lead.email, 150));
  const phone = normalisePhone(clean(lead.phone, 40), br.country_code);
  const name = [first, last].filter(Boolean).join(" ") || email || phone || "New enquiry";
  const answers = lead.answers.map(([qn, a]) => [clean(qn, 120), clean(a, 500)] as const).filter(([, a]) => a);
  const answerText = answers.map(([qn, a]) => `${qn}: ${a}`).join("\n");

  const existing = phone || email
    ? (await db.query<{ id: string; owner_id: string | null; branch_id: number }>(
        "select id, owner_id, branch_id from contacts where ($1::text is not null and phone=$1) or ($2::text is not null and lower(email)=$2) order by created_at limit 1", [phone, email])).rows[0]
    : undefined;

  let contactId: string, owner: string | null;
  if (existing) {
    contactId = existing.id;
    owner = existing.owner_id;
    await db.query("insert into activities(contact_id,kind,body) values($1,'system',$2)", [contactId, `New enquiry through ${ctx.about}`]);
    if (ctx.tags.length) await db.query("update contacts set tags=(select array_agg(distinct t) from unnest(tags || $2::text[]) t), updated_at=now() where id=$1", [contactId, ctx.tags]);
  } else {
    owner = ctx.ownerId ?? (br.lead_assign === "rotate" ? await nextCounsellor(db, branchId) : null);
    const pick = (re: RegExp) => answers.filter(([qn]) => re.test(qn)).map(([, a]) => a).join(", ");
    const c = await db.query<{ id: string }>(
      `insert into contacts(first_name,last_name,email,phone,whatsapp,city,stage,source,source_detail,interested_destinations,interested_level,intake,
                            branch_id,owner_id,tags,consent_at,consent_source)
       values($1,$2,$3,$4,$4,$5,'lead',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [first || name.slice(0, 100), last || null, email, phone, clean(lead.city, 100) || null, ctx.source, ctx.about.slice(0, 200),
       lead.destinations ?? toDestinations(pick(/countr|destination|where/i)), lead.level !== undefined ? lead.level : toLevel(pick(/level|degree|study|program/i)),
       (lead.intake !== undefined ? clean(lead.intake, 50) : clean(pick(/intake|when/i), 50)) || null,
       branchId, owner, ctx.tags, lead.submittedAt ?? new Date(), ctx.consent.slice(0, 300)]);
    contactId = c.rows[0].id;
    await db.query("insert into activities(contact_id,kind,body) values($1,'system',$2)", [contactId, `New lead from the ${ctx.about}`]);
    await db.query("insert into audit_log(action,entity,entity_id,after) values('create','contact',$1,$2)", [contactId, JSON.stringify({ source: ctx.source, via: ctx.about.slice(0, 100) })]);
  }
  if (answerText) await db.query("insert into activities(contact_id,kind,body) values($1,'note',$2)", [contactId, `Answers on the form:\n${answerText}`.slice(0, 4000)]);
  if (ctx.task) {
    const assignee = owner ?? (await branchHead(db, existing?.branch_id ?? branchId));
    await db.query(
      `insert into tasks(title,description,due_at,priority,assignee_id,branch_id,contact_id) values($1,$2,now() + $3::interval,$4,$5,$6,$7)`,
      [ctx.task.title(name, !!existing).slice(0, 200), owner ? null : "No counsellor is assigned yet. Assign one from the student's page.",
       ctx.task.due, ctx.task.priority, assignee, existing?.branch_id ?? branchId, contactId]);
  }
  return { contactId, status: (existing ? "existing" : "created") as "created" | "existing" };
}

/** Saves a lead delivered by Facebook or Google and marks its delivery as handled. */
export async function saveLead(eventId: string, sourceId: number, branchId: number, lead: IncomingLead) {
  return tx(async (db) => {
    const label = CHANNEL_NAME[lead.channel];
    const form = clean(lead.formName, 120);
    const about = `${label} lead form${form ? ` “${form}”` : ""}${lead.campaign ? ` (campaign ${clean(lead.campaign, 80)})` : ""}`;
    const r = await addLead(db, branchId, lead, {
      source: lead.channel === "google" ? "google_ads" : "facebook", about, tags: ["ad-lead", lead.channel],
      consent: `Submitted the ${about}, which shows the privacy notice`,
      task: { title: (name, existing) => existing ? `Call back ${name}: new ${label} enquiry` : `Call new ${label} lead: ${name}`, due: "1 hour", priority: "high" },
    });
    await db.query("update lead_events set status=$2, contact_id=$3 where id=$1", [eventId, r.status, r.contactId]);
    await db.query("update lead_sources set last_lead_at=now(), last_error=null, last_error_at=null where id=$1", [sourceId]);
    return r;
  });
}
