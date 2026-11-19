/** CRM fields a CSV column can be mapped to, with header patterns used to guess the mapping. */
export const IMPORT_FIELDS: { key: string; label: string; guess: RegExp; required?: boolean }[] = [
  { key: "full_name", label: "Full name (split into first and last)", guess: /^(full ?name|name|client ?name|contact ?name|student ?name)$/i },
  { key: "first_name", label: "First name", guess: /^(first|given)[ _]?name$/i },
  { key: "last_name", label: "Last name", guess: /^(last|family|sur)[ _]?name$|^surname$/i },
  { key: "email", label: "Email", guess: /e-?mail/i },
  { key: "phone", label: "Mobile / phone", guess: /^(phone|mobile|contact ?(no|number)|phone ?number|mobile ?number|cell)/i },
  { key: "whatsapp", label: "WhatsApp", guess: /whats ?app/i },
  { key: "dob", label: "Date of birth", guess: /(birth|dob)/i },
  { key: "gender", label: "Gender", guess: /gender|sex/i },
  { key: "city", label: "City", guess: /^(city|town|district)$/i },
  { key: "address", label: "Address", guess: /address|street/i },
  { key: "stage", label: "Status (lead / prospect / client)", guess: /^(stage|status|type|contact ?type)$/i },
  { key: "source", label: "Source", guess: /source|referr|channel/i },
  { key: "destination", label: "Interested country", guess: /(interested|preferred)? ?(country|destination)/i },
  { key: "level", label: "Study level", guess: /level|degree/i },
  { key: "field", label: "Subject / course of interest", guess: /(course|subject|field|program)/i },
  { key: "intake", label: "Intake", guess: /intake/i },
  { key: "owner", label: "Counsellor (name or email)", guess: /(assign|counsel|owner|consultant|agent)/i },
  { key: "tags", label: "Tags (comma separated)", guess: /tag/i },
  { key: "notes", label: "Notes (added to the timeline)", guess: /note|comment|remark/i },
  { key: "external_id", label: "Agentcis ID / reference", guess: /^(id|client ?id|contact ?id|ref(erence)?|internal ?id)$/i },
];

export function guessMapping(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const i = headers.findIndex((h, j) => !used.has(j) && f.guess.test(h.trim()));
    if (i >= 0) { m[f.key] = i; used.add(i); }
  }
  if (m.first_name !== undefined && m.full_name !== undefined) delete m.full_name;
  return m;
}

const DEST: [RegExp, string][] = [[/austral/i, "AU"], [/(united kingdom|\buk\b|england|britain|scotland)/i, "UK"], [/canad/i, "CA"], [/(\busa?\b|united states|america)/i, "US"], [/new zealand|\bnz\b/i, "NZ"], [/(europe|german|france|ireland|netherland|sweden|finland|italy|spain|malta|cyprus|hungary|poland|lithuania|latvia|denmark)/i, "EU"]];
export const toDestinations = (v: string) => [...new Set(v.split(/[,;/|]/).flatMap((x) => DEST.filter(([r]) => r.test(x)).map(([, c]) => c)))];
export const toStage = (v: string) => (/(client|enrol|visa|applied|application)/i.test(v) ? "client" : /prospect|qualified|interested/i.test(v) ? "prospect" : /(lost|archiv|closed|dead|inactive|not interested)/i.test(v) ? "archived" : "lead");
export const toLevel = (v: string) => (/foundation/i.test(v) ? "FOUNDATION" : /diploma|certificate/i.test(v) ? "DIPLOMA" : /(bachelor|undergrad|bsc|bba|\bba\b)/i.test(v) ? "BACHELOR" : /(master|postgrad|msc|mba|\bma\b)/i.test(v) ? "MASTER" : /(phd|doctor)/i.test(v) ? "DOCTORATE" : /english|elicos/i.test(v) ? "ENGLISH" : null);
export function toDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day first, as used in Bangladesh, Nepal and Australia
  if (m && Number(m[2]) <= 12 && Number(m[1]) <= 31) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
