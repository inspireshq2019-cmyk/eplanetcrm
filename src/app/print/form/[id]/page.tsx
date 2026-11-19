import { notFound } from "next/navigation";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { date } from "@/lib/format";
import { publicBase, qrSvg } from "@/lib/qr";
import { PrintButton } from "../../print-button";

export const metadata = { title: "QR poster" };

/** An A4 poster for the stand or the venue entrance: scan to register. */
export default async function FormPoster({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePermission("forms.manage");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const f = await q1<{ slug: string; branch_id: number; title: string; intro: string | null; event_date: string | null; event_time: string | null; venue: string | null; branch: string; phone: string | null }>(
    `select f.slug, f.branch_id, f.title, f.intro, to_char(f.event_date,'YYYY-MM-DD') event_date, f.event_time, f.venue, b.name branch, b.phone
       from lead_forms f join branches b on b.id=f.branch_id where f.id=$1`, [Number(id)]);
  if (!f || !canSeeBranch(u, f.branch_id)) notFound();
  const url = `${await publicBase()}/f/${f.slug}`;
  const svg = await qrSvg(url);
  return (
    <div className="min-h-dvh bg-white px-4 py-8 print:p-0">
      <style>{"@page { size: A4; margin: 14mm; }"}</style>
      <div className="mx-auto mb-6 flex max-w-[720px] justify-end print:hidden"><PrintButton /></div>
      <article className="mx-auto flex max-w-[720px] flex-col items-center gap-6 rounded-3xl border-4 border-navy px-8 py-10 text-center print:min-h-[260mm] print:justify-between print:rounded-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/eplanet-logo.png" alt="Eplanet International" className="h-14 w-auto" />
        <div className="grid gap-2">
          <h1 className="font-display text-4xl font-bold leading-tight text-navy text-balance">{f.title}</h1>
          <p className="text-lg font-semibold">{[f.event_date ? date(f.event_date) : null, f.event_time, f.venue].filter(Boolean).join(" · ")}</p>
          {f.intro && <p className="mx-auto max-w-lg text-slate">{f.intro}</p>}
        </div>
        <div className="grid justify-items-center gap-3">
          <p className="rounded-full bg-red px-6 py-2 font-display text-2xl font-bold uppercase tracking-wide text-white">Scan to register</p>
          <div className="w-72 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-sm text-slate">Open your phone camera and point it at the code.<br />Or type: <span className="font-mono font-semibold text-ink">{url.replace(/^https?:\/\//, "")}</span></p>
        </div>
        <p className="text-sm text-slate">Eplanet International — {f.branch}{f.phone ? ` · ${f.phone}` : ""}</p>
      </article>
    </div>
  );
}
