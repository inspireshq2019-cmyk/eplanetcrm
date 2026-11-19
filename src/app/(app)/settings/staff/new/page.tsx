import { requirePermission } from "@/lib/auth";
import { visibleBranches } from "@/lib/lookups";
import { assignableRoles } from "@/lib/staff";
import { Card, PageHeader } from "@/components/ui";
import { StaffForm } from "../staff-form";

export const metadata = { title: "Add staff member" };

export default async function NewStaff() {
  const user = await requirePermission("settings.users");
  const [roles, branches] = await Promise.all([assignableRoles(user), visibleBranches(user)]);
  return (
    <>
      <PageHeader back={{ href: "/settings/staff", label: "Staff" }} title="Add staff member" subtitle="They can sign in with Google as soon as you save." />
      <Card><StaffForm roles={roles} branches={branches} staff={{ id: "", name: "", email: "", title: null, phone: null, role_key: "counsellor", primary_branch_id: user.primaryBranchId, marn: null, marn_expiry: null, qualification: null, active: true, extra: [] }} /></Card>
    </>
  );
}
