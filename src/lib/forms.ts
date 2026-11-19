import { randomBytes } from "node:crypto";
import { DESTINATIONS, EDU_LEVELS, LEVELS } from "./lookups";

/** The standard questions a registration form can ask, beyond name and mobile (always asked). */
export const STANDARD_FIELDS = [
  { key: "email", label: "Email", kind: "email" },
  { key: "destination", label: "Which countries are you interested in?", kind: "countries" },
  { key: "level", label: "What do you want to study?", kind: "level" },
  { key: "intake", label: "When do you want to start?", kind: "intake" },
  { key: "education", label: "Your last completed education", kind: "education" },
  { key: "english", label: "English test and score, if you have one", kind: "text", placeholder: "e.g. IELTS 6.5, or not taken yet" },
  { key: "city", label: "City or district", kind: "text" },
  { key: "message", label: "Anything you'd like to ask us?", kind: "textarea" },
] as const;
export type StandardKey = (typeof STANDARD_FIELDS)[number]["key"];
export type FieldMode = "off" | "optional" | "required";
export const DEFAULT_FIELDS: Record<StandardKey, FieldMode> = { email: "optional", destination: "optional", level: "optional", intake: "optional", education: "off", english: "off", city: "off", message: "off" };

export const INTAKE_CHOICES = ["Within 6 months", "In 6 to 12 months", "Next year or later", "Not sure yet"];
export { DESTINATIONS, EDU_LEVELS, LEVELS };

export type Question = { label: string; type: "text" | "choice"; options: string[]; required: boolean };
export type FormRow = {
  id: number; branch_id: number; slug: string; title: string; intro: string | null; event_date: string | null; event_time: string | null; venue: string | null;
  fields: Partial<Record<StandardKey, FieldMode>>; questions: Question[]; owner_id: string | null; follow_up: boolean; thank_you: string | null;
  active: boolean; closes_on: string | null;
};

export const fieldModes = (f: FormRow["fields"]) => ({ ...DEFAULT_FIELDS, ...f });

/** A short public code for the form's address. Letters that are easy to misread are left out. */
export function newSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = randomBytes(8);
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
}

/** True while the form is taking registrations. */
export function isOpen(f: Pick<FormRow, "active" | "closes_on">, today: string) {
  return f.active && (!f.closes_on || f.closes_on >= today);
}

export const consentText = (branch: string) =>
  `I agree that Eplanet International (${branch}) may keep my details and contact me by phone, WhatsApp or email about studying abroad.`;

export type RegisterResult = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | null;
