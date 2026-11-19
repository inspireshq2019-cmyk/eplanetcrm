import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { visibleBranches } from "@/lib/lookups";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Field, PageHeader, TableWrap } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { uploadImport } from "./actions";

export const metadata = { title: "Import from Agentcis" };

export default async function ImportPage() {
  const user = await requirePermission("import.run");
  const [branches, history] = await Promise.all([
    visibleBranches(user),
    q<{ id: string; filename: string; row_count: number; status: string; result: { imported: number; duplicates: number } | null; created_at: string; who: string | null; branch: string }>(
      `select ib.id, ib.filename, ib.row_count, ib.status, ib.result, ib.created_at, u.name who, b.name branch
         from import_batches ib left join users u on u.id=ib.created_by join branches b on b.id=ib.branch_id
        where ${user.scope === "all" ? "true" : "ib.branch_id = any($1::int[])"} order by ib.created_at desc limit 30`, user.scope === "all" ? [] : [user.branchIds]),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Import from Agentcis" subtitle="Bring your existing students and leads across, one branch at a time." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="1. Export from Agentcis">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Sign in to Agentcis with an account that can export contacts (usually the account owner).</li>
            <li>Open the contacts or clients list, filter it to one branch, and use its export option to download a CSV or Excel file.</li>
            <li>If you get an Excel file, open it and use <em>File › Save As › CSV UTF-8</em>.</li>
            <li>Upload the file here. Nothing is saved to students until you check the column matching on the next screen and press Import.</li>
          </ol>
          <p className="mt-3 text-xs text-slate">Agentcis menu names may differ from these steps. Applications, documents and payments aren&apos;t imported by this tool; ask for those separately once students are in.</p>
        </Card>
        <Card title="2. Upload the CSV">
          <ActionForm action={uploadImport} className="grid gap-4">
            <Field label="Import into branch" htmlFor="branch_id"><select className="select" id="branch_id" name="branch_id" defaultValue={user.primaryBranchId}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="CSV file" htmlFor="file" hint="Up to 8 MB and 25,000 rows."><input className="input" type="file" id="file" name="file" accept=".csv,text/csv,.txt" required /></Field>
            <div><Submit pending="Reading…">Upload and check columns</Submit></div>
          </ActionForm>
        </Card>
      </div>
      {history.length > 0 && (
        <Card title="Previous imports" pad={false} className="mt-6">
          <TableWrap><table className="tbl">
            <thead><tr><th>File</th><th>Branch</th><th>By</th><th>When</th><th className="text-right">Rows</th><th>Result</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id}><td><Link href={`/settings/import/${h.id}`}>{h.filename}</Link></td><td>{h.branch}</td><td>{h.who ?? "—"}</td><td className="text-sm">{dateTime(h.created_at)}</td><td className="tnum text-right">{h.row_count}</td>
                <td>{h.status === "done" && h.result ? <span className="badge badge-ok">{h.result.imported} imported · {h.result.duplicates} duplicates</span> : h.status === "pending" ? <span className="badge badge-warn">Waiting for you</span> : <span className="badge badge-grey">Cancelled</span>}</td></tr>))}</tbody>
          </table></TableWrap>
        </Card>
      )}
    </>
  );
}
