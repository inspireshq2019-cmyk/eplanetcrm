import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, getCurrentUser } from "@/lib/auth";
import { loadContactForUser } from "@/lib/access";
import { q1 } from "@/lib/db";
import { getFile } from "@/lib/storage";

// Streams a document to a signed-in user who may see the student. Every download is logged.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const d = await q1<{ contact_id: string; storage_key: string; filename: string; mime: string | null; doc_type: string }>(
    "select contact_id, storage_key, filename, mime, doc_type from documents where id=$1", [id]);
  if (!d || !(await loadContactForUser(user, d.contact_id))) return new NextResponse("Not found", { status: 404 });
  const data = await getFile(d.storage_key);
  await audit(user, "download", "document", id, undefined, { doc_type: d.doc_type });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": d.mime ?? "application/octet-stream",
      "content-disposition": `inline; filename="${d.filename.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
