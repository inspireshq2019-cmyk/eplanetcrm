import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const u = await requireUser();
  const items = [
    can(u, "settings.users") && { href: "/settings/staff", title: "Staff", body: "Add staff with their @eplanetintl.com Google accounts, set roles and branches, and record migration agents' MARNs." },
    (can(u, "settings.users") || can(u, "settings.system")) && { href: "/settings/branches", title: "Branches", body: "Branch addresses, phone numbers and time zones that appear on invoices and receipts." },
    can(u, "settings.system") && { href: "/settings/roles", title: "Roles and permissions", body: "What each role can see and do." },
    can(u, "settings.system") && { href: "/settings/workflows", title: "Application workflows", body: "The steps an application goes through for each destination." },
    can(u, "leads.connect") && { href: "/settings/leads", title: "Ad lead sources", body: "Connect the branch's Facebook pages and Google Ads lead forms, so ad leads arrive in the CRM automatically." },
    can(u, "subagents.manage") && { href: "/settings/sub-agents", title: "Sub-agents", body: "Outside agencies, their home branch and their logins. Each agency sees only its own students." },
    can(u, "settings.system") && { href: "/settings/mailbox", title: "Admissions mailbox", body: "The shared mailbox the CRM sends application packs and sub-agent sign-in codes from." },
    can(u, "import.run") && { href: "/settings/import", title: "Import from Agentcis", body: "Bring students and leads across from a CSV export." },
    can(u, "audit.view") && { href: "/settings/audit", title: "Audit log", body: "Who viewed, changed, exported or deleted what, and when." },
  ].filter(Boolean) as { href: string; title: string; body: string }[];
  if (!items.length) redirect("/?denied=settings");
  const pending = can(u, "settings.users") ? (await q1<{ n: number }>("select count(*) n from users where email like '%.invalid' and active"))?.n ?? 0 : 0;
  return (
    <>
      <PageHeader title="Settings" />
      {pending > 0 && <p className="mb-4 rounded-lg border border-warn bg-warn-tint px-4 py-3 text-sm">{pending} staff {pending === 1 ? "member has" : "members have"} no real email yet and can&apos;t sign in. <Link className="font-semibold text-navy" href="/settings/staff?pending=1">Add their emails</Link></p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="card block p-5 no-underline transition-shadow hover:shadow-md">
            <p className="font-display font-semibold text-navy">{i.title}</p>
            <p className="mt-1 text-sm text-slate">{i.body}</p>
          </Link>))}
      </div>
    </>
  );
}
