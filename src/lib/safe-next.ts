/** Accepts only a path inside this app (e.g. /contacts/123), never another site, for returning people after sign-in. */
export function safeNext(v: string | null | undefined): string {
  if (!v || typeof v !== "string") return "/";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\r\n]/.test(v) || v.startsWith("/login") || v.startsWith("/api/")) return "/";
  return v.slice(0, 500);
}
