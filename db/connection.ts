// Database connection settings shared by the app and the setup script.
// On Vercel with the Supabase integration the address arrives as POSTGRES_URL (pooled, for the app)
// and POSTGRES_URL_NON_POOLING (direct, for setup); elsewhere DATABASE_URL is used.
import type { PoolConfig } from "pg";

export function dbConfig(kind: "app" | "setup"): PoolConfig {
  const raw = kind === "setup"
    ? process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
    : process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) throw new Error("No database address: set DATABASE_URL (or connect Supabase in Vercel).");
  // Hosted databases need an encrypted connection. The sslmode in the address is removed because
  // newer versions of the database driver treat it as "verify against public certificates", which
  // Supabase's own certificate chain doesn't pass; encryption stays on either way.
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("supa");
  const local = url.hostname === "" || url.hostname === "localhost" || url.hostname === "127.0.0.1" || raw.includes("%2F");
  const ssl = process.env.DATABASE_SSL === "0" ? false : process.env.DATABASE_SSL === "1" || !local;
  return { connectionString: url.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined };
}
