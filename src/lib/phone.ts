const DIAL: Record<string, string> = { BD: "880", NP: "977", AU: "61", IN: "91", PH: "63", LK: "94", GB: "44", CA: "1", US: "1", NZ: "64" };

/** Converts a local or international phone number to +<country><number>, using the branch's country for local numbers. */
export function normalisePhone(raw: string | null | undefined, countryCode: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s;
  const dial = DIAL[countryCode];
  if (!dial) return s;
  if (s.startsWith(dial) && s.length > dial.length + 7) return "+" + s;
  return "+" + dial + s.replace(/^0+/, "");
}

export function waLink(phone: string | null | undefined) {
  if (!phone) return null;
  return "https://wa.me/" + phone.replace(/[^\d]/g, "");
}
