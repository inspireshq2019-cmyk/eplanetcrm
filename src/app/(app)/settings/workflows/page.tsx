import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { DEST_LABEL } from "@/lib/format";

export const metadata = { title: "Application workflows" };

export default async function Workflows() {
  await requirePermission("settings.system");
  const wfs = await q<{ id: number; name: string; destination: string | null; stages: { name: string; outcome: string | null; commission_trigger: boolean }[]; checklist: string[]; apps: number }>(
    `select w.id, w.name, w.destination,
            (select json_agg(json_build_object('name', s.name, 'outcome', s.outcome, 'commission_trigger', s.commission_trigger) order by s.position) from workflow_stages s where s.workflow_id=w.id) stages,
            coalesce((select array_agg(ci.name order by ci.position) from checklist_items ci where ci.workflow_id=w.id), '{}') checklist,
            (select count(*) from applications a where a.workflow_id=w.id) apps
       from workflows w order by w.name`);
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Application workflows" subtitle="The steps and document checklist for each destination." />
      <div className="grid gap-4 xl:grid-cols-2">
        {wfs.map((w) => (
          <Card key={w.id} title={<>{w.name} <span className="text-sm font-normal text-slate">· {DEST_LABEL[w.destination ?? ""] ?? "Any"} · {w.apps} applications</span></>}>
            <ol className="mb-4 flex flex-wrap gap-1.5 text-xs">
              {(w.stages ?? []).map((s, i) => (
                <li key={i} className={`badge ${s.outcome === "won" ? "badge-ok" : s.outcome === "lost" ? "badge-red" : ""}`}>{i + 1}. {s.name}{s.commission_trigger ? " · commission" : ""}</li>))}
            </ol>
            {w.checklist.length > 0 && <><p className="mb-1 text-sm font-semibold">Documents</p><ul className="list-disc pl-5 text-sm text-slate">{w.checklist.map((c) => <li key={c}>{c}</li>)}</ul></>}
          </Card>))}
      </div>
      <p className="mt-6 text-sm text-slate">Steps are fixed for now so that existing applications keep their history. Tell your CRM admin if a destination needs a different step.</p>
    </>
  );
}
