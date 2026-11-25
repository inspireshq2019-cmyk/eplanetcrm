import { NextResponse, type NextRequest } from "next/server";
import { audit, can, getCurrentUser } from "@/lib/auth";
import { connectMailbox } from "@/lib/mailbox";

// Step 2: Google sends the owner back here; the send permission is stored encrypted.
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const back = (q: string) => { const r = NextResponse.redirect(new URL(`/settings/mailbox?${q}`, appUrl)); r.cookies.delete("eplanet_mailbox_state"); return r; };
  const u = await getCurrentUser();
  if (!u) return NextResponse.redirect(new URL("/login", appUrl));
  if (!can(u, "settings.system")) return back("error=denied");
  const sp = request.nextUrl.searchParams;
  const state = request.cookies.get("eplanet_mailbox_state")?.value;
  if (!state || sp.get("state") !== state) return back("error=state");
  if (sp.get("error") || !sp.get("code")) return back("error=cancelled");
  try {
    const email = await connectMailbox(sp.get("code")!, `${appUrl}/api/mailbox/callback`, u.id, u.name);
    await audit(u, "update", "setting", "admissions_mailbox", undefined, { email });
    return back("connected=1");
  } catch (e) {
    return back(`error=failed&detail=${encodeURIComponent((e instanceof Error ? e.message : "Couldn't connect").slice(0, 200))}`);
  }
}
