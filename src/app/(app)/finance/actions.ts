"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, can, canSeeBranch, requireUser } from "@/lib/auth";
import { loadApplicationForUser, loadContactForUser } from "@/lib/access";
import { q, q1, tx } from "@/lib/db";
import { METHOD_LABEL, money2 } from "@/lib/format";
import type { ActionResult } from "@/components/action-form";

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const num = (f: FormData, k: string) => (str(f, k) === null ? null : Number(str(f, k)));
const round2 = (n: number) => Math.round(n * 100) / 100;

// Payment methods allowed everywhere. Cash is deliberately absent: Eplanet has a no-cash policy in every branch.
const METHODS = ["bank_transfer", "card", "bkash", "nagad", "rocket", "esewa", "khalti", "fonepay", "upi", "gcash", "stripe", "cheque", "online_other"];

export async function createInvoice(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "finance.edit")) return { error: "Your role can't create invoices." };
  const kind = str(f, "kind") ?? "client";
  if (!["client", "commission_gross", "commission_net", "general"].includes(kind)) return { error: "Choose the invoice type." };
  let branchId = Number(f.get("branch_id") || u.primaryBranchId);
  let contactId = str(f, "contact_id");
  const applicationId = str(f, "application_id");
  let partnerId = num(f, "partner_id");
  if (applicationId) {
    const a = await loadApplicationForUser(u, applicationId);
    if (!a) return { error: "You can't invoice this application." };
    if (contactId && contactId !== a.contact_id) return { error: "That application belongs to a different student." };
    contactId = a.contact_id;
  }
  if (contactId) {
    const c = await loadContactForUser(u, contactId);
    if (!c) return { error: "You can't invoice this student." };
    branchId = c.branch_id;
  }
  if (applicationId) {
    const app = await q1<{ partner_id: number | null; destination: string | null; onshore_transfer: boolean; accepted_date: string | null }>(
      "select partner_id, destination, onshore_transfer, accepted_date from applications where id=$1", [applicationId]);
    partnerId = partnerId ?? app?.partner_id ?? null;
    // Australia: no provider commission for onshore transfers accepted after 31 March 2026.
    if (kind.startsWith("commission") && app?.destination === "AU" && app.onshore_transfer && !(app.accepted_date && app.accepted_date <= "2026-03-31"))
      return { error: "This is an Australian onshore transfer: the provider can't pay commission for it. Invoice the student a service fee instead." };
  }
  if (!canSeeBranch(u, branchId)) return { error: "You can't invoice in that branch." };
  if (kind.startsWith("commission") && !partnerId) return { error: "Choose the institution that pays the commission." };
  if (kind === "client" && !contactId) return { error: "Choose the student this invoice is for." };

  const descs = f.getAll("line_desc").map(String), qtys = f.getAll("line_qty").map(Number), prices = f.getAll("line_price").map(Number), pcts = f.getAll("line_pct").map((x) => (String(x) === "" ? null : Number(x)));
  const lines = descs.map((d, i) => {
    const qty = qtys[i] || 1, price = prices[i] || 0, pct = pcts[i];
    const amount = round2(pct !== null && pct !== undefined && !Number.isNaN(pct) ? (price * pct) / 100 : qty * price);
    return { d: d.trim(), qty, price, pct: pct ?? null, amount };
  }).filter((l) => l.d && l.amount > 0);
  if (!lines.length) return { error: "Add at least one line with a description and an amount." };
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxPct = num(f, "tax_pct") ?? 0;
  const tax = round2((subtotal * taxPct) / 100);
  const currency = str(f, "currency");
  if (!currency) return { error: "Choose the currency." };

  const id = await tx(async (db) => {
    const b = (await db.query<{ code: string; invoice_seq: number }>("update branches set invoice_seq=invoice_seq+1 where id=$1 returning code, invoice_seq", [branchId])).rows[0];
    const number = `${b.code}-INV-${String(b.invoice_seq).padStart(5, "0")}`;
    const r = await db.query<{ id: string }>(
      `insert into invoices(number,branch_id,kind,contact_id,partner_id,application_id,issue_date,due_date,currency,subtotal,tax,total,status,notes,created_by)
       values($1,$2,$3,$4,$5,$6,coalesce($7::date,current_date),$8,$9,$10,$11,$12,'sent',$13,$14) returning id`,
      [number, branchId, kind, contactId, partnerId, applicationId, str(f, "issue_date"), str(f, "due_date"), currency, subtotal, tax, round2(subtotal + tax), str(f, "notes"), u.id]);
    for (const l of lines)
      await db.query("insert into invoice_lines(invoice_id,description,quantity,unit_price,commission_pct,amount) values($1,$2,$3,$4,$5,$6)", [r.rows[0].id, l.d.slice(0, 300), l.qty, l.price, l.pct, l.amount]);
    if (contactId) await db.query("insert into activities(contact_id,application_id,kind,body,user_id) values($1,$2,'invoice',$3,$4)", [contactId, applicationId, `Invoice ${number} for ${money2(round2(subtotal + tax), currency)}`, u.id]);
    return r.rows[0].id;
  });
  await audit(u, "create", "invoice", id);
  redirect(`/finance/${id}`);
}

