import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-xs font-semibold text-slate no-underline hover:text-navy">← {back.label}</Link>
        )}
        <h1 className="mt-1 text-2xl font-bold text-navy">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-navy">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold text-navy">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "red" | "ok" | "warn" }) {
  const body = (
    <div className="card h-full p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate">{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold tnum ${tone === "red" ? "text-red" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-navy"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="no-underline hover:[&>div]:border-navy">{body}</Link> : body;
}

export function Field({ label, htmlFor, children, hint, className = "" }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate">{hint}</p>}
    </div>
  );
}

export function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate">{k}</dt>
          <dd className="min-w-0 break-words font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pager({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <span className="text-slate">Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn btn-sm" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn btn-sm" href={href(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}

export function Avatar({ name, photo, size = 32 }: { name: string; photo?: string | null; size?: number }) {
  if (photo) return <img src={photo} alt="" width={size} height={size} className="rounded-full object-cover object-top shrink-0" style={{ width: size, height: size }} />;
  const ini = name.replace(/^md\.?\s+/i, "").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className="inline-grid shrink-0 place-items-center rounded-full bg-sky font-semibold text-navy" style={{ width: size, height: size, fontSize: size * 0.38 }}>{ini}</span>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "red" | "ok"; children: ReactNode }) {
  const cls = tone === "warn" ? "bg-warn-tint text-warn" : tone === "red" ? "bg-red-tint text-red-dark" : tone === "ok" ? "bg-ok-tint text-ok" : "bg-sky text-navy";
  return <div role={tone === "red" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
