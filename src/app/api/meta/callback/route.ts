import { NextResponse, type NextRequest } from "next/server";
import { can, canSeeBranch, getCurrentUser } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { metaConfigured, pagesFromCode } from "@/lib/meta";
import { seal } from "@/lib/secret-box";

// Step 2: Facebook sends the person back here. The pages they manage are held (encrypted) for 15 minutes while they choose.
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin;
  const back = (branch: number | null, error: string) => {
    const res = NextResponse.redirect(new URL(`/settings/leads?${branch ? `branch=${branch}&` : ""}error=${error}`, appUrl));
    res.cookies.delete("eplanet_meta_state");
    return res;
  };
  const u = await getCurrentUser();
  if (!u) return NextResponse.redirect(new URL("/login", appUrl));
  const [state, branchRaw] = (request.cookies.get("eplanet_meta_state")?.value ?? "").split(".");
  const branch = Number(branchRaw) || null;
  const sp = request.nextUrl.searchParams;
  if (!state || sp.get("state") !== state || !branch) return back(branch, "meta_state");
  if (!can(u, "leads.connect") || !canSeeBranch(u, branch)) return back(null, "denied");
  if (sp.get("error")) return back(branch, "meta_cancelled");
  const code = sp.get("code");
  if (!code || !metaConfigured()) return back(branch, "meta_failed");
  let pages;
  try {
    pages = await pagesFromCode(code, `${appUrl}/api/meta/callback`);
  } catch (e) {
    console.error("Facebook connect failed", e instanceof Error ? e.message : e);
    return back(branch, "meta_failed");
  }
  if (!pages.length) return back(branch, "meta_no_pages");
  await q1("delete from meta_connect_sessions where user_id=$1 or expires_at < now()", [u.id]);
  const s = await q1<{ id: string }>("insert into meta_connect_sessions(user_id,branch_id,pages_enc) values($1,$2,$3) returning id",
    [u.id, branch, seal(JSON.stringify(pages.map((p) => ({ id: p.id, name: p.name, token: p.access_token }))))]);
  const res = NextResponse.redirect(new URL(`/settings/leads/choose?s=${s!.id}`, appUrl));
  res.cookies.delete("eplanet_meta_state");
  return res;
}
