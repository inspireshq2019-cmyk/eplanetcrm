import Image from "next/image";
import { q } from "@/lib/db";
import { demoSignIn, enterDemoCode } from "./actions";
import { demoMisconfigured, demoOn, demoUnlocked } from "@/lib/demo";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  domain: "That Google account isn't on an Eplanet domain. Sign in with your @eplanetintl.com account.",
  no_account: "Your Google account isn't set up in the CRM yet. Ask your Branch Head or the CRM admin to add you.",
  state: "The sign-in took too long or was interrupted. Please try again.",
  google: "Google didn't confirm the sign-in. Please try again.",
  unverified: "Google says this email address isn't verified.",
  google_not_configured: "Google sign-in isn't set up yet. The administrator needs to add the Google sign-in keys to the hosting settings.",
  demo_off: "Test sign-in is switched off on this server.",
  demo_code: "That test code isn't right. Ask the administrator for the current code.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  const demoAvailable = demoOn();
  const demo = demoAvailable && (await demoUnlocked());
  const users = demo
    ? await q<{ id: string; name: string; title: string | null; role_name: string; branch: string }>(
        `select u.id, u.name, u.title, r.name role_name, b.name branch from users u join roles r on r.key=u.role_key
         join branches b on b.id=u.primary_branch_id where u.active order by r.key='owner' desc, b.name, u.name`)
    : [];

  return (
    <main className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="bg-navy text-white px-6 py-10 sm:px-12 flex flex-col justify-between gap-10">
        <Image src="/brand/eplanet-logo-white.png" alt="Eplanet International" width={170} height={46} priority />
        <div className="max-w-md">
          <p className="text-xs font-semibold tracking-[.16em] uppercase text-white/70">Eplanet CRM</p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-3 leading-tight">Every student, application and visa in one place.</h1>
          <p className="mt-4 text-white/80">For Eplanet staff in all 22 offices. Sign in with your work Google account.</p>
        </div>
        <p className="text-xs text-white/60">Access is logged. Only staff accounts set up by an administrator can sign in.</p>
      </section>

      <section className="px-6 py-10 sm:px-12 flex items-center">
        <div className="w-full max-w-md mx-auto">
          <h2 className="text-2xl font-bold text-navy">Sign in</h2>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-tint text-red-dark px-4 py-3 text-sm">{ERRORS[error] ?? "Sign-in failed. Please try again."}</p>
          )}
          <a href={next === "/" ? "/api/auth/google" : `/api/auth/google?next=${encodeURIComponent(next)}`} className="btn btn-navy w-full mt-6 !py-3 !text-[15px]">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Sign in with Google
          </a>

          {demoMisconfigured() && (
            <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Test sign-in is switched on but has no test code. Add a DEMO_PASSCODE of at least 12 characters in the hosting settings.</p>
          )}
          {demoAvailable && !demo && (
            <form action={enterDemoCode} className="mt-8 card p-5">
              <input type="hidden" name="next" value={next} />
              <p className="text-sm font-semibold text-navy">Test sign-in</p>
              <p className="text-xs text-slate mt-1">For testing before Google sign-in is set up. Enter the test code from the administrator.</p>
              <label htmlFor="code" className="label mt-4">Test code</label>
              <input id="code" name="code" type="password" className="input" autoComplete="off" required />
              <button className="btn btn-primary w-full mt-4" type="submit">Continue</button>
            </form>
          )}
          {demo && (
            <form action={demoSignIn} className="mt-8 card p-5">
              <input type="hidden" name="next" value={next} />
              <p className="text-sm font-semibold text-navy">Test sign-in</p>
              <p className="text-xs text-slate mt-1">For trying the CRM before Google sign-in is set up. Pick a staff member to see the CRM as they would. This is switched off on the live system.</p>
              <label htmlFor="user_id" className="label mt-4">Sign in as</label>
              <select id="user_id" name="user_id" className="select" required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.role_name}, {u.branch}</option>
                ))}
              </select>
              <button className="btn btn-primary w-full mt-4" type="submit">Continue</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
