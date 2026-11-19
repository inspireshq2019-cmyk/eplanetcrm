import { notFound } from "next/navigation";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { visibleBranches, visibleStaff } from "@/lib/lookups";
import type { FormRow } from "@/lib/forms";
import { PageHeader } from "@/components/ui";
import { FormBuilder } from "../../form-builder";

export const metadata = { title: "Edit event form" };

export default async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePermission("forms.manage");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const form = await q1<FormRow>("select id,branch_id,slug,title,intro,to_char(event_date,'YYYY-MM-DD') event_date,event_time,venue,fields,questions,owner_id,follow_up,thank_you,active,to_char(closes_on,'YYYY-MM-DD') closes_on from lead_forms where id=$1", [Number(id)]);
  if (!form || !canSeeBranch(u, form.branch_id)) notFound();
  const [branches, staff] = await Promise.all([visibleBranches(u), visibleStaff(u)]);
  return (
    <>
      <PageHeader back={{ href: `/forms/${form.id}`, label: form.title }} title="Edit form" subtitle="The QR code and address stay the same, so printed posters keep working." />
      <FormBuilder form={form} branches={branches} staff={staff.filter((s) => ["counsellor", "branch_head", "operations_manager"].includes(s.role_key) || s.id === form.owner_id)} defaultBranch={form.branch_id} />
    </>
  );
}
