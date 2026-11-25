import "server-only";
import type { PoolClient } from "pg";

/** Where an application is with the central admission team. */
export const ADM_STATUS = {
  submitted: { label: "Waiting for admissions", short: "Waiting", badge: "badge-warn" },
  in_review: { label: "Being checked by admissions", short: "Checking", badge: "" },
  needs_info: { label: "Action needed: admissions asked for something", short: "Action needed", badge: "badge-red" },
  lodged: { label: "Submitted to the institution", short: "Submitted", badge: "badge-navy" },
  offer: { label: "Offer received", short: "Offer", badge: "badge-ok" },
  refused: { label: "Refused by the institution", short: "Refused", badge: "badge-grey" },
  withdrawn: { label: "Withdrawn", short: "Withdrawn", badge: "badge-grey" },
} as const;
export type AdmStatus = keyof typeof ADM_STATUS;
export const admLabel = (s: string | null) => (s && s in ADM_STATUS ? ADM_STATUS[s as AdmStatus] : null);

export const ROUTE_LABEL: Record<string, string> = { direct: "Direct to the institution", master_agent: "Through a master agent", portal: "Through an admission portal" };
export const METHOD_LABEL: Record<string, string> = { portal: "On their online portal", email: "By email" };
export const OUTCOME_LABEL: Record<string, string> = { pending: "Waiting for a decision", conditional: "Conditional offer", unconditional: "Unconditional offer", refused: "Refused", withdrawn: "Withdrawn" };

/** Which statuses the admission team can move an application to from each status. */
export const NEXT_STATUS: Record<AdmStatus, AdmStatus[]> = {
  submitted: ["in_review", "needs_info", "withdrawn"],
  in_review: ["needs_info", "withdrawn"],
  needs_info: ["in_review", "withdrawn"],
  lodged: ["needs_info", "offer", "refused", "withdrawn"],
  offer: ["needs_info", "withdrawn"],
  refused: ["in_review"],
  withdrawn: ["in_review"],
};

/** Adds a status line to the application's conversation (seen by the branch and sub-agent unless internal). */
export async function statusNote(db: PoolClient, applicationId: string, userId: string | null, body: string, internal = false) {
  await db.query("insert into application_messages(application_id,author_id,body,internal,kind) values($1,$2,$3,$4,'status')", [applicationId, userId, body.slice(0, 2000), internal]);
}

/**
 * Keeps the application's workflow step in step with admissions, moving it forward only:
 * submitted to the institution → "Applied"; offer → the offer step; refused → the refused step.
 */
export async function syncStage(db: PoolClient, applicationId: string, userId: string | null, to: "applied" | "offer" | "refused") {
  const a = (await db.query<{ workflow_id: number; position: number; outcome: string | null; stage_id: number }>(
    `select a.workflow_id, a.stage_id, s.position, s.outcome from applications a join workflow_stages s on s.id=a.stage_id where a.id=$1`, [applicationId])).rows[0];
  if (!a || a.outcome) return;
  const target = (await db.query<{ id: number; position: number }>(
    to === "refused"
      ? "select id, position from workflow_stages where workflow_id=$1 and outcome='lost' and name ilike 'Refused%' order by position limit 1"
      : "select id, position from workflow_stages where workflow_id=$1 and outcome is null and position=$2",
    to === "refused" ? [a.workflow_id] : [a.workflow_id, to === "applied" ? 3 : 4])).rows[0];
  if (!target || (to !== "refused" && target.position <= a.position)) return;
  await db.query("update applications set stage_id=$2, updated_at=now()" + (to === "refused" ? ", status='lost', lost_reason=coalesce(lost_reason,'Refused by the institution')" : "") + " where id=$1", [applicationId, target.id]);
  await db.query("insert into stage_history(application_id,from_stage_id,to_stage_id,changed_by,note) values($1,$2,$3,$4,'Updated by admissions')", [applicationId, a.stage_id, target.id, userId]);
}
