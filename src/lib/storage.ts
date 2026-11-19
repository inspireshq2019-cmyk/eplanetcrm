import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

// Files are stored in Supabase Storage when it is configured (production),
// otherwise on the local disk (development). The bucket must be private.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
// Supabase accepts its secret key in both headers; older service-role keys work the same way.
const auth = () => ({ apikey: SUPABASE_KEY!, authorization: `Bearer ${SUPABASE_KEY}` });
const BUCKET = process.env.STORAGE_BUCKET ?? "documents";
const LOCAL_DIR = resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./uploads");

/** Resolves a storage key inside the upload folder, refusing anything that would escape it. */
function localPath(key: string) {
  const path = resolve(/*turbopackIgnore: true*/ LOCAL_DIR, key);
  if (!path.startsWith(LOCAL_DIR + sep)) throw new Error("Bad storage key");
  return path;
}

const useSupabase = () => !!(SUPABASE_URL && SUPABASE_KEY);

export async function putFile(key: string, data: Buffer, contentType: string) {
  if (useSupabase()) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: { ...auth(), "content-type": contentType, "x-upsert": "false" },
      body: new Uint8Array(data),
    });
    if (!r.ok) throw new Error(`Storage upload failed (${r.status})`);
    return;
  }
  const path = localPath(key);
  await mkdir(/*turbopackIgnore: true*/ dirname(path), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path, data);
}

export async function getFile(key: string): Promise<Buffer> {
  if (useSupabase()) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, { headers: auth() });
    if (!r.ok) throw new Error(`Storage download failed (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  return readFile(/*turbopackIgnore: true*/ localPath(key));
}

/** Permanently removes a stored file. Missing files are ignored. */
export async function removeFile(key: string): Promise<void> {
  if (useSupabase()) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!r.ok && r.status !== 404) throw new Error(`Storage delete failed (${r.status})`);
    return;
  }
  await rm(/*turbopackIgnore: true*/ localPath(key), { force: true });
}
