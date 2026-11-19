"use client";

import { useState } from "react";

/** A read-only value with a Copy button, for pasting into another system (e.g. Google Ads). */
export function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-slate">{label}</label>
      <div className="flex gap-2">
        <input id={id} className="input min-w-0 flex-1 font-mono text-xs" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-sm shrink-0" onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          catch { (document.getElementById(id) as HTMLInputElement | null)?.select(); }
        }}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}
