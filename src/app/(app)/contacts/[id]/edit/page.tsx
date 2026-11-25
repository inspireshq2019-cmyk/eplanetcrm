import { notFound, redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q1 } from "@/lib/db";
import { visibleBranches, visibleStaff } from "@/lib/lookups";
import { PageHeader } from "@/components/ui";
import { ContactForm, type ContactValues } from "../../contact-form";
import { updateContact } from "../../actions";

export const metadata = { title: "Edit student" };

export default async function EditContact({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!can(user, "contacts.edit")) redirect("/?denied=contacts.edit");
  if (!(await loadContactForUser(user, id))) notFound();
  const c = (await q1<ContactValues & { first_name: string; ref: string }>("select * from contacts where id=$1", [id]))!;
  if (!can(user, "contacts.sensitive")) { c.passport_no = null; c.passport_expiry = null; }
  const [branches, staff] = await Promise.all([visibleBranches(user), visibleStaff(user)]);
  return (
    <>
      <PageHeader title={`Edit ${c.first_name} ${c.last_name ?? ""}`} back={{ href: `/contacts/${id}`, label: c.ref }} />
      <ContactForm action={updateContact} mode="edit" values={c} branches={branches} staff={staff} canOwn={false} canSensitive={can(user, "contacts.sensitive")} defaultBranchId={user.primaryBranchId} agent={user.scope === "agent"} />
    </>
  );
}
