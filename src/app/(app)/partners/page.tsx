import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { Card, Empty, PageHeader, Pager, TableWrap } from "@/components/ui";
import { PARTNER_KINDS } from "@/lib/lookups";

export const metadata = { title: "Partners & courses" };
const PER = 50;

export default async function Partners({ searchParams }: { searchParams: Promise<{ q?: string; country?: string; kind?: string; all?: string; page?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const p: unknown[] = [];
  const where = ["pa.active"];
  if (!sp.all) where.push("pa.is_partner");
  if (sp.country) { p.push(sp.country); where.push(`pa.country_code = $${p.length}`); }
  if (sp.kind) { p.push(sp.kind); where.push(`pa.kind = $${p.length}`); }
  if (sp.q) { p.push(`%${sp.q.trim()}%`); where.push(`(pa.name ilike $${p.length} or pa.city ilike $${p.length} or pa.cricos ilike $${p.length} or exists (select 1 from courses c where c.partner_id=pa.id and c.active and c.title ilike $${p.length}))`); }
  const [rows, countries] = await Promise.all([
    q<{ id: number; name: string; kind: string; country: string | null; city: string | null; is_partner: boolean; courses: number; apps: number; pct: number | null; n: number }>(
      `select pa.id, pa.name, pa.kind, co.name country, pa.city, pa.is_partner,
              (select count(*) from courses c where c.partner_id=pa.id and c.active) courses,
              (select count(*) from applications a where a.partner_id=pa.id) apps,
              (select g.commission_pct from partner_agreements g where g.partner_id=pa.id and (g.valid_to is null or g.valid_to >= current_date) order by g.valid_from desc nulls last limit 1) pct,
              count(*) over() n
         from partners pa left join countries co on co.code=pa.country_code
        where ${where.join(" and ")} order by apps desc, pa.name limit ${PER} offset ${(page - 1) * PER}`, p),
    q<{ code: string; name: string }>("select distinct co.code, co.name from partners pa join countries co on co.code=pa.country_code where pa.active order by co.name"),
  ]);
  const qs = (o: Record<string, string | undefined>) => "/partners?" + new URLSearchParams(Object.entries({ q: sp.q, country: sp.country, kind: sp.kind, all: sp.all, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const kindLabel = Object.fromEntries(PARTNER_KINDS);

  return (
    <>
      <PageHeader title="Partners & courses" subtitle="Institutions, commission agreements and the course catalogue."
        actions={can(user, "partners.edit") ? <Link className="btn btn-primary" href="/partners/new">Add institution</Link> : null} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input className="input !w-auto min-w-56 flex-1" name="q" defaultValue={sp.q} placeholder="Institution, city, CRICOS or course" aria-label="Search" />
        <select className="select !w-auto" name="country" defaultValue={sp.country ?? ""} aria-label="Country"><option value="">All countries</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
        <select className="select !w-auto" name="kind" defaultValue={sp.kind ?? ""} aria-label="Type"><option value="">All types</option>{PARTNER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="all" value="1" defaultChecked={!!sp.all} /> Include non-partners</label>
        <button className="btn">Filter</button>
      </form>
      <Card pad={false}>
        {rows.length ? (
          <TableWrap><table className="tbl">
            <thead><tr><th>Institution</th><th>Type</th><th>Country</th><th className="text-right">Courses</th><th className="text-right">Applications</th><th className="text-right">Commission</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/partners/${r.id}`}>{r.name}</Link>{!r.is_partner && <span className="badge badge-grey ml-2">Not a partner</span>}</td>
                <td>{kindLabel[r.kind] ?? r.kind}</td><td>{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                <td className="tnum text-right">{r.courses || "—"}</td><td className="tnum text-right">{r.apps || "—"}</td>
                <td className="tnum text-right">{r.pct !== null ? `${r.pct}%` : <span className="text-slate">Not set</span>}</td>
              </tr>))}</tbody>
          </table></TableWrap>
        ) : <Empty title="No institutions match" />}
      </Card>
      <Pager page={page} pages={Math.ceil((rows[0]?.n ?? 0) / PER)} base={qs({ page: undefined })} />
    </>
  );
}
