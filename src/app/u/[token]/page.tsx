import type { Metadata } from "next";
import { date } from "@/lib/format";
import { findOpenLink } from "@/lib/upload-links";
import { linkItems } from "./items";
import { UploadItem } from "./upload-item";

// The page a student opens from their private upload link. No sign-in: the link itself is the key,
// so the page shows only the student's first name and the status of what's asked for.
export const metadata: Metadata = {
  title: { absolute: "Upload your documents · Eplanet International" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findOpenLink(token);
  const items = link ? await linkItems(link) : [];
  const done = items.filter((i) => i.docType !== "other" && i.status !== "needed").length;
  const total = items.filter((i) => i.docType !== "other").length;

  return (
    <main className="min-h-dvh bg-mist px-4 py-6 sm:py-10">
      <div className="mx-auto grid max-w-lg gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/eplanet-logo.png" alt="Eplanet International" className="mx-auto h-11 w-auto" />
        {!link ? (
          <section className="card p-6 text-center">
            <p className="font-display text-xl font-bold text-navy">This link isn&apos;t working</p>
            <p className="mt-1 text-slate">It may have expired or been replaced. Please ask your Eplanet counsellor for a new upload link.</p>
          </section>
        ) : (
          <>
            <header className="text-center">
              <h1 className="font-display text-2xl font-bold leading-tight text-navy text-balance sm:text-3xl">Hi {link.first_name}, upload your documents</h1>
              <p className="mt-2 text-slate">Take a clear photo of each page, or upload a PDF. Your files go straight to your Eplanet counsellor.</p>
            </header>
            {link.note && <p className="rounded-xl bg-sky px-4 py-3 text-sm text-navy"><b>From your counsellor:</b> {link.note}</p>}
            <section className="card" aria-label="Documents">
              {total > 0 && (
                <div className="border-b border-line px-5 py-3 text-sm">
                  <div className="flex justify-between"><span className="font-semibold">{done} of {total} uploaded</span><span className="text-slate">Link works until {date(link.expires_at)}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className="h-full rounded-full bg-ok" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                </div>
              )}
              <ul className="divide-y divide-line">
                {items.map((it, n) => <UploadItem key={it.docType} n={n} token={token} docType={it.docType} label={it.label} status={it.status} />)}
              </ul>
            </section>
            <p className="text-center text-xs text-slate">
              This link is private to you. Please don&apos;t share it. Photos, PDF and Word files up to 4 MB each.<br />
              Questions? Eplanet International, {link.branch}{link.branch_phone ? ` · ${link.branch_phone}` : ""}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
