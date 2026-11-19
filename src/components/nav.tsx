"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

const ICONS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  door: "M6 3h9l3 3v15H6zM14 12h.01",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2M18 18h2v2h-2z",
  people: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-3.3 3.6-6 8-6s8 2.7 8 6",
  flow: "M4 6h7v4H4zM13 14h7v4h-7zM7.5 10v4a2 2 0 0 0 2 2H13",
  stamp: "M8 21h8M5 17h14v-3a3 3 0 0 0-3-3h-1V8a3 3 0 1 0-6 0v3H8a3 3 0 0 0-3 3z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  check: "M4 12l5 5L20 6",
  money: "M3 7h18v10H3zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0",
  building: "M4 21V5l8-2v18M12 7l8 2v12M8 9h.01M8 13h.01M16 13h.01M16 17h.01",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9.1 1.7 1.7 0 0 0-.9 1.5V22h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9-.1A1.7 1.7 0 0 0 9.2 2.2V2h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.6 1h.2v4H19a1.7 1.7 0 0 0-1.6 1z",
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] ?? ICONS.home} />
    </svg>
  );
}

export function Sidebar({ items, user, signOut }: { items: NavItem[]; user: { name: string; role: string; branch: string }; signOut: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  const list = (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          onClick={() => setOpen(false)}
          aria-current={active(it.href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium no-underline transition-colors ${
            active(it.href) ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/8 hover:text-white"
          }`}
        >
          <Icon name={it.icon} />
          <span className="flex-1">{it.label}</span>
          {it.badge ? <span className="rounded-full bg-red px-1.5 text-[11px] font-bold text-white tnum">{it.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto border-t border-white/10 pt-4 text-white">
      <p className="text-sm font-semibold leading-tight">{user.name}</p>
      <p className="text-xs text-white/65 mt-0.5">{user.role} · {user.branch}</p>
      <form action={signOut} className="mt-3">
        <button className="text-xs font-semibold text-white/80 underline underline-offset-2 hover:text-white" type="submit">Sign out</button>
      </form>
    </div>
  );

  return (
    <>
      {/* Phone: top bar with a menu button */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <Link href="/" className="font-display font-bold text-white no-underline">eplanet <span className="text-red">CRM</span></Link>
        <button className="rounded-lg border border-white/25 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav">
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open && (
        <div id="mobile-nav" className="lg:hidden fixed inset-0 top-[56px] z-20 overflow-y-auto bg-navy px-4 pb-8 pt-3 flex flex-col gap-4">
          {list}
          {footer}
        </div>
      )}

      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col gap-6 bg-navy px-4 py-5 overflow-y-auto">
        <Link href="/" className="px-3 font-display text-lg font-bold text-white no-underline">eplanet <span className="text-red">CRM</span></Link>
        {list}
        {footer}
      </aside>
    </>
  );
}
