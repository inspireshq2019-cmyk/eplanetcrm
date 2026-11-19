import "server-only";
import { can, scopeWhere, type CurrentUser } from "./auth";
import { q } from "./db";
import { DEST_LABEL, METHOD_LABEL, SOURCE_LABEL } from "./format";

export type Report = { key: string; title: string; note?: string; columns: { key: string; label: string; num?: boolean }[]; rows: Record<string, string | number | null>[] };
export type Range = { from: string; to: string; branch: number | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function parseRange(sp: { from?: string; to?: string; branch?: string }, tz = "Asia/Dhaka"): Range {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const from = sp.from && ISO.test(sp.from) ? sp.from : today.slice(0, 8) + "01";
  const to = sp.to && ISO.test(sp.to) && sp.to >= from ? sp.to : today;
  return { from, to, branch: sp.branch ? Number(sp.branch) || null : null };
}

/** Builds the WHERE for one table alias: user scope + optional branch + date column within range. Returns [sql, params]. */
function scope(u: CurrentUser, alias: string, r: Range, dateCol: string | null, owner = false): [string, unknown[]] {
  const p: unknown[] = [];
  const w = [scopeWhere(u, alias, p, owner ? { ownerColumn: "owner_id" } : {})];
  if (r.branch) { p.push(r.branch); w.push(`${alias}.branch_id=$${p.length}`); }
  if (dateCol) { p.push(r.from, r.to); w.push(`${dateCol} >= $${p.length - 1}::date and ${dateCol} < $${p.length}::date + 1`); }
  return [w.join(" and "), p];
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

export const REPORT_KEYS = ["leads", "counsellors", "applications", "visas", "branches", "payments", "commission", "oshc_classes"] as const;

export async function buildReport(u: CurrentUser, key: string, r: Range): Promise<Report | null> {
  switch (key) {
    case "leads": {
      const [w, p] = scope(u, "c", r, "c.created_at", true);
      const rows = await q<{ source: string | null; n: number; clients: number; apps: number }>(
        `select c.source, count(*) n, count(*) filter (where c.stage='client') clients,
                count(*) filter (where exists (select 1 from applications a where a.contact_id=c.id)) apps
           from contacts c where ${w} group by 1 order by n desc`, p);
      return { key, title: "New leads by source", note: "Leads added in the period, and how many of them have since become clients.",
        columns: [{ key: "source", label: "Source" }, { key: "n", label: "New leads", num: true }, { key: "apps", label: "With an application", num: true }, { key: "clients", label: "Became clients", num: true }, { key: "conv", label: "Conversion", num: true }],
        rows: rows.map((x) => ({ source: SOURCE_LABEL[x.source ?? ""] ?? x.source ?? "Not recorded", n: x.n, apps: x.apps, clients: x.clients, conv: pct(x.clients, x.n) })) };
    }
    case "counsellors": {
      const [wc, pc] = scope(u, "c", r, "c.created_at", true);
      const [wa, pa] = scope(u, "a", r, "a.created_at", true);
      const [ww, pw] = scope(u, "a", r, null, true);
      const off = (s: string, n: number) => s.replace(/\$(\d+)/g, (_, d) => `$${Number(d) + n}`);
      const pAll = [...pc, ...pa, ...pw, r.from, r.to];
      const rows = await q<{ name: string; leads: number; apps: number; won: number; visas: number }>(
        `select coalesce(u.name,'Unassigned') name,
                (select count(*) from contacts c where c.owner_id is not distinct from u.id and ${wc}) leads,
                (select count(*) from applications a where a.owner_id is not distinct from u.id and ${off(wa, pc.length)}) apps,
                (select count(*) from applications a join stage_history h on h.application_id=a.id join workflow_stages s on s.id=h.to_stage_id and s.outcome='won'
                  where a.owner_id is not distinct from u.id and ${off(ww, pc.length + pa.length)} and h.changed_at >= $${pAll.length - 1}::date and h.changed_at < $${pAll.length}::date + 1) won,
                0 visas
           from (select id, name from users where active union all select null, null) u order by leads desc, apps desc`, pAll);
      return { key, title: "Counsellor performance", note: "Leads and applications added in the period by owner, and applications that reached a won step in the period.",
        columns: [{ key: "name", label: "Counsellor" }, { key: "leads", label: "New leads", num: true }, { key: "apps", label: "New applications", num: true }, { key: "won", label: "Won", num: true }],
        rows: rows.filter((x) => x.leads || x.apps || x.won) };
    }
    case "applications": {
      const [w, p] = scope(u, "a", r, "a.created_at", true);
      const rows = await q<{ destination: string | null; n: number; open: number; won: number; lost: number; onshore: number }>(
        `select a.destination, count(*) n, count(*) filter (where status='open') open, count(*) filter (where status='won') won, count(*) filter (where status='lost') lost,
                count(*) filter (where onshore_transfer) onshore
           from applications a where ${w} group by 1 order by n desc`, p);
      return { key, title: "Applications by destination", note: "Applications created in the period and where they stand today.",
        columns: [{ key: "destination", label: "Destination" }, { key: "n", label: "Created", num: true }, { key: "open", label: "In progress", num: true }, { key: "won", label: "Won", num: true }, { key: "lost", label: "Lost", num: true }, { key: "onshore", label: "AU onshore transfers", num: true }],
        rows: rows.map((x) => ({ ...x, destination: DEST_LABEL[x.destination ?? ""] ?? x.destination ?? "—" })) };
    }
    case "visas": {
      if (!can(u, "visa.view")) return null;
      const [w, p] = scope(u, "v", r, null);
      p.push(r.from, r.to);
      const a = p.length - 1, b = p.length;
      const rows = await q<{ destination: string; lodged: number; granted: number; refused: number; withdrawn: number }>(
        `select v.destination,
                count(*) filter (where v.lodged_on between $${a} and $${b}) lodged,
                count(*) filter (where v.status='granted' and v.decision_on between $${a} and $${b}) granted,
                count(*) filter (where v.status='refused' and v.decision_on between $${a} and $${b}) refused,
                count(*) filter (where v.status='withdrawn' and v.updated_at::date between $${a} and $${b}) withdrawn
           from visa_cases v where ${w} group by 1 order by lodged desc`, p);
      return { key, title: "Visa outcomes", note: "Visas lodged in the period, and decisions received in the period. The grant rate counts only decided cases.",
        columns: [{ key: "destination", label: "Destination" }, { key: "lodged", label: "Lodged", num: true }, { key: "granted", label: "Granted", num: true }, { key: "refused", label: "Refused", num: true }, { key: "withdrawn", label: "Withdrawn", num: true }, { key: "rate", label: "Grant rate", num: true }],
        rows: rows.filter((x) => x.lodged || x.granted || x.refused || x.withdrawn).map((x) => ({ ...x, destination: DEST_LABEL[x.destination] ?? x.destination, rate: pct(x.granted, x.granted + x.refused) })) };
    }
    case "branches": {
      if (u.scope === "branch" || u.scope === "own") return null;
      const p: unknown[] = [];
      const w = scopeWhere(u, "b", p).replace("b.branch_id", "b.id");
      p.push(r.from, r.to);
      const a = p.length - 1, bb = p.length;
      const rows = await q<{ name: string; leads: number; checkins: number; apps: number; won: number; visas: number }>(
        `select b.name,
                (select count(*) from contacts c where c.branch_id=b.id and c.created_at >= $${a}::date and c.created_at < $${bb}::date + 1) leads,
                (select count(*) from checkins k where k.branch_id=b.id and k.arrived_at >= $${a}::date and k.arrived_at < $${bb}::date + 1) checkins,
                (select count(*) from applications x where x.branch_id=b.id and x.created_at >= $${a}::date and x.created_at < $${bb}::date + 1) apps,
                (select count(*) from applications x where x.branch_id=b.id and x.status='won' and x.updated_at >= $${a}::date and x.updated_at < $${bb}::date + 1) won,
                (select count(*) from visa_cases v where v.branch_id=b.id and v.status='granted' and v.decision_on between $${a} and $${bb}) visas
           from branches b where b.active and ${w} order by leads desc, b.name`, p);
      return { key, title: "Branches compared", columns: [{ key: "name", label: "Branch" }, { key: "leads", label: "New leads", num: true }, { key: "checkins", label: "Office visits", num: true }, { key: "apps", label: "Applications", num: true }, { key: "won", label: "Won", num: true }, { key: "visas", label: "Visas granted", num: true }], rows: rows.filter((x) => x.leads || x.checkins || x.apps || x.won || x.visas) };
    }
    case "payments": {
      if (!can(u, "finance.view")) return null;
      const [w, p] = scope(u, "p", r, "p.received_on");
      const rows = await q<{ method: string; currency: string; n: number; total: number }>(
        `select p.method, p.currency, count(*) n, sum(p.amount) total from payments p where ${w} group by 1,2 order by 2, total desc`, p);
      return { key, title: "Money received by method", note: "Every payment is non-cash and carries a transaction reference.",
        columns: [{ key: "method", label: "Method" }, { key: "currency", label: "Currency" }, { key: "n", label: "Payments", num: true }, { key: "total", label: "Total", num: true }],
        rows: rows.map((x) => ({ ...x, method: METHOD_LABEL[x.method] ?? x.method, total: Number(x.total).toFixed(2) })) };
    }
    case "commission": {
      if (!can(u, "finance.view")) return null;
      const [w, p] = scope(u, "i", r, "i.issue_date");
      const rows = await q<{ partner: string; currency: string; n: number; invoiced: number; collected: number; outstanding: number; shared: number }>(
        `select coalesce(pa.name,'—') partner, i.currency, count(*) n, sum(i.total) invoiced, sum(i.paid) collected, sum(i.total - i.paid) outstanding,
                coalesce(sum((select sum(s.amount) from income_shares s where s.invoice_id=i.id)),0) shared
           from invoices i left join partners pa on pa.id=i.partner_id where i.kind like 'commission%' and i.status <> 'void' and ${w} group by 1,2 order by invoiced desc`, p);
      return { key, title: "Commission by institution", note: "Commission invoices issued in the period. Shared = owed to sub-agents or other branches.",
        columns: [{ key: "partner", label: "Institution" }, { key: "currency", label: "Currency" }, { key: "n", label: "Invoices", num: true }, { key: "invoiced", label: "Invoiced", num: true }, { key: "collected", label: "Collected", num: true }, { key: "outstanding", label: "Outstanding", num: true }, { key: "shared", label: "Shared", num: true }],
        rows: rows.map((x) => ({ ...x, invoiced: Number(x.invoiced).toFixed(2), collected: Number(x.collected).toFixed(2), outstanding: Number(x.outstanding).toFixed(2), shared: Number(x.shared).toFixed(2) })) };
    }
    case "oshc_classes": {
      const out: Report["rows"] = [];
      if (can(u, "oshc.manage")) {
        const [w, p] = scope(u, "o", r, "o.created_at");
        const rows = await q<{ insurer: string | null; n: number; premium: number; commission: number }>(
          `select pa.name insurer, count(*) n, coalesce(sum(o.premium),0) premium, coalesce(sum(o.commission),0) commission from oshc_policies o left join partners pa on pa.id=o.insurer_id
            where o.status in ('purchased','active') and ${w} group by 1 order by n desc`, p);
        rows.forEach((x) => out.push({ item: `OSHC — ${x.insurer ?? "insurer not set"}`, n: x.n, value: `AUD ${Number(x.premium).toFixed(2)} premium · AUD ${Number(x.commission).toFixed(2)} commission` }));
      }
      if (can(u, "classes.manage")) {
        const [w, p] = scope(u, "k", r, "e.enrolled_at");
        const rows = await q<{ test: string; n: number }>(`select k.test, count(*) n from class_enrolments e join classes k on k.id=e.class_id where ${w} group by 1 order by n desc`, p).catch(() => []);
        rows.forEach((x) => out.push({ item: `${x.test} class enrolments`, n: x.n, value: "" }));
      }
      if (!can(u, "oshc.manage") && !can(u, "classes.manage")) return null;
      return { key, title: "OSHC and classes", columns: [{ key: "item", label: "Item" }, { key: "n", label: "Count", num: true }, { key: "value", label: "Value" }], rows: out };
    }
  }
  return null;
}
