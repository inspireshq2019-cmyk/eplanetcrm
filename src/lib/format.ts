export function money(amount: number | null | undefined, currency?: string | null) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  return currency ? `${currency} ${n}` : n;
}

export function date(d: string | Date | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(x);
}

export function dateTime(d: string | Date | null | undefined, tz?: string) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(d));
}

export function time(d: string | Date | null | undefined, tz?: string) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(d));
}

export function ago(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(d);
}

export function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  return Math.round((new Date(d + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
}

export const STAGE_LABEL: Record<string, string> = { lead: "Lead", prospect: "Prospect", client: "Client", archived: "Archived" };
export const DEST_LABEL: Record<string, string> = { AU: "Australia", UK: "United Kingdom", CA: "Canada", US: "USA", NZ: "New Zealand", EU: "Europe" };
export const LEVEL_LABEL: Record<string, string> = { FOUNDATION: "Foundation", DIPLOMA: "Diploma", BACHELOR: "Bachelor's", MASTER: "Master's", DOCTORATE: "PhD", ENGLISH: "English course", OTHER: "Other" };
export const SOURCE_LABEL: Record<string, string> = {
  walk_in: "Walk-in", website: "Website form", facebook: "Facebook / Instagram", whatsapp: "WhatsApp", phone: "Phone call",
  event: "Education fair / event", referral: "Referral", sub_agent: "Sub-agent", agentcis: "Imported from Agentcis", google_ads: "Google Ads", other: "Other",
};
export const CHANNEL_LABEL: Record<string, string> = { direct: "Direct", applyboard: "ApplyBoard", crizac: "Crizac", infinite: "Infinite Group", studylink: "StudyLink", other: "Other" };
export const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer", card: "Card", bkash: "bKash", nagad: "Nagad", rocket: "Rocket", esewa: "eSewa", khalti: "Khalti",
  fonepay: "Fonepay", upi: "UPI", gcash: "GCash", stripe: "Online (Stripe)", cheque: "Cheque", online_other: "Other online",
};
export const VISA_STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing", lodged: "Lodged", further_info: "Further info requested", granted: "Granted", refused: "Refused", withdrawn: "Withdrawn",
};
export const TEST_LABEL: Record<string, string> = { IELTS_ACADEMIC: "IELTS Academic", IELTS_UKVI: "IELTS for UKVI", IELTS_GENERAL: "IELTS General", PTE: "PTE Academic", TOEFL_IBT: "TOEFL iBT", DUOLINGO: "Duolingo" };

export function initials(name: string) {
  return name.replace(/^md\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export const INVOICE_KIND_LABEL: Record<string, string> = { client: "Student invoice", commission_gross: "Commission claim (gross)", commission_net: "Commission claim (net)", general: "Other invoice" };
export const INVOICE_STATUS_BADGE: Record<string, string> = { draft: "badge-grey", sent: "", part_paid: "badge-warn", paid: "badge-ok", void: "badge-grey" };
export const INVOICE_STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Unpaid", part_paid: "Part paid", paid: "Paid", void: "Void" };

/** Money with two decimals always, for invoices and receipts. */
export function money2(amount: number | null | undefined, currency?: string | null) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(amount);
  return currency ? `${currency} ${n}` : n;
}
