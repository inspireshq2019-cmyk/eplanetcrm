import { z } from "zod";
import { canSeeBranch, requirePermission } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { open } from "@/lib/secret-box";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { connectPages } from "../actions";

export const metadata = { title: "Choose Facebook pages" };

export default async function ChoosePages({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const u = await requirePermission("leads.connect");
  const { s: sid } = await searchParams;
  const s = sid && z.uuid().safeParse(sid).success
    ? await q1<{ id: string; branch_id: number; branch: string; pages_enc: string }>(
        "select m.id, m.branch_id, b.name branch, m.pages_enc from meta_connect_sessions m join branches b on b.id=m.branch_id where m.id=$1 and m.user_id=$2 and m.expires_at > now()", [sid, u.id])
    : null;
  if (!s || !canSeeBranch(u, s.branch_id))
    return (<><PageHeader back={{ href: "/settings/leads", label: "Ad lead sources" }} title="Choose Facebook pages" /><Notice tone="warn">This Facebook sign-in has expired. Go back and press Connect pages again.</Notice></>);
  const pages = (JSON.parse(open(s.pages_enc)) as { id: string; name: string }[]);
  const used = await q<{ external_id: string; branch_id: number; branch: string }>(
    "select ls.external_id, ls.branch_id, b.name branch from lead_sources ls join branches b on b.id=ls.branch_id where ls.kind='facebook' and ls.active and ls.external_id = any($1)", [pages.map((p) => p.id)]);
  return (
    <>
      <PageHeader back={{ href: `/settings/leads?branch=${s.branch_id}`, label: "Ad lead sources" }} title="Choose Facebook pages" subtitle={`Leads from the pages you tick will go to ${s.branch}.`} />
      <Card>
        <ActionForm action={connectPages} className="grid gap-4">
          <input type="hidden" name="s" value={s.id} />
          <ul className="grid gap-2">{pages.map((p) => {
            const u2 = used.find((x) => x.external_id === p.id);
            const here = u2?.branch_id === s.branch_id, elsewhere = u2 && !here;
            return (
              <li key={p.id}><label className={`flex items-center gap-3 rounded-xl border border-line p-3 ${elsewhere ? "opacity-60" : ""}`}>
                <input type="checkbox" name="page" value={p.id} disabled={!!elsewhere} defaultChecked={here} />
                <span className="min-w-0"><span className="font-semibold">{p.name}</span>
                  {here && <span className="block text-xs text-slate">Already connected to this branch. Ticking it reconnects it.</span>}
                  {elsewhere && <span className="block text-xs text-slate">Connected to {u2!.branch}. Disconnect it there first.</span>}</span>
              </label></li>);
          })}</ul>
          <p className="text-sm text-slate">The CRM keeps an access key for each page you tick, stored encrypted, and uses it only to read that page&apos;s lead form answers.</p>
          <div><Submit pending="Connecting…">Connect ticked pages</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
