import { NextResponse } from "next/server";
import { can, canSeeBranch, getCurrentUser } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { publicBase, qrSvg } from "@/lib/qr";

// Downloads a form's QR code as an SVG file, for banners, flyers and social posts.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  const { id } = await params;
  if (!u || !can(u, "forms.manage") || !/^\d{1,9}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const f = await q1<{ slug: string; branch_id: number }>("select slug, branch_id from lead_forms where id=$1", [Number(id)]);
  if (!f || !canSeeBranch(u, f.branch_id)) return new NextResponse("Not found", { status: 404 });
  const svg = await qrSvg(`${await publicBase()}/f/${f.slug}`);
  return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "content-disposition": `attachment; filename="eplanet-form-${f.slug}-qr.svg"`, "cache-control": "no-store" } });
}
