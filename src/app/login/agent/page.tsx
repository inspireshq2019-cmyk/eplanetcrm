import Image from "next/image";
import Link from "next/link";
import { requestCode, verifyCode } from "./actions";

export const metadata = { title: "Partner agency sign-in" };

const ERRORS: Record<string, string> = {
  email: "Enter the email address Eplanet registered for you.",
  unavailable: "Email sign-in isn't available yet. Please contact your Eplanet branch.",
  send: "We couldn't send the code just now. Please try again in a few minutes.",
  code: "That code isn't right. Check the latest email and try again.",
  expired: "That code has expired or was used too many times. Ask for a new one.",
};

export default async function AgentSignIn({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
  const { step, error } = await searchParams;
  const codeStep = step === "code";
  return (
    <main className="grid min-h-dvh place-items-center bg-mist px-4 py-10">
      <div className="w-full max-w-md">
        <Image src="/brand/eplanet-logo.png" alt="Eplanet International" width={170} height={46} className="mx-auto mb-6 h-11 w-auto" priority />
        <section className="card p-6">
          <h1 className="font-display text-2xl font-bold text-navy">Partner agency sign-in</h1>
          <p className="mt-1 text-sm text-slate">For sub-agents working with Eplanet International. Eplanet staff sign in with Google on the <Link className="text-navy" href="/login">main sign-in page</Link>.</p>
          {error && ERRORS[error] && <p role="alert" className="mt-4 rounded-xl bg-red-tint px-4 py-3 text-sm text-red-dark">{ERRORS[error]}</p>}
          {!codeStep ? (
            <form action={requestCode} className="mt-5 grid gap-3">
              <label htmlFor="email" className="label">Your email</label>
              <input id="email" name="email" type="email" className="input" autoComplete="email" required maxLength={150} />
              <button className="btn btn-primary mt-1" type="submit">Email me a sign-in code</button>
            </form>
          ) : (
            <form action={verifyCode} className="mt-5 grid gap-3">
              <p className="text-sm">If that address has an Eplanet partner login, we&apos;ve emailed a 6-digit code. It expires in 10 minutes.</p>
              <label htmlFor="code" className="label">Code</label>
              <input id="code" name="code" className="input tnum text-center text-xl tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
              <button className="btn btn-primary mt-1" type="submit">Sign in</button>
              <Link className="text-center text-sm text-navy" href="/login/agent">Use a different email or send a new code</Link>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
