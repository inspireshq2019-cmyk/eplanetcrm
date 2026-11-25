import { demoOn } from "@/lib/demo";
import { Sidebar, type NavItem } from "@/components/nav";
import { can, requireUser, scopeWhere } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { agentMayOpen } from "@/lib/agent";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.scope === "agent") {
    // Sub-agents only get their students and applications; any other address goes to their home page.
    const path = (await headers()).get("x-eplanet-path") ?? "/";
    if (!agentMayOpen(path)) redirect("/");
    const unread = await q1<{ n: number }>(
      `select count(distinct m.application_id)::int n from application_messages m join applications a on a.id=m.application_id join contacts c on c.id=a.contact_id
        left join application_reads r on r.application_id=m.application_id and r.user_id=$2
        where c.sub_agent_id=$1 and not m.internal and m.author_id is distinct from $2 and m.created_at > coalesce(r.last_read_at, 'epoch')`, [user.subAgentId, user.id]);
    const agentItems: NavItem[] = [
      { href: "/", label: "Home", icon: "home" },
      { href: "/contacts", label: "My students", icon: "people" },
      { href: "/applications", label: "Applications", icon: "flow", badge: unread?.n || undefined },
    ];
    return (
      <div className="min-h-dvh">
        <Sidebar items={agentItems} user={{ name: user.name, role: "Sub-agent", branch: user.primaryBranchName }} signOut={signOut} />
        <div className="lg:pl-60">
          <main className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
            {children}
          </main>
        </div>
      </div>
    );
  }

  const params: unknown[] = [];
  const where = scopeWhere(user, "c", params);
  const counts = await q1<{ waiting: number; tasks: number }>(
    `select (select count(*) from checkins c where ${where} and c.status='waiting' and c.arrived_at::date = current_date) waiting,
            (select count(*) from tasks t where t.assignee_id=$${params.length + 1} and t.status='open' and t.due_at < now()) tasks`,
    [...params, user.id]);

  const admissionsWaiting = can(user, "admissions.manage")
    ? (await q1<{ n: number }>("select count(*)::int n from applications where adm_status='submitted'"))?.n ?? 0 : 0;

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "home" },
    ...(can(user, "checkin.manage") ? [{ href: "/checkin", label: "Office check-in", icon: "door", badge: counts?.waiting || undefined }] : []),
    ...(can(user, "contacts.view") ? [{ href: "/contacts", label: "Students & leads", icon: "people" }] : []),
    ...(can(user, "contacts.view") ? [{ href: "/applications", label: "Applications", icon: "flow" }] : []),
    ...(can(user, "admissions.manage") ? [{ href: "/admissions", label: "Admissions queue", icon: "inbox", badge: admissionsWaiting || undefined }] : []),
    ...(can(user, "visa.view") ? [{ href: "/visa", label: "Visa cases", icon: "stamp" }] : []),
    ...(can(user, "classes.manage") ? [{ href: "/classes", label: "IELTS & PTE classes", icon: "book" }] : []),
    ...(can(user, "oshc.manage") ? [{ href: "/oshc", label: "OSHC", icon: "shield" }] : []),
    ...(can(user, "forms.manage") ? [{ href: "/forms", label: "Event forms", icon: "qr" }] : []),
    { href: "/tasks", label: "Tasks", icon: "check", badge: counts?.tasks || undefined },
    ...(can(user, "finance.view") ? [{ href: "/finance", label: "Invoices & receipts", icon: "money" }] : []),
    { href: "/partners", label: "Partners & courses", icon: "building" },
    ...(can(user, "reports.view") ? [{ href: "/reports", label: "Reports", icon: "chart" }] : []),
    ...(can(user, "settings.users") || can(user, "settings.system") || can(user, "import.run") || can(user, "audit.view") || can(user, "leads.connect") || can(user, "subagents.manage") ? [{ href: "/settings", label: "Settings", icon: "cog" }] : []),
  ];

  return (
    <div className="min-h-dvh">
      <Sidebar items={items} user={{ name: user.name, role: user.roleName, branch: user.primaryBranchName }} signOut={signOut} />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
          {demoOn() && (
            <p role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              <b>Test mode.</b> Anyone with the test code can sign in as any staff member. Use made-up students only, and switch test mode off (remove DEMO_LOGIN) before real student data goes in.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
