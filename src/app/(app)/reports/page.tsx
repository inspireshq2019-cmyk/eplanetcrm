import { requirePermission } from "@/lib/auth";
import { visibleBranches } from "@/lib/lookups";
import { buildReport, parseRange, REPORT_KEYS } from "@/lib/reports";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { date } from "@/lib/format";

export const metadata = { title: "Reports" };

/** Adds thousands separators to plain numbers for reading on screen; CSV downloads keep the raw figures. */
const show = (v: unknown) => {
  if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) {
    const s = String(v), dp = s.includes(".") ? s.split(".")[1].length : 0;
    return Number(s).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  return v as React.ReactNode;
};

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; branch?: string }> }) {
  const user = await requirePermission("reports.view");
  const sp = await searchParams;
  const branches = await visibleBranches(user);
  const tz = branches.find((b) => b.id === user.primaryBranchId)?.timezone ?? "Asia/Dhaka";
  const range = parseRange(sp, tz);
  if (range.branch && !branches.some((b) => b.id === range.branch)) range.branch = null;
  const reports = (await Promise.all(REPORT_KEYS.map((k) => buildReport(user, k, range)))).filter((r) => r !== null);
  const qs = new URLSearchParams({ from: range.from, to: range.to, ...(range.branch ? { branch: String(range.branch) } : {}) }).toString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const presets: [string, string, string][] = [
    ["This month", today.slice(0, 8) + "01", today],
    ["Last 90 days", new Date(Date.parse(today) - 89 * 864e5).toISOString().slice(0, 10), today],
    ["This year", today.slice(0, 5) + "01-01", today],
  ];

  return (
    <>
      <PageHeader title="Reports" subtitle={`${date(range.from)} – ${date(range.to)}${range.branch ? ` · ${branches.find((b) => b.id === range.branch)?.name}` : branches.length > 1 ? " · all your branches" : ""}`} />
      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">From<input className="input" type="date" name="from" defaultValue={range.from} /></label>
          <label className="grid gap-1 text-sm">To<input className="input" type="date" name="to" defaultValue={range.to} /></label>
          {branches.length > 1 && (
            <label className="grid gap-1 text-sm">Branch<select className="select" name="branch" defaultValue={range.branch ?? ""}><option value="">All</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          )}
          <button className="btn btn-navy">Show</button>
          <span className="flex flex-wrap gap-2">{presets.map(([l, f, t]) => <a key={l} className="btn btn-sm" href={`/reports?${new URLSearchParams({ from: f, to: t, ...(range.branch ? { branch: String(range.branch) } : {}) })}`}>{l}</a>)}</span>
        </form>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key} className={r.columns.length > 5 ? "xl:col-span-2" : ""} title={r.title} pad={false} actions={<a className="btn btn-sm" href={`/api/export/report?key=${r.key}&${qs}`}>CSV</a>}>
            {r.note && <p className="px-5 pt-3 text-xs text-slate">{r.note}</p>}
            {r.rows.length ? (
              <TableWrap><table className="tbl">
                <thead><tr>{r.columns.map((c) => <th key={c.key} className={c.num ? "text-right" : ""}>{c.label}</th>)}</tr></thead>
                <tbody>{r.rows.map((row, i) => <tr key={i}>{r.columns.map((c) => <td key={c.key} className={c.num ? "tnum text-right" : ""}>{row[c.key] === null || row[c.key] === undefined ? "—" : c.num ? show(row[c.key]) : row[c.key]}</td>)}</tr>)}</tbody>
              </table></TableWrap>
            ) : <Empty title="Nothing in this period" />}
          </Card>
        ))}
      </div>
    </>
  );
}
