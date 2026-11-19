import { notFound } from "next/navigation";
import { z } from "zod";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { visibleBranches } from "@/lib/lookups";
import { assignableRoles } from "@/lib/staff";
import { Card, Notice, PageHeader, TableWrap } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { StaffForm, type StaffRow } from "../staff-form";

export const metadata = { title: "Staff member" };

export default async function StaffMember({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requirePermission("settings.users");
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = await q1<Omit<StaffRow, "extra"> & { role_name: string }>("select u.*, r.name role_name from users u join roles r on r.key=u.role_key where u.id=$1", [id]);
  if (!s || !canSeeBranch(user, s.primary_branch_id)) notFound();
  const [extra, roles, branches, activity] = await Promise.all([
    q<{ branch_id: number }>("select branch_id from user_branches where user_id=$1", [id]),
    assignableRoles(user), visibleBranches(user),
    q<{ at: string; action: string; entity: string }>("select at, action, entity from audit_log where user_id=$1 order by at desc limit 15", [id]),
  ]);
  const canEdit = roles.some((r) => r.key === s.role_key);
  return (
    <>
      <PageHeader back={{ href: "/settings/staff", label: "Staff" }} title={s.name} subtitle={s.role_name} />
      {sp.created && <div className="mb-4"><Notice tone="ok">Added. {s.email.endsWith(".invalid") ? "" : `${s.name} can now sign in with ${s.email}.`}</Notice></div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Details">
          {canEdit ? <StaffForm staff={{ ...s, extra: extra.map((e) => e.branch_id) }} roles={roles} branches={branches} self={s.id === user.id} />
            : <Notice tone="warn">This person&apos;s role is above yours, so only an owner can change their account.</Notice>}
        </Card>
        <Card title="Recent activity" pad={false}>
          {activity.length ? (
            <TableWrap><table className="tbl"><tbody>{activity.map((a, i) => <tr key={i}><td className="whitespace-nowrap text-sm">{dateTime(a.at)}</td><td className="text-sm">{a.action.replace("_", " ")} {a.entity.replace("_", " ")}</td></tr>)}</tbody></table></TableWrap>
          ) : <p className="p-5 text-sm text-slate">No activity yet.</p>}
        </Card>
      </div>
    </>
  );
}
