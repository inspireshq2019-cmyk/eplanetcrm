"use server";

import { headers } from "next/headers";
import { addLead } from "@/lib/ad-leads";
import { q1, tx } from "@/lib/db";
import { date } from "@/lib/format";
import { consentText, VISIT_REASONS, DESTINATIONS, EDU_LEVELS, fieldModes, INTAKE_CHOICES, isOpen, LEVELS, type FormRow, type RegisterResult } from "@/lib/forms";
import { sha256 } from "@/lib/secret-box";


/** A student registering through an event form. Anyone with the link can submit, so everything is checked here. */
export async function register(_: RegisterResult, f: FormData): Promise<RegisterResult> {
  const slug = String(f.get("slug") ?? "");
  const form = await q1<FormRow & { branch: string; timezone: string; country_code: string }>(
    `select f.id, f.branch_id, f.slug, f.title, f.kind, f.event_date::text, f.fields, f.questions, f.owner_id, f.follow_up, f.thank_you, f.active, f.closes_on::text,
            b.name branch, b.timezone, b.country_code
       from lead_forms f join branches b on b.id=f.branch_id where f.slug=$1`, [slug]);
  if (!form) return { error: "This form no longer exists." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: form.timezone }).format(new Date());
  if (!isOpen(form, today)) return { error: "Registration for this event has closed. Please speak to the Eplanet team." };
  // Sent from the form shown inside a page of the Eplanet website, rather than from a QR code at an event.
  const web = f.get("embed") === "1";
  // A walk-in form: the QR code at reception. The visitor also joins today's check-in queue.
  const walkIn = form.kind === "walk_in" && !web;
  const thanks = form.thank_you || (walkIn ? "Thank you, you're checked in. Please take a seat and a counsellor will be with you shortly."
    : web ? "Thank you for your enquiry. An Eplanet counsellor will contact you soon." : "Thank you for registering. An Eplanet counsellor will contact you soon.");
  if (String(f.get("website") ?? "")) return { ok: thanks }; // hidden field only bots fill in
  if (f.get("preview") === "1") return { ok: `Preview only: nothing was saved. Students will see: “${thanks}”` };

  const str = (k: string, max: number) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const errors: Record<string, string> = {};
  const modes = fieldModes(form.fields);
  const need = (k: keyof typeof modes, v: unknown) => { if (modes[k] === "required" && (!v || (Array.isArray(v) && !v.length))) errors[k] = "Please answer this."; };

  const name = str("full_name", 150);
  if (name.length < 2) errors.full_name = "Please enter your full name.";
  const phoneRaw = str("phone", 30);
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) errors.phone = "Please enter a mobile number we can call, e.g. 01712 345678.";
  const email = modes.email === "off" ? "" : str("email", 150).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Please check your email address.";
  need("email", email);
  const dest = modes.destination === "off" ? [] : f.getAll("destination").map(String).filter((d) => DESTINATIONS.some(([k]) => k === d));
  need("destination", dest);
  const level = modes.level === "off" ? "" : str("level", 20);
  const levelOk = LEVELS.some(([k]) => k === level) ? level : "";
  need("level", levelOk);
  const intake = modes.intake === "off" ? "" : str("intake", 40);
  const intakeOk = INTAKE_CHOICES.includes(intake) ? intake : "";
  need("intake", intakeOk);
  const edu = modes.education === "off" ? "" : str("education", 40);
  const eduLabel = EDU_LEVELS.find(([k]) => k === edu)?.[1] ?? "";
  need("education", eduLabel);
  const english = modes.english === "off" ? "" : str("english", 100);
  need("english", english);
  const city = modes.city === "off" ? "" : str("city", 100);
  need("city", city);
  const message = modes.message === "off" ? "" : String(f.get("message") ?? "").trim().slice(0, 1000);
  need("message", message);
  const extra: [string, string][] = [];
  form.questions.forEach((qq, i) => {
    let v = str(`q${i}`, 500);
    if (qq.type === "choice" && v && !qq.options.includes(v)) v = "";
    if (qq.required && !v) errors[`q${i}`] = "Please answer this.";
    if (v) extra.push([qq.label, v]);
  });
  const reason = walkIn ? str("reason", 60) : "";
  if (walkIn && !VISIT_REASONS.includes(reason)) errors.reason = "Please choose why you're visiting today.";
  if (f.get("consent") !== "on") errors.consent = "Please tick this box so we can contact you.";
  if (Object.keys(errors).length) return { error: "Please check the highlighted answers.", fieldErrors: errors };

  // Many students at a fair share the venue's Wi-Fi, so the limit is generous; it only stops a runaway script.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  const ipHash = ip ? sha256(`${process.env.SESSION_SECRET ?? ""}:${ip}`) : null;
  if (ipHash) {
    const recent = await q1<{ n: number }>("select count(*)::int n from form_submissions where ip_hash=$1 and created_at > now() - interval '10 minutes'", [ipHash]);
    if ((recent?.n ?? 0) >= 300) return { error: "Too many registrations from this network just now. Please try again in a few minutes." };
  }

  const pageRaw = String(f.get("page") ?? "").slice(0, 300);
  const page = web && /^https?:\/\/[^\s]+$/.test(pageRaw) ? pageRaw : "";
  const about = walkIn ? `walk-in form at the ${form.branch} office` : web ? `website form “${form.title}”` : `event form “${form.title}”${form.event_date ? ` (${date(form.event_date)})` : ""}`;
  const answers: [string, string][] = [
    ...(eduLabel ? [["Last completed education", eduLabel] as [string, string]] : []),
    ...(english ? [["English test", english] as [string, string]] : []),
    ...(intakeOk ? [["Wants to start", intakeOk] as [string, string]] : []),
    ...extra,
    ...(message ? [["Question for Eplanet", message] as [string, string]] : []),
    ...(page ? [["Sent from website page", page] as [string, string]] : []),
    ...(reason ? [["Reason for visit", reason] as [string, string]] : []),
  ];
  await tx(async (db) => {
    const r = await addLead(db, form.branch_id,
      { channel: "form", full: name, email, phone: phoneRaw, city, answers, destinations: dest, level: levelOk || null, intake: intakeOk || null },
      { source: walkIn ? "walk_in" : web ? "website" : "event", about, tags: [walkIn ? "walk-in" : web ? "website" : "event", `form-${form.slug}`], ownerId: form.owner_id,
        consent: `${walkIn ? "Checked in through the" : web ? "Sent an enquiry through the" : "Registered on the"} ${about} and agreed: ${consentText(form.branch)}`,
        // A walk-in is being seen in the office now, so no call task.
        task: form.follow_up && !walkIn ? { title: (n, existing) => `${existing ? "Follow up" : "Call"} ${n}: ${web ? "website enquiry" : `registered for ${form.title}`}`, due: "1 day", priority: "normal" } : null });
    await db.query("insert into form_submissions(form_id,contact_id,status,ip_hash) values($1,$2,$3,$4)", [form.id, r.contactId, r.status, ipHash]);
    if (walkIn) {
      // Into today's queue at reception, once: scanning twice doesn't add them twice.
      const c = (await db.query<{ name: string; phone: string | null; owner_id: string | null; branch_id: number }>(
        "select trim(first_name || ' ' || coalesce(last_name,'')) name, phone, owner_id, branch_id from contacts where id=$1", [r.contactId])).rows[0];
      const already = await db.query(
        `select 1 from checkins where contact_id=$1 and branch_id=$2 and status in ('waiting','attending') and (arrived_at at time zone $3)::date = (now() at time zone $3)::date`,
        [r.contactId, form.branch_id, form.timezone]);
      if (!already.rowCount) {
        await db.query("insert into checkins(branch_id,contact_id,visitor_name,phone,purpose,host_id) values($1,$2,$3,$4,$5,$6)",
          [form.branch_id, r.contactId, c?.name || name, c?.phone ?? phoneRaw, `${reason} (self check-in)`, c?.branch_id === form.branch_id ? c.owner_id : null]);
        await db.query("insert into activities(contact_id,kind,body) values($1,'checkin',$2)", [r.contactId, `Checked in at the ${form.branch} office by scanning the QR code: ${reason}.`]);
      }
    }
  });
  return { ok: thanks };
}
