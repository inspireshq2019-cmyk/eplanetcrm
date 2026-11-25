import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { visibleBranches, visibleStaff } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { time } from "@/lib/format";
import { checkIn, moveCheckin } from "./actions";
import { can } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Office check-in" };

type Row = { id: number; visitor_name: string; phone: string | null; purpose: string | null; status: string; arrived_at: string; started_at: string | null; completed_at: string | null; contact_id: string | null; host: string | null };

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const user = await requirePermission("checkin.manage");
  const sp = await searchParams;
  const branches = await visibleBranches(user);
  const branch = branches.find((b) => b.id === Number(sp.branch)) ?? branches.find((b) => b.id === user.primaryBranchId) ?? branches[0];
  const [rows, staff, kiosk] = await Promise.all([
    q<Row>(`select c.id, c.visitor_name, c.phone, c.purpose, c.status, c.arrived_at, c.started_at, c.completed_at, c.contact_id, u.name host
              from checkins c left join users u on u.id=c.host_id
             where c.branch_id=$1 and (c.arrived_at at time zone $2)::date = (now() at time zone $2)::date order by c.arrived_at`, [branch.id, branch.timezone]),
    visibleStaff(user),
    q<{ id: number; title: string }>("select id, title from lead_forms where branch_id=$1 and kind='walk_in' and active order by created_at desc limit 1", [branch.id]),
  ]);
  const col = (s: string) => rows.filter((r) => r.status === s);
  const mins = (a: string, b?: string | null) => Math.max(0, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000));

  const Lane = ({ title, status, items, next, nextLabel }: { title: string; status: string; items: Row[]; next?: string; nextLabel?: string }) => (
    <Card title={`${title} (${items.length})`} pad={false}>
      {items.length ? (
        <ul className="divide-y divide-line">{items.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{r.contact_id ? <Link href={`/contacts/${r.contact_id}`} className="text-navy no-underline">{r.visitor_name}</Link> : r.visitor_name}</p>
                <p className="text-xs text-slate">{r.purpose ?? "General enquiry"}{r.phone ? ` · ${r.phone}` : ""}</p>
                <p className="text-xs text-slate">Arrived {time(r.arrived_at, branch.timezone)}{status === "waiting" ? ` · waiting ${mins(r.arrived_at)} min` : ""}{r.host ? ` · ${r.host}` : ""}</p>
              </div>
              {status === "waiting" && mins(r.arrived_at) >= 15 && <span className="badge badge-red">{mins(r.arrived_at)} min</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {next && <form action={moveCheckin}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value={next} /><button className="btn btn-sm btn-navy">{nextLabel}</button></form>}
              {!r.contact_id && <Link className="btn btn-sm" href={`/contacts/new?name=${encodeURIComponent(r.visitor_name)}&phone=${encodeURIComponent(r.phone ?? "")}&checkin=1`}>Create record</Link>}
            </div>
          </li>))}</ul>
      ) : <Empty title={status === "waiting" ? "Nobody waiting" : status === "attending" ? "Nobody being seen" : "No visits finished yet today"} />}
    </Card>
  );

  return (
    <>
      <PageHeader title="Office check-in" subtitle={`${branch.name} · today · ${rows.length} visitor${rows.length === 1 ? "" : "s"}`}
        actions={branches.length > 1 ? (
          <form className="flex gap-2"><select className="select" name="branch" defaultValue={branch.id} aria-label="Branch">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="btn">Show</button></form>
        ) : null} />

      <AutoRefresh seconds={30} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm">
        {kiosk[0] ? <>
          <span><b>Self check-in is on.</b> Visitors who scan the reception QR code appear under Waiting by themselves (this page updates every 30 seconds).</span>
          <span className="flex gap-2"><a className="btn btn-sm" href={`/print/form/${kiosk[0].id}`} target="_blank" rel="noopener">Print QR poster</a>{can(user, "forms.manage") && <Link className="btn btn-sm" href={`/forms/${kiosk[0].id}`}>Form and visitors</Link>}</span>
        </> : <>
          <span><b>Let visitors check themselves in.</b> Put a QR code at reception: visitors fill in their details on their phone, new ones become walk-in leads, and everyone appears here under Waiting.</span>
          {can(user, "forms.manage") && <Link className="btn btn-sm btn-navy" href="/forms/new?kind=walk_in">Set up the reception QR</Link>}
        </>}
      </div>
      <Card title="Check in a visitor" className="mb-6">
        <ActionForm action={checkIn} resetOnSuccess className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-end">
          <input type="hidden" name="branch_id" value={branch.id} />
          <Field label="Name *" htmlFor="visitor_name"><input className="input" id="visitor_name" name="visitor_name" required autoComplete="off" /></Field>
          <Field label="Mobile" htmlFor="phone" hint="Links to their record if we have it."><input className="input tnum" id="phone" name="phone" inputMode="tel" /></Field>
          <Field label="Reason for visit" htmlFor="purpose">
            <input className="input" id="purpose" name="purpose" list="purposes" placeholder="e.g. Australia counselling" />
            <datalist id="purposes">{["New enquiry", "Counselling appointment", "Document submission", "IELTS class", "OSHC", "Visa update", "Payment", "Parent meeting"].map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="To see" htmlFor="host_id"><select className="select" id="host_id" name="host_id"><option value="">Next available</option>{staff.filter((s) => s.primary_branch_id === branch.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Submit className="btn btn-primary">Check in</Submit>
        </ActionForm>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Lane title="Waiting" status="waiting" items={col("waiting")} next="attending" nextLabel="Start seeing" />
        <Lane title="Being seen" status="attending" items={col("attending")} next="completed" nextLabel="Finish" />
        <Lane title="Finished today" status="completed" items={col("completed")} />
      </div>
    </>
  );
}
