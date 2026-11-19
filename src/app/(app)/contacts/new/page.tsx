import { requirePermission } from "@/lib/auth";
import { visibleBranches, visibleStaff } from "@/lib/lookups";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../contact-form";
import { createContact } from "../actions";

export const metadata = { title: "Add a lead" };

export default async function NewContact({ searchParams }: { searchParams: Promise<{ name?: string; phone?: string; checkin?: string }> }) {
  const user = await requirePermission("contacts.create");
  const sp = await searchParams;
  const [branches, staff] = await Promise.all([visibleBranches(user), visibleStaff(user)]);
  const [first, ...rest] = (sp.name ?? "").trim().split(/\s+/);
  return (
    <>
      <PageHeader title="Add a lead" back={{ href: "/contacts", label: "Students & leads" }} subtitle="Fields marked * are required. You can add results, documents and applications after saving." />
      <ContactForm
        action={createContact}
        mode="new"
        branches={branches}
        staff={staff}
        canOwn={user.scope !== "own"}
        canSensitive={false}
        defaultBranchId={user.primaryBranchId}
        values={{ first_name: first || undefined, last_name: rest.join(" ") || null, phone: sp.phone ?? null, source: sp.checkin ? "walk_in" : undefined }}
      />
    </>
  );
}
