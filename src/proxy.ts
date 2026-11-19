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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|api/public|f/|_next/static|_next/image|favicon.ico|brand).*)"],
};
