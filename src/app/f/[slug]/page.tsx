import type { Metadata } from "next";
import type { ReactNode } from "react";
import { q1 } from "@/lib/db";
import { date } from "@/lib/format";
import { consentText, DESTINATIONS, EDU_LEVELS, fieldModes, INTAKE_CHOICES, isOpen, LEVELS, STANDARD_FIELDS, type FormRow } from "@/lib/forms";
import { RegisterForm } from "./register-form";

type PublicForm = FormRow & { branch: string; timezone: string; phone: string | null; country_code: string };

async function load(slug: string) {
  if (!/^[a-z0-9]{6,12}$/.test(slug)) return null;
  return q1<PublicForm>(
    `select f.id, f.branch_id, f.slug, f.title, f.intro, to_char(f.event_date,'YYYY-MM-DD') event_date, f.event_time, f.venue, f.fields, f.questions,
            f.owner_id, f.follow_up, f.thank_you, f.active, to_char(f.closes_on,'YYYY-MM-DD') closes_on, b.name branch, b.timezone, b.phone, b.country_code
       from lead_forms f join branches b on b.id=f.branch_id where f.slug=$1`, [slug]);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const f = await load((await params).slug);
  return { title: { absolute: f ? `${f.title} · Eplanet International` : "Eplanet International" }, robots: { index: false, follow: false } };
}

const PHONE_HINT: Record<string, string> = { BD: "e.g. 01712 345678", NP: "e.g. 98XXXXXXXX", AU: "e.g. 0412 345 678", IN: "e.g. 98765 43210" };

function Row({ k, label, required, error, children, hint }: { k: string; label: string; required?: boolean; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div data-field={k} className="grid gap-1.5">
      <span className="text-sm font-semibold" id={`${k}-label`}>{label}{required ? <span className="text-red"> *</span> : <span className="font-normal text-slate"> (optional)</span>}</span>
      {children}
      {hint && <span className="text-xs text-slate">{hint}</span>}
      <span className="field-error hidden text-sm text-red-dark">{error ?? "Please answer this."}</span>
    </div>
  );
}

