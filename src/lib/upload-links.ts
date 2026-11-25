import "server-only";
import { q1 } from "./db";
import { newSecret, open, seal, sha256 } from "./secret-box";

// Private upload links: a student opens /u/<token> on their phone and uploads documents to their own profile.
// Only a hash of the token is used to find the link; the token itself is kept encrypted so staff can copy the link again.

/** What a student can be asked for. Offer letters, CoEs, CAS, I-20s and visa grants come from the institution, not the student. */
export const STUDENT_DOC_TYPES: [string, string][] = [
  ["passport", "Passport"],
  ["transcript", "Academic transcripts and certificates"],
  ["ielts", "English test result (IELTS, PTE…)"],
  ["sop", "Statement of purpose"],
  ["cv", "CV"],
  ["financials", "Bank statement / financial documents"],
  ["reference", "Reference letters"],
  ["medical", "Medical / TB test certificate"],
  ["other", "Other document"],
];
export const STUDENT_DOC_LABEL: Record<string, string> = Object.fromEntries(STUDENT_DOC_TYPES);
const NOT_FROM_STUDENT = new Set(["offer", "coe", "cas", "i20", "visa_grant", "pal"]);
export const studentMayUpload = (docType: string | null | undefined) => !!docType && !NOT_FROM_STUDENT.has(docType);

export const LINK_DAYS = [3, 7, 14, 30];
export const MAX_UPLOADS_PER_LINK = 40;

export function newToken() {
  const token = newSecret(24); // 32 characters, 192 bits
  return { token, hash: sha256(token), enc: seal(token) };
}
export const tokenOf = (enc: string) => open(enc);

export type OpenLink = {
  id: number; contact_id: string; application_id: string | null; doc_types: string[]; note: string | null; expires_at: string; uploads: number;
  first_name: string; branch_id: number; branch: string; branch_phone: string | null; branch_email: string | null; timezone: string;
  owner_id: string | null; created_by: string | null;
};

/** The link for this token, if it exists, hasn't been cancelled and hasn't expired. */
export async function findOpenLink(token: string): Promise<OpenLink | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  return q1<OpenLink>(
    `select l.id, l.contact_id, l.application_id, l.doc_types, l.note, l.expires_at, l.uploads, c.first_name, c.branch_id, b.name branch,
            b.phone branch_phone, b.email branch_email, b.timezone, c.owner_id, l.created_by
       from upload_links l join contacts c on c.id=l.contact_id join branches b on b.id=c.branch_id
      where l.token_hash=$1 and l.revoked_at is null and l.expires_at > now()`, [sha256(token)]);
}
