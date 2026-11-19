import "server-only";
import { q } from "./db";
import type { CurrentUser } from "./auth";

export type BranchOpt = { id: number; name: string; country_code: string; currency: string; timezone: string; code: string };
export type UserOpt = { id: string; name: string; role_key: string; primary_branch_id: number; marn: string | null };

/** Branches the user may see (all of them for owners). */
export async function visibleBranches(u: CurrentUser): Promise<BranchOpt[]> {
  if (u.scope === "all") return q<BranchOpt>("select id,name,country_code,currency,timezone,code from branches where active order by country_code<>'BD', country_code, name");
  return q<BranchOpt>("select id,name,country_code,currency,timezone,code from branches where active and id = any($1::int[]) order by name", [u.branchIds]);
}

/** Active staff working in the branches the user may see. */
export async function visibleStaff(u: CurrentUser): Promise<UserOpt[]> {
  if (u.scope === "all") return q<UserOpt>("select id,name,role_key,primary_branch_id,marn from users where active order by name");
  return q<UserOpt>(
    `select distinct u.id,u.name,u.role_key,u.primary_branch_id,u.marn from users u left join user_branches ub on ub.user_id=u.id
      where u.active and (u.primary_branch_id = any($1::int[]) or ub.branch_id = any($1::int[])) order by u.name`, [u.branchIds]);
}

export async function branchById(id: number) {
  return (await q<BranchOpt>("select id,name,country_code,currency,timezone,code from branches where id=$1", [id]))[0] ?? null;
}

export const DESTINATIONS = [["AU", "Australia"], ["UK", "United Kingdom"], ["CA", "Canada"], ["US", "USA"], ["NZ", "New Zealand"], ["EU", "Europe"]] as const;
export const LEVELS = [["FOUNDATION", "Foundation"], ["DIPLOMA", "Diploma"], ["BACHELOR", "Bachelor's"], ["MASTER", "Master's"], ["DOCTORATE", "PhD"], ["ENGLISH", "English course"]] as const;
export const FIELDS = [
  ["business_management", "Business & management"], ["accounting_finance", "Accounting & finance"], ["it_computing", "IT & computing"],
  ["data_science", "Data science & analytics"], ["engineering", "Engineering"], ["health_nursing", "Nursing & health"],
  ["public_health", "Public health"], ["hospitality_tourism", "Hospitality & tourism"], ["other", "Other"],
] as const;
export const SOURCES = [["walk_in", "Walk-in"], ["website", "Website form"], ["facebook", "Facebook / Instagram"], ["google_ads", "Google Ads"], ["whatsapp", "WhatsApp"], ["phone", "Phone call"], ["event", "Education fair / event"], ["referral", "Referral"], ["sub_agent", "Sub-agent"], ["other", "Other"]] as const;
export const TESTS = [["IELTS_ACADEMIC", "IELTS Academic"], ["IELTS_UKVI", "IELTS for UKVI"], ["IELTS_GENERAL", "IELTS General"], ["PTE", "PTE Academic"], ["TOEFL_IBT", "TOEFL iBT"], ["DUOLINGO", "Duolingo"]] as const;
export const EDU_LEVELS = [["SSC", "SSC / O-levels"], ["HSC", "HSC / A-levels"], ["DIPLOMA", "Diploma"], ["BACHELOR", "Bachelor's"], ["MASTER", "Master's"], ["OTHER", "Other"]] as const;
export const PARTNER_KINDS: [string, string][] = [["university", "University"], ["college", "College / TAFE"], ["school", "School"], ["english", "English school"], ["insurer", "Health insurer"], ["aggregator", "Aggregator"], ["other", "Other"]];
