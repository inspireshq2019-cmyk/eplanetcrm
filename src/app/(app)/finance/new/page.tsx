import { requirePermission } from "@/lib/auth";
import { loadApplicationForUser, loadContactForUser } from "@/lib/access";
import { q, q1 } from "@/lib/db";
import { visibleBranches } from "@/lib/lookups";
import { Card, Notice, PageHeader } from "@/components/ui";
import { InvoiceForm } from "./invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ contact?: string; application?: string; kind?: string }> }) {
  const user = await requirePermission("finance.edit");
  const sp = await searchParams;
  let contact: { id: string; name: string; ref: string } | null = null;
  let application: Parameters<typeof InvoiceForm>[0]["application"] = null;

  if (sp.application) {
    const a = await loadApplicationForUser(user, sp.application);
    if (a) {
      const r = await q1<{ ref: string; course_title: string | null; partner: string | null; partner_id: number | null; tuition_fee: number | null; fee_currency: string | null; destination: string | null; onshore_transfer: boolean; accepted_date: string | null; pct: number | null }>(
        `select a.ref, a.course_title, p.name partner, a.partner_id, a.tuition_fee, a.fee_currency, a.destination, a.onshore_transfer, a.accepted_date,
                (select g.commission_pct from partner_agreements g where g.partner_id=a.partner_id and (g.valid_to is null or g.valid_to >= current_date) order by g.valid_from desc nulls last limit 1) pct
           from applications a left join partners p on p.id=a.partner_id where a.id=$1`, [a.id]);
      if (r) application = {
        id: a.id, ref: r.ref, label: [r.ref, r.partner, r.course_title].filter(Boolean).join(" · "), tuition: r.tuition_fee, feeCurrency: r.fee_currency, partnerId: r.partner_id, pct: r.pct,
        commissionBlocked: r.destination === "AU" && r.onshore_transfer && !(r.accepted_date && r.accepted_date <= "2026-03-31"),
      };
      sp.contact = a.contact_id;
    }
  }
  if (sp.contact) {
    const c = await loadContactForUser(user, sp.contact);
    if (c) contact = await q1<{ id: string; name: string; ref: string }>("select id, first_name || ' ' || coalesce(last_name,'') name, ref from contacts where id=$1", [c.id]);
  }
  const [branches, partners] = await Promise.all([
    visibleBranches(user),
    q<{ id: number; name: string }>("select id, name from partners where active and kind <> 'insurer' order by name"),
  ]);
  const kind = sp.kind && ["client", "commission_gross", "commission_net", "general"].includes(sp.kind) ? sp.kind : application && !application.commissionBlocked ? "commission_gross" : contact ? "client" : "general";

  return (
    <>
      <PageHeader back={{ href: "/finance", label: "Finance" }} title="New invoice"
        subtitle={application ? `For application ${application.label}` : contact ? `For ${contact.name}` : "Numbered automatically per branch when you save."} />
      {application && !application.tuition && <div className="mb-4"><Notice tone="warn">This application has no tuition fee recorded, so the commission line starts empty. Add the fee on the application to fill it automatically.</Notice></div>}
      <Card>
        <InvoiceForm kind={kind} contact={contact} application={application} branches={branches} defaultBranch={user.primaryBranchId} partners={partners} />
      </Card>
    </>
  );
}
