import { requirePermission } from "@/lib/auth";
import { visibleBranches, visibleStaff } from "@/lib/lookups";
import { PageHeader } from "@/components/ui";
import { FormBuilder } from "../form-builder";

export const metadata = { title: "New event form" };

export default async function NewForm({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const kind = (await searchParams).kind === "walk_in" ? "walk_in" : "event";
  const u = await requirePermission("forms.manage");
  const [branches, staff] = await Promise.all([visibleBranches(u), visibleStaff(u)]);
  return (
    <>
      <PageHeader back={{ href: "/forms", label: "Event forms" }} title="New event form" subtitle="Students open it by scanning a QR code and register on their phone." />
      <FormBuilder branches={branches} staff={staff.filter((s) => ["counsellor", "branch_head", "operations_manager"].includes(s.role_key))} defaultBranch={u.primaryBranchId} defaultKind={kind} />
    </>
  );
}
