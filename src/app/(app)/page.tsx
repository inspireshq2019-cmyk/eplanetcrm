import Link from "next/link";
import { can, requireUser, scopeWhere } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { Card, Empty, Notice, PageHeader, Stat, TableWrap } from "@/components/ui";
import { DEST_LABEL, SOURCE_LABEL, STAGE_LABEL, ago, dateTime, daysUntil, date } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;

  const p: unknown[] = [];
  const cw = scopeWhere(user, "c", p, { ownerColumn: "owner_id" });
  const stats = await q1<{ new_leads: number; open_apps: number; won_month: number; waiting: number; visa_open: number; visa_expiring: number }>(
    `select
       (select count(*) from contacts c where ${cw} and c.created_at > now() - interval '7 days') new_leads,
       (select count(*) from applications c where ${cw} and c.status='open') open_apps,
       (select count(*) from applications c where ${cw} and c.status='won' and c.updated_at > date_trunc('month', now())) won_month,
       (select count(*) from checkins c where ${scopeWhere(user, "c", p)} and c.status='waiting' and c.arrived_at::date = current_date) waiting,
       (select count(*) from visa_cases c where ${scopeWhere(user, "c", p)} and c.status in ('preparing','lodged','further_info')) visa_open,
       (select count(*) from visa_cases c where ${scopeWhere(user, "c", p)} and c.status='granted' and c.visa_expiry between current_date and current_date + 90) visa_expiring`,
    p);

  const tasks = await q<{ id: number; title: string; due_at: string | null; priority: string; contact_id: string | null; contact_name: string | null }>(
    `select t.id, t.title, t.due_at, t.priority, t.contact_id, (c.first_name || ' ' || coalesce(c.last_name,'')) contact_name
       from tasks t left join contacts c on c.id=t.contact_id
      where t.assignee_id=$1 and t.status='open' order by t.due_at nulls last limit 8`, [user.id]);

  const p2: unknown[] = [];
  const leads = await q<{ id: string; ref: string; name: string; stage: string; source: string | null; dests: string[]; created_at: string; owner: string | null }>(
    `select c.id, c.ref, c.first_name || ' ' || coalesce(c.last_name,'') name, c.stage, c.source, c.interested_destinations dests, c.created_at, u.name owner
       from contacts c left join users u on u.id=c.owner_id
      where ${scopeWhere(user, "c", p2, { ownerColumn: "owner_id" })} order by c.created_at desc limit 8`, p2);

  const p3: unknown[] = [];
  const pipeline = await q<{ destination: string | null; stage: string; position: number; n: number }>(
    `select a.destination, s.name stage, s.position, count(*) n from applications a join workflow_stages s on s.id=a.stage_id
      where ${scopeWhere(user, "a", p3, { ownerColumn: "owner_id" })} and a.status='open'
      group by 1,2,3 order by 1,3`, p3);
  const byDest = new Map<string, { stage: string; n: number }[]>();
  pipeline.forEach((r) => {
    const k = r.destination ?? "—";
    byDest.set(k, [...(byDest.get(k) ?? []), { stage: r.stage, n: r.n }]);
  });

  const tz = (await q1<{ timezone: string }>("select timezone from branches where id=$1", [user.primaryBranchId]))?.timezone ?? "UTC";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greet}, ${user.name.replace(/^Md\.\s*/, "").split(" ")[0]}`}
        subtitle={`${user.roleName} · ${user.scope === "all" ? "All branches" : user.scope === "country" ? "All branches in your country" : user.primaryBranchName}`}
        actions={can(user, "contacts.create") ? <><Link href="/contacts/new" className="btn btn-primary">Add a lead</Link>{can(user, "checkin.manage") && <Link href="/checkin" className="btn">Check in a visitor</Link>}</> : null}
      />
      {denied && <div className="mb-5"><Notice tone="warn">Your role doesn't include access to that page. Ask your Branch Head if you need it.</Notice></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="New leads, 7 days" value={stats?.new_leads ?? 0} href="/contacts?sort=new" />
        <Stat label="Open applications" value={stats?.open_apps ?? 0} href="/applications" />
        <Stat label="Enrolled this month" value={stats?.won_month ?? 0} tone="ok" href="/applications?status=won" />
        <Stat label="Waiting in office" value={stats?.waiting ?? 0} tone={stats?.waiting ? "red" : undefined} href="/checkin" />
        <Stat label="Visa cases open" value={stats?.visa_open ?? 0} href="/visa" />
        <Stat label="Visas expiring, 90 days" value={stats?.visa_expiring ?? 0} tone={stats?.visa_expiring ? "warn" : undefined} href="/visa?expiring=1" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Newest students and leads" actions={<Link href="/contacts" className="text-sm font-semibold text-red no-underline">All →</Link>} pad={false}>
          {leads.length ? (
            <TableWrap>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Status</th><th>Wants</th><th>Source</th><th>Counsellor</th><th>Added</th></tr></thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td><Link href={`/contacts/${l.id}`}>{l.name}</Link><div className="text-xs text-slate">{l.ref}</div></td>
                      <td><span className={`badge ${l.stage === "client" ? "badge-ok" : l.stage === "lead" ? "badge-warn" : ""}`}>{STAGE_LABEL[l.stage]}</span></td>
                      <td>{l.dests.map((d) => DEST_LABEL[d] ?? d).join(", ") || "—"}</td>
                      <td>{SOURCE_LABEL[l.source ?? ""] ?? l.source ?? "—"}</td>
                      <td>{l.owner ?? <span className="badge badge-red">Unassigned</span>}</td>
                      <td className="whitespace-nowrap text-slate">{ago(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty title="No students or leads yet" action={can(user, "contacts.create") ? <Link href="/contacts/new" className="btn btn-primary">Add the first lead</Link> : undefined}>
              Leads from the website, Facebook, walk-ins and events will appear here.
            </Empty>
          )}
        </Card>

        <Card title="My tasks" actions={<Link href="/tasks" className="text-sm font-semibold text-red no-underline">All →</Link>} pad={false}>
          {tasks.length ? (
            <ul className="divide-y divide-line">
              {tasks.map((t) => {
                const overdue = t.due_at && new Date(t.due_at) < new Date();
                return (
                  <li key={t.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{t.title}</p>
                      {t.contact_id && <Link href={`/contacts/${t.contact_id}`} className="text-xs font-semibold text-navy no-underline">{t.contact_name}</Link>}
                    </div>
                    <span className={`badge ${overdue ? "badge-red" : "badge-grey"}`}>{t.due_at ? (overdue ? "Overdue · " : "") + dateTime(t.due_at) : "No due date"}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="No open tasks">Tasks assigned to you will appear here.</Empty>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Applications in progress, by step" pad={false}>
          {byDest.size ? (
            <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
              {[...byDest.entries()].map(([dest, rows]) => (
                <div key={dest} className="bg-white p-5">
                  <p className="font-semibold text-navy">{DEST_LABEL[dest] ?? dest}</p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {rows.map((r) => (
                      <li key={r.stage} className="flex justify-between gap-3"><span className="text-slate">{r.stage}</span><span className="font-semibold tnum">{r.n}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No applications in progress">Applications appear here, grouped by country and step, once counsellors start them.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
