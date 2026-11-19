import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { dbConfig } from "../../db/connection";

declare global {
  // Reuse one pool across hot reloads in development.
  var __eplanetPool: Pool | undefined;
}

export const pool =
  globalThis.__eplanetPool ??
  new Pool({ ...dbConfig("app"), max: process.env.VERCEL ? 3 : 10, idleTimeoutMillis: 10_000 });
if (process.env.NODE_ENV !== "production") globalThis.__eplanetPool = pool;

// Return dates as plain strings (YYYY-MM-DD) and numerics as numbers.
import { types } from "pg";
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => Number(v));

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(sql, params);
  return r.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(sql, params);
  return r.rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
