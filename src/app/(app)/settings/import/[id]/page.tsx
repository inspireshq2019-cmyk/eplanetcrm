import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { guessMapping, IMPORT_FIELDS } from "@/lib/import-fields";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Field, Notice, PageHeader, Stat, TableWrap } from "@/components/ui";
import { cancelImport, runImport } from "../actions";

export const metadata = { title: "Check the import" };

export default async function ImportBatch({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("import.run");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const b = await q1<{ id: string; filename: string; headers: string[]; rows: string[][] | null; row_count: number; status: string; branch_id: number; branch: string; result: { imported: number; duplicates: number; skipped: number; notes: number; unmatched_owners: string[] } | null }>(
    "select ib.*, br.name branch from import_batches ib join branches br on br.id=ib.branch_id where ib.id=$1", [id]);
  if (!b || !canSeeBranch(user, b.branch_id)) notFound();

  if (b.status !== "pending" || !b.rows) {
    return (
      <>
        <PageHeader back={{ href: "/settings/import", label: "Import" }} title={b.filename} subtitle={`${b.branch} · ${b.status === "done" ? "Imported" : "Cancelled"}`} />
        {b.result && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Students imported" value={b.result.imported} tone="ok" href="/contacts?tag=imported&source=agentcis" />
              <Stat label="Already in the CRM (skipped)" value={b.result.duplicates} />
              <Stat label="No name or contact (skipped)" value={b.result.skipped} />
              <Stat label="Notes added" value={b.result.notes} />
            </div>
            {b.result.unmatched_owners.length > 0 && <Notice tone="warn">These counsellor names didn&apos;t match any staff account, so those students have no counsellor yet: {b.result.unmatched_owners.join(", ")}. Add the staff in Settings › Staff, then assign them from the student list.</Notice>}
          </>
        )}
        <p className="mt-4 text-sm text-slate">The uploaded file has been deleted from the CRM. Imported students are tagged “imported”.</p>
      </>
    );
  }

  const guess = guessMapping(b.headers);
  const sample = b.rows.slice(0, 8);
  const filled = b.headers.map((_, i) => b.rows!.filter((r) => r[i]).length);
  return (
    <>
      <PageHeader back={{ href: "/settings/import", label: "Import" }} title="Match the columns" subtitle={`${b.filename} · ${b.row_count} rows · into ${b.branch}`} />
      <Card title="Preview of your file" pad={false} className="mb-6">
        <TableWrap><table className="tbl text-xs">
          <thead><tr>{b.headers.map((h, i) => <th key={i} className="whitespace-nowrap">{h || `Column ${i + 1}`}<div className="font-normal normal-case text-slate">{filled[i]} filled</div></th>)}</tr></thead>
          <tbody>{sample.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="max-w-48 truncate">{c}</td>)}</tr>)}</tbody>
        </table></TableWrap>
      </Card>
      <Card title="Which column holds what?">
        <ActionForm action={runImport} className="grid gap-4">
          <input type="hidden" name="id" value={b.id} />
          <p className="text-sm text-slate">We&apos;ve guessed from the column names. Check each one; leave a field on “Don&apos;t import” if the file doesn&apos;t have it. Passport numbers are never imported this way.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {IMPORT_FIELDS.map((fld) => (
              <Field key={fld.key} label={fld.label} htmlFor={`map_${fld.key}`}>
                <select className="select" id={`map_${fld.key}`} name={`map_${fld.key}`} defaultValue={guess[fld.key] ?? ""}>
                  <option value="">Don&apos;t import</option>{b.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </Field>))}
          </div>
          <Field label="How did these students agree to Eplanet keeping their details? *" htmlFor="consent_note" hint="Recorded on every imported student, for your privacy records.">
            <input className="input" id="consent_note" name="consent_note" required maxLength={200} placeholder="e.g. Enquiry and registration forms collected by Eplanet Dhaka, recorded in Agentcis" />
          </Field>
          <Notice tone="info">Students whose mobile number or email is already in the CRM are skipped, so it&apos;s safe to run an overlapping file. Statuses are mapped to Lead, Prospect, Client or Archived from the words used in your file.</Notice>
          <div className="flex flex-wrap gap-2"><Submit pending="Importing… this can take a minute">Import {b.row_count} rows</Submit></div>
        </ActionForm>
        <form action={cancelImport} className="mt-3"><input type="hidden" name="id" value={b.id} /><button className="btn btn-sm">Cancel and delete the uploaded file</button></form>
      </Card>
      <p className="mt-4 text-sm"><Link className="text-navy" href="/settings/import">Back</Link></p>
    </>
  );
}
