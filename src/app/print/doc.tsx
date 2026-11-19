import type { ReactNode } from "react";
import { PrintButton } from "./print-button";

/** Shared letterhead for printable invoices and receipts. */
export function PrintDoc({ title, number, branch, children }: { title: string; number: string; branch: { name: string; address: string | null; phone: string | null; email: string | null }; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white px-4 py-8 print:p-0">
      <div className="mx-auto max-w-[800px]">
        <div className="mb-6 flex justify-end gap-2 print:hidden"><PrintButton /></div>
        <header className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b-2 border-navy pb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/eplanet-logo.png" alt="Eplanet International" className="h-12 w-auto" />
            <p className="mt-3 text-sm font-semibold">Eplanet International — {branch.name}</p>
            <p className="max-w-80 text-xs text-slate">{[branch.address, branch.phone, branch.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-navy">{title}</h1>
            <p className="tnum mt-1 text-sm font-semibold">{number}</p>
          </div>
        </header>
        {children}
        <footer className="mt-10 border-t border-line pt-4 text-xs text-slate">
          Eplanet International does not accept cash. Payments are accepted only by bank transfer, card or registered mobile wallet, and every payment carries a transaction reference.
        </footer>
      </div>
    </div>
  );
}
