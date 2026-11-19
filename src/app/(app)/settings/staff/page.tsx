import Link from "next/link";
import { requirePermission, scopeWhere } from "@/lib/auth";
import { q } from "@/lib/db";
import { Avatar, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { ago, daysUntil } from "@/lib/format";

export const metadata = { title: "Staff" };

export default async function Staff({ searchParams }: { searchParams: Promise<{ pending?: string; inactive?: string; q?: string }> }) {
  const user = await requirePermission("settings.users");
  const sp = await searchParams;
  const p: unknown[] = [];
  const where = [scopeWhere(user, "u", p).replace("u.branch_id", "u.primary_branch_id")];
  if (!sp.inactive) where.push("u.active");
  if (sp.pending) where.push("u.email like '%.invalid'");
  if (sp.q) { p.push(`%${sp.q}%`); where.push(`(u.name ilike $${p.length} or u.email ilike $${p.length})`); }
  const rows = await q<{ id: string; name: string; email: string; title: string | null; role: string; branch: string; marn: string | null; marn_expiry: string | null; active: boolean; last_login_at: string | null; photo_url: string | null }>(
    `select u.id, u.name, u.email, u.title, r.name role, b.name branch, u.marn, u.marn_expiry, u.active, u.last_login_at, u.photo_url
       from users u join roles r on r.key=u.role_key join branches b on b.id=u.primary_branch_id where ${where.join(" and ")} order by b.name, r.name, u.name`, p);
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Staff" subtitle="Everyone signs in with their Eplanet Google Workspace account."
        actions={<Link className="btn btn-primary" href="/settings/staff/new">Add staff member</Link>} />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input !w-auto min-w-56" name="q" defaultValue={sp.q} placeholder="Name or email" aria-label="Search staff" />
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="pending" value="1" defaultChecked={!!sp.pending} /> Missing email only</label>
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="inactive" value="1" defaultChecked={!!sp.inactive} /> Include people who left</label>
        <button className="btn">Filter</button>
      </form>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Email</th><th>MARN</th><th>Last signed in</th></tr></thead>
            <tbody>{rows.map((r) => {
              const left = daysUntil(r.marn_expiry);
              return (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td><Link href={`/settings/staff/${r.id}`} className="flex items-center gap-2"><Avatar name={r.name} photo={r.photo_url} size={28} />{r.name}</Link>{r.title && <div className="pl-9 text-xs text-slate">{r.title}</div>}</td>
                  <td>{r.role}</td><td>{r.branch}</td>
                  <td>{r.email.endsWith(".invalid") ? <span className="badge badge-warn">Email needed</span> : <span className="text-sm">{r.email}</span>}</td>
                  <td className="tnum">{r.marn ? <>{r.marn}{left !== null && left < 60 && <div><span className={`badge ${left < 0 ? "badge-red" : "badge-warn"}`}>{left < 0 ? "Lapsed" : `${left} days left`}</span></div>}</> : "—"}</td>
                  <td className="text-sm">{r.active ? (r.last_login_at ? ago(r.last_login_at) : "Never") : "Left"}</td>
                </tr>);
            })}</tbody>
          </table></TableWrap>
        ) : <Empty title="No staff match" />}
      </Card>
    </>
  );
}
