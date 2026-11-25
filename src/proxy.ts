import { NextResponse, type NextRequest } from "next/server";

// Quick gate: anyone without a session cookie is sent to the sign-in page.
// The real checks (valid signature, active account, permissions) happen on the server for every page and action.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("eplanet_crm");
  if (!hasSession) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // Pass the page address on, so the app layout can keep sub-agents to their own pages.
  const headers = new Headers(request.headers);
  headers.set("x-eplanet-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!login|api/auth|api/public|f/|_next/static|_next/image|favicon.ico|brand).*)"],
};