export async function recordPayment(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("invoice_id"));
  const inv = await q1<{ id: string; branch_id: number; total: number; paid: number; currency: string; status: string; contact_id: string | null; number: string }>(
    "select id, branch_id, total, paid, currency, status, contact_id, number from invoices where id::text=$1", [id]);
  if (!inv || !can(u, "finance.edit") || !canSeeBranch(u, inv.branch_id)) return { error: "You can't record payments on this invoice." };
  if (inv.status === "void") return { error: "This invoice is void." };
  const method = str(f, "method");
  if (!method || !METHODS.includes(method)) return { error: "Choose how it was paid. Cash isn't accepted in any Eplanet branch." };
  const amount = num(f, "amount");
  if (!amount || amount <= 0) return { error: "Enter the amount received." };
  const due = round2(inv.total - inv.paid);
  if (amount > due + 0.009) return { error: `That's more than the balance due (${inv.currency} ${due}).` };
  const reference = str(f, "reference");
  if (!reference) return { error: "Enter the bank or wallet transaction reference, so the payment can be matched to the statement." };
  const dupRef = await q1("select 1 from payments where reference=$1 and method=$2", [reference, method]);
  if (dupRef) return { error: "A payment with this transaction reference is already recorded. Check it isn't a duplicate." };

  const receipt = await tx(async (db) => {
    const b = (await db.query<{ receipt_prefix: string; receipt_seq: number }>("update branches set receipt_seq=receipt_seq+1 where id=$1 returning receipt_prefix, receipt_seq", [inv.branch_id])).rows[0];
    const receiptNo = `${b.receipt_prefix}-${String(b.receipt_seq).padStart(6, "0")}`;
    const p = await db.query<{ id: string }>(
      `insert into payments(invoice_id,branch_id,receipt_no,received_on,amount,currency,method,reference,received_by) values($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7,$8,$9) returning id`,
      [inv.id, inv.branch_id, receiptNo, str(f, "received_on"), amount, inv.currency, method, reference, u.id]);
    const paid = round2(inv.paid + amount);
    await db.query("update invoices set paid=$2, status=$3 where id=$1", [inv.id, paid, paid >= inv.total - 0.009 ? "paid" : "part_paid"]);
    if (inv.contact_id) await db.query("insert into activities(contact_id,kind,body,user_id) values($1,'payment',$2,$3)", [inv.contact_id, `Payment of ${money2(amount, inv.currency)} received by ${METHOD_LABEL[method] ?? method.replace(/_/g, " ")}, receipt ${receiptNo}`, u.id]);
    return { id: p.rows[0].id, receiptNo };
  });
  await audit(u, "create", "payment", receipt.id, undefined, { invoice: inv.number, amount, method, reference });
  revalidatePath(`/finance/${inv.id}`);
  return { ok: `Payment recorded. Receipt ${receipt.receiptNo} is ready to print.` };
}

export async function voidInvoice(f: FormData) {
  const u = await requireUser();
  const id = String(f.get("id"));
  const inv = await q1<{ branch_id: number; paid: number }>("select branch_id, paid from invoices where id::text=$1", [id]);
  if (!inv || !can(u, "finance.void") || !canSeeBranch(u, inv.branch_id) || inv.paid > 0) return;
  await q("update invoices set status='void' where id::text=$1", [id]);
  await audit(u, "void", "invoice", id, undefined, { reason: str(f, "reason") });
  revalidatePath(`/finance/${id}`);
}

export async function addIncomeShare(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  const id = String(f.get("invoice_id"));
  const inv = await q1<{ branch_id: number; subtotal: number; kind: string }>("select branch_id, subtotal, kind from invoices where id::text=$1", [id]);
  if (!inv || !can(u, "finance.edit") || !canSeeBranch(u, inv.branch_id)) return { error: "You can't change this invoice." };
  const pct = num(f, "share_pct");
  if (!pct || pct <= 0 || pct > 100) return { error: "Enter a share between 0 and 100%." };
  const target = str(f, "target") ?? "";
  const [type, tid] = target.split(":");
  if (!tid) return { error: "Choose who receives the share." };
  const existing = (await q1<{ s: number }>("select coalesce(sum(share_pct),0) s from income_shares where invoice_id::text=$1", [id]))?.s ?? 0;
  if (existing + pct > 100) return { error: `Shares would add up to ${existing + pct}%, more than 100%.` };
  await q("insert into income_shares(invoice_id,sub_agent_id,branch_id,share_pct,amount) values($1,$2,$3,$4,$5)",
    [id, type === "agent" ? Number(tid) : null, type === "branch" ? Number(tid) : null, pct, round2((inv.subtotal * pct) / 100)]);
  revalidatePath(`/finance/${id}`);
  return { ok: "Share added." };
}

export async function markSharePaid(f: FormData) {
  const u = await requireUser();
  const sid = Number(f.get("share_id"));
  const s = await q1<{ invoice_id: string; branch_id: number }>("select s.invoice_id, i.branch_id from income_shares s join invoices i on i.id=s.invoice_id where s.id=$1", [sid]);
  if (!s || !can(u, "finance.edit") || !canSeeBranch(u, s.branch_id)) return;
  await q("update income_shares set status='paid', paid_on=current_date where id=$1", [sid]);
  revalidatePath(`/finance/${s.invoice_id}`);
}

export async function addSubAgent(_: ActionResult, f: FormData): Promise<ActionResult> {
  const u = await requireUser();
  if (!can(u, "finance.edit")) return { error: "Your role can't add sub-agents." };
  const name = str(f, "name");
  if (!name) return { error: "Enter the sub-agent's name." };
  await q("insert into sub_agents(name,contact_person,email,phone,country_code,default_share_pct) values($1,$2,$3,$4,$5,$6)",
    [name, str(f, "contact_person"), str(f, "email"), str(f, "phone"), str(f, "country_code"), num(f, "default_share_pct")]);
  revalidatePath("/finance/sub-agents");
  return { ok: `${name} added.` };
}
