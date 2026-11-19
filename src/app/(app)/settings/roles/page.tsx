import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { PERMISSIONS } from "../../../../../db/seed-data";
import { saveRole } from "../actions";

export const metadata = { title: "Roles and permissions" };
const SCOPE: Record<string, string> = { all: "Every branch", country: "All branches in their country", branch: "Their branch(es)", own: "Only their own students" };

export default async function Roles() {
  await requirePermission("settings.system");
  const roles = await q<{ key: string; name: string; scope: string; description: string | null; permissions: string[]; n: number }>(
    "select r.*, (select count(*) from users u where u.role_key=r.key and u.active) n from roles r order by array_length(r.permissions,1) desc nulls last, r.name");
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Roles and permissions" subtitle="Each person has one role. Changes apply straight away and are recorded in the audit log." />
      <div className="grid gap-4">
        {roles.map((r) => (
          <Card key={r.key} title={<>{r.name} <span className="text-sm font-normal text-slate">· {r.n} {r.n === 1 ? "person" : "people"} · sees {SCOPE[r.scope].toLowerCase()}</span></>}>
            {r.description && <p className="mb-3 text-sm text-slate">{r.description}</p>}
            {r.key === "owner" ? <p className="text-sm">Owners always have every permission.</p> : (
              <ActionForm action={saveRole} className="grid gap-3">
                <input type="hidden" name="key" value={r.key} />
                <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(PERMISSIONS).map(([k, label]) => (
                    <label key={k} className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-mist"><input type="checkbox" name="perm" value={k} defaultChecked={r.permissions.includes(k)} className="mt-1" /> {label}</label>))}
                </div>
                <div><Submit className="btn btn-sm">Save {r.name}</Submit></div>
              </ActionForm>
            )}
          </Card>))}
      </div>
    </>
  );
}
