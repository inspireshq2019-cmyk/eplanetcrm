"use client";

import { startTransition, useActionState, useEffect, type FormEvent, type ReactNode } from "react";
import type { RegisterResult } from "@/lib/forms";
import { register } from "./actions";

/** Submits the registration and swaps the form for the thank-you message once it's saved. */
/** Inside a website page: tells the page how tall the form is, so there's no inner scroll bar. */
export function EmbedSize({ slug }: { slug: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () => window.parent.postMessage({ eplanetForm: slug, height: Math.ceil(document.documentElement.scrollHeight) }, "*");
    const ro = new ResizeObserver(post); ro.observe(document.body); post();
    return () => ro.disconnect();
  }, [slug]);
  return null;
}

export function RegisterForm({ children, name, embedSlug, walkIn }: { children: ReactNode; name: string; embedSlug?: string; walkIn?: boolean }) {
  const [state, action, pending] = useActionState<RegisterResult, FormData>(register, null);
  // Tell the website page an enquiry was sent, so it can count it (e.g. as a Meta Pixel "Lead"). Nothing personal is passed.
  useEffect(() => {
    if (state?.ok && embedSlug && window.parent !== window) window.parent.postMessage({ eplanetForm: embedSlug, submitted: true }, "*");
  }, [state, embedSlug]);
  if (state?.ok) {
    return (
      <div role="status" className="grid justify-items-center gap-3 py-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-ok-tint text-ok" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6" /></svg>
        </span>
        <p className="font-display text-2xl font-bold text-navy">{embedSlug ? "Thank you" : walkIn ? "You\u2019re checked in" : "You\u2019re registered"}</p>
        <p className="max-w-sm text-slate">{state.ok}</p>
        <p className="text-sm text-slate">{name}</p>
      </div>
    );
  }
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
  const fe = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate data-errors={Object.keys(fe).join(" ")}>
      {state?.error && <p role="alert" className="rounded-xl bg-red-tint px-4 py-3 text-sm text-red-dark">{state.error}</p>}
      <style>{Object.keys(fe).map((k) => `[data-field="${k}"] .field-error{display:block}[data-field="${k}"] .input,[data-field="${k}"] .select{border-color:var(--color-red)}`).join("")}</style>
      {children}
      <button type="submit" className="btn btn-primary h-12 text-base" disabled={pending}>{pending ? (embedSlug ? "Sending…" : walkIn ? "Checking in…" : "Registering…") : embedSlug ? "Send enquiry" : walkIn ? "Check in" : "Register"}</button>
    </form>
  );
}
