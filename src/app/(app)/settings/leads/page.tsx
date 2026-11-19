import Link from "next/link";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { visibleBranches } from "@/lib/lookups";
import { metaConfigured } from "@/lib/meta";
import { open } from "@/lib/secret-box";
import { ago, dateTime } from "@/lib/format";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { CopyField } from "@/components/copy-field";
import { Card, Empty, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { addGoogle, removeSource, retryLead, setLeadAssign } from "./actions";

export const metadata = { title: "Ad lead sources" };

const ERRORS: Record<string, string> = {
  meta_not_configured: "Facebook connections aren't switched on yet. The Meta app settings need to be added to the CRM's hosting first (see the setup guide).",
  meta_state: "That Facebook sign-in took too long or came from another window. Please try again.",
  meta_cancelled: "Facebook connection was cancelled. Nothing was changed.",
  meta_failed: "Facebook didn't complete the connection. Try again, and make sure you allow every permission Facebook asks for.",
  meta_no_pages: "Your Facebook account doesn't manage any pages, or you didn't allow access to them. Sign in with an account that's an admin of the branch's page.",
  denied: "You can't connect lead sources for that branch.",
};

type Source = { id: number; kind: string; name: string; external_id: string | null; secret_enc: string | null; connected_at: string; by: string | null;
  last_lead_at: string | null; last_test_at: string | null; last_error: string | null; last_error_at: string | null; leads: number };

export default async function LeadSources({ searchParams }: { searchParams: Promise<{ branch?: string; error?: string; connected?: string; failed?: string }> }) {
  const u = await requirePermission("leads.connect");
  const sp = await searchParams;
  const branches = await visibleBranches(u);
  const branch = branches.find((b) => b.id === Number(sp.branch)) ?? branches.find((b) => b.id === u.primaryBranchId) ?? branches[0];
  if (!branch) return <Empty title="No branch to set up" />;
  const h = await headers();
  const appUrl = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const [sources, assign, events] = await Promise.all([
    q<Source>(
      `select s.id, s.kind, s.name, s.external_id, s.secret_enc, s.connected_at, u.name by, s.last_lead_at, s.last_test_at, s.last_error, s.last_error_at,
              (select count(*)::int from lead_events e where e.source_id=s.id and e.status in ('created','existing')) leads
         from lead_sources s left join users u on u.id=s.connected_by where s.branch_id=$1 and s.active order by s.kind, s.connected_at`, [branch.id]),
    q1<{ lead_assign: string }>("select lead_assign from branches where id=$1", [branch.id]),
    q<{ id: string; received_at: string; status: string; error: string | null; kind: string; source: string; contact_id: string | null; student: string | null; ref: string | null }>(
      `select e.id, e.received_at, e.status, e.error, e.kind, s.name source, c.id contact_id, trim(c.first_name || ' ' || coalesce(c.last_name,'')) student, c.ref
         from lead_events e join lead_sources s on s.id=e.source_id left join contacts c on c.id=e.contact_id
        where e.branch_id=$1 order by e.received_at desc limit 25`, [branch.id]),
  ]);
  const fb = sources.filter((s) => s.kind === "facebook");
  const google = sources.filter((s) => s.kind === "google").map((s) => {
    const { key, token } = JSON.parse(open(s.secret_enc!)) as { key: string; token: string };
    return { ...s, key, url: `${appUrl}/api/public/google-leads/${token}` };
  });
  const problem = (s: Source) => !!s.last_error && (!s.last_lead_at || new Date(s.last_error_at!) > new Date(s.last_lead_at));
  const status = (s: Source) => problem(s) ? <span className="badge badge-red">Problem</span> : <span className="badge badge-ok">Connected</span>;

  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Ad lead sources" subtitle={`${branch.name}: leads from these pages and forms arrive in this branch automatically.`} />
      <div className="mb-6 grid gap-3">
        {sp.error && ERRORS[sp.error] && <Notice tone="red">{ERRORS[sp.error]}</Notice>}
        {sp.connected && Number(sp.connected) > 0 && <Notice tone="ok">Connected {sp.connected} Facebook {sp.connected === "1" ? "page" : "pages"}. New leads from {sp.connected === "1" ? "it" : "them"} will appear in {branch.name}.</Notice>}
        {sp.failed && <Notice tone="warn">Some pages couldn&apos;t be connected: {sp.failed}</Notice>}
        {branches.length > 1 && (
          <form className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">Branch<select className="select" name="branch" defaultValue={branch.id}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <button className="btn">Show</button>
          </form>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Facebook & Instagram pages" actions={metaConfigured() ? <a className="btn btn-sm btn-primary" href={`/api/meta/connect?branch=${branch.id}`}>Connect pages</a> : undefined}>
          <p className="mb-4 text-sm text-slate">Sign in with a Facebook account that is an admin of the branch&apos;s page. Leads from that page&apos;s Facebook and Instagram lead ads then arrive here. A page can belong to one branch only.</p>
          {!metaConfigured() && <div className="mb-4"><Notice tone="warn">Facebook connections switch on once the CRM is live and Eplanet&apos;s Meta app is set up. The setup guide covers this.</Notice></div>}
          {fb.length ? (
            <ul className="grid gap-3">{fb.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.name} {status(s)}</p>
                  <p className="text-xs text-slate">Connected {dateTime(s.connected_at, branch.timezone)}{s.by ? ` by ${s.by}` : ""} · {s.leads} {s.leads === 1 ? "lead" : "leads"} · last lead {s.last_lead_at ? ago(s.last_lead_at) : "not yet"}</p>
                  {problem(s) && <p className="mt-1 text-xs text-red-dark">{s.last_error}</p>}
                </div>
                <form action={removeSource}><input type="hidden" name="id" value={s.id} /><ConfirmButton confirmLabel="Click again to disconnect">Disconnect</ConfirmButton></form>
              </li>))}
            </ul>
          ) : <Empty title="No Facebook pages connected" />}
        </Card>

        <Card title="Google Ads lead forms">
          <p className="mb-4 text-sm text-slate">In Google Ads, open the lead form&apos;s lead delivery settings, choose the <b>webhook</b> option, and paste the webhook URL and key below. Then press <b>Send test data</b> and check that &ldquo;test received&rdquo; appears here. You can use one connection for all of the branch&apos;s forms.</p>
          {google.length > 0 && (
            <ul className="mb-5 grid gap-3">{google.map((s) => (
              <li key={s.id} className="grid gap-3 rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.name} {status(s)}</p>
                    <p className="text-xs text-slate">{s.leads} {s.leads === 1 ? "lead" : "leads"} · last lead {s.last_lead_at ? ago(s.last_lead_at) : "not yet"} · {s.last_test_at ? `test received ${ago(s.last_test_at)}` : "no test received yet"}</p>
                  </div>
                  <form action={removeSource}><input type="hidden" name="id" value={s.id} /><ConfirmButton confirmLabel="Click again to remove">Remove</ConfirmButton></form>
                </div>
                <CopyField id={`url-${s.id}`} label="Webhook URL" value={s.url} />
                <CopyField id={`key-${s.id}`} label="Key" value={s.key} />
              </li>))}
            </ul>
          )}
          <ActionForm action={addGoogle} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="branch_id" value={branch.id} />
            <Field label="New connection name" htmlFor="g-name" className="min-w-0 flex-1"><input className="input" id="g-name" name="name" required maxLength={100} placeholder={`e.g. ${branch.name} Google Ads`} /></Field>
            <Submit className="btn">Add Google connection</Submit>
          </ActionForm>
        </Card>

        <Card title="Who gets new ad leads">
          <ActionForm action={setLeadAssign} className="grid gap-3">
            <input type="hidden" name="branch_id" value={branch.id} />
            <label className="flex gap-3 text-sm"><input type="radio" name="lead_assign" value="unassigned" defaultChecked={assign?.lead_assign !== "rotate"} />
              <span><b>Leave them unassigned.</b> The branch head gets a task to call each one and hands it to a counsellor.</span></label>
            <label className="flex gap-3 text-sm"><input type="radio" name="lead_assign" value="rotate" defaultChecked={assign?.lead_assign === "rotate"} />
              <span><b>Share them among the branch&apos;s counsellors in turn.</b> Each new lead goes to the counsellor who has waited longest for one, with a task to call within an hour.</span></label>
            <p className="text-xs text-slate">If the mobile number or email is already in the CRM, no new student is made: the enquiry is added to the existing student and their counsellor gets the task.</p>
            <div><Submit className="btn">Save</Submit></div>
          </ActionForm>
        </Card>

        <Card title="Recent ad leads" pad={false} actions={<Link className="btn btn-sm" href="/contacts?tag=ad-lead">All ad leads</Link>}>
          {events.length ? (
            <TableWrap><table className="tbl">
              <thead><tr><th>Received</th><th>From</th><th>Student</th><th>Result</th></tr></thead>
              <tbody>{events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{dateTime(e.received_at, branch.timezone)}</td>
                  <td>{e.source}</td>
                  <td>{e.contact_id ? <Link className="text-navy" href={`/contacts/${e.contact_id}`}>{e.student}</Link> : "—"}</td>
                  <td>{e.status === "created" ? <span className="badge badge-ok">New lead</span>
                    : e.status === "existing" ? <span className="badge">Existing student</span>
                    : e.status === "test" ? <span className="badge badge-grey">Test</span>
                    : e.status === "processing" ? <span className="badge badge-grey">Arriving</span>
                    : <span className="grid gap-1"><span className="badge badge-red" title={e.error ?? ""}>Not saved</span>
                        {e.kind === "facebook" && <form action={retryLead}><input type="hidden" name="id" value={e.id} /><button className="text-xs font-semibold text-navy underline">Try again</button></form>}</span>}</td>
                </tr>))}</tbody>
            </table></TableWrap>
          ) : <Empty title="No ad leads yet">Leads appear here as soon as they arrive.</Empty>}
        </Card>
      </div>
    </>
  );
}