export default async function PublicForm({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const preview = (await searchParams).preview === "1";
  const f = await load(slug);
  const today = f ? new Intl.DateTimeFormat("en-CA", { timeZone: f.timezone }).format(new Date()) : "";
  const modes = f ? fieldModes(f.fields) : null;
  const label = (k: string) => STANDARD_FIELDS.find((x) => x.key === k)!.label;
  const req = (k: keyof NonNullable<typeof modes>) => modes?.[k] === "required";
  const on = (k: keyof NonNullable<typeof modes>) => modes?.[k] !== "off";

  return (
    <main className="min-h-dvh bg-mist px-4 py-6 sm:py-10">
      <div className="mx-auto grid max-w-lg gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/eplanet-logo.png" alt="Eplanet International" className="mx-auto h-11 w-auto" />
        {!f ? (
          <section className="card p-6 text-center"><p className="font-display text-xl font-bold text-navy">Form not found</p><p className="mt-1 text-slate">Please check the link or ask the Eplanet team for the right QR code.</p></section>
        ) : (
          <>
            <header className="text-center">
              <h1 className="font-display text-2xl font-bold leading-tight text-navy text-balance sm:text-3xl">{f.title}</h1>
              {(f.event_date || f.event_time || f.venue) && <p className="mt-2 font-semibold">{[f.event_date ? date(f.event_date) : null, f.event_time, f.venue].filter(Boolean).join(" · ")}</p>}
              {f.intro && <p className="mt-2 text-slate">{f.intro}</p>}
            </header>
            {preview && <p className="rounded-xl bg-sky px-4 py-3 text-sm text-navy">Preview: this is what students see. Submitting here won&apos;t save anything.</p>}
            <section className="card p-5 sm:p-6">
              {!isOpen(f, today) ? (
                <div className="py-6 text-center"><p className="font-display text-xl font-bold text-navy">Registration has closed</p>
                  <p className="mt-1 text-slate">Please speak to the Eplanet team{f.phone ? ` or call ${f.phone}` : ""}.</p></div>
              ) : (
                <RegisterForm name={`Eplanet International — ${f.branch}`}>
                  <input type="hidden" name="slug" value={f.slug} />
                  {preview && <input type="hidden" name="preview" value="1" />}
                  <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                    <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
                  </div>
                  <Row k="full_name" label="Full name" required error="Please enter your full name.">
                    <input className="input h-11" name="full_name" autoComplete="name" maxLength={150} aria-labelledby="full_name-label" required />
                  </Row>
                  <Row k="phone" label="Mobile number (WhatsApp if you have it)" required error={`Please enter a mobile number we can call${PHONE_HINT[f.country_code] ? `, ${PHONE_HINT[f.country_code]}` : ""}.`}>
                    <input className="input h-11" type="tel" inputMode="tel" name="phone" autoComplete="tel" maxLength={30} placeholder={PHONE_HINT[f.country_code]} aria-labelledby="phone-label" required />
                  </Row>
                  {on("email") && <Row k="email" label={label("email")} required={req("email")} error="Please check your email address.">
                    <input className="input h-11" type="email" inputMode="email" name="email" autoComplete="email" maxLength={150} aria-labelledby="email-label" />
                  </Row>}
                  {on("destination") && <Row k="destination" label={label("destination")} required={req("destination")}>
                    <div className="flex flex-wrap gap-2" role="group" aria-labelledby="destination-label">{DESTINATIONS.map(([k, l]) => (
                      <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm has-[:checked]:border-navy has-[:checked]:bg-sky">
                        <input type="checkbox" name="destination" value={k} /> {l}</label>))}
                    </div>
                  </Row>}
                  {on("level") && <Row k="level" label={label("level")} required={req("level")}>
                    <select className="select h-11" name="level" defaultValue="" aria-labelledby="level-label"><option value="">Choose…</option>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </Row>}
                  {on("intake") && <Row k="intake" label={label("intake")} required={req("intake")}>
                    <select className="select h-11" name="intake" defaultValue="" aria-labelledby="intake-label"><option value="">Choose…</option>{INTAKE_CHOICES.map((c) => <option key={c}>{c}</option>)}</select>
                  </Row>}
                  {on("education") && <Row k="education" label={label("education")} required={req("education")}>
                    <select className="select h-11" name="education" defaultValue="" aria-labelledby="education-label"><option value="">Choose…</option>{EDU_LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </Row>}
                  {on("english") && <Row k="english" label={label("english")} required={req("english")}>
                    <input className="input h-11" name="english" maxLength={100} placeholder="e.g. IELTS 6.5, or not taken yet" aria-labelledby="english-label" />
                  </Row>}
                  {on("city") && <Row k="city" label={label("city")} required={req("city")}>
                    <input className="input h-11" name="city" autoComplete="address-level2" maxLength={100} aria-labelledby="city-label" />
                  </Row>}
                  {f.questions.map((qq, i) => (
                    <Row key={i} k={`q${i}`} label={qq.label} required={qq.required}>
                      {qq.type === "choice"
                        ? <select className="select h-11" name={`q${i}`} defaultValue="" aria-labelledby={`q${i}-label`}><option value="">Choose…</option>{qq.options.map((o) => <option key={o}>{o}</option>)}</select>
                        : <input className="input h-11" name={`q${i}`} maxLength={500} aria-labelledby={`q${i}-label`} />}
                    </Row>))}
                  {on("message") && <Row k="message" label={label("message")} required={req("message")}>
                    <textarea className="input min-h-24" name="message" maxLength={1000} aria-labelledby="message-label" />
                  </Row>}
                  <div data-field="consent" className="grid gap-1.5">
                    <label className="flex items-start gap-3 rounded-xl bg-mist p-3 text-sm">
                      <input type="checkbox" name="consent" className="mt-0.5 size-5 shrink-0" required />
                      <span>{consentText(f.branch)}</span>
                    </label>
                    <span className="field-error hidden text-sm text-red-dark">Please tick this box so we can contact you.</span>
                  </div>
                </RegisterForm>
              )}
            </section>
            <p className="text-center text-xs text-slate">Eplanet International — {f.branch}{f.phone ? ` · ${f.phone}` : ""}</p>
          </>
        )}
      </div>
    </main>
  );
}
