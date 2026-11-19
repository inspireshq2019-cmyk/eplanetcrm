import { Sidebar, type NavItem } from "@/components/nav";
import { can, requireUser, scopeWhere } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const params: unknown[] = [];
  const where = scopeWhere(user, "c", params);
  const counts = await q1<{ waiting: number; tasks: number }>(
    `select (select count(*) from checkins c where ${where} and c.status='waiting' and c.arrived_at::date = current_date) waiting,
            (select count(*) from tasks t where t.assignee_id=$${params.length + 1} and t.status='open' and t.due_at < now()) tasks`,
    [...params, user.id]);

  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "home" },
    ...(can(user, "checkin.manage") ? [{ href: "/checkin", label: "Office check-in", icon: "door", badge: counts?.waiting || undefined }] : []),
    ...(can(user, "contacts.view") ? [{ href: "/contacts", label: "Students & leads", icon: "people" }] : []),
    ...(can(user, "contacts.view") ? [{ href: "/applications", label: "Applications", icon: "flow" }] : []),
    ...(can(user, "visa.view") ? [{ href: "/visa", label: "Visa cases", icon: "stamp" }] : []),
    ...(can(user, "classes.manage") ? [{ href: "/classes", label: "IELTS & PTE classes", icon: "book" }] : []),
    ...(can(user, "oshc.manage") ? [{ href: "/oshc", label: "OSHC", icon: "shield" }] : []),
    ...(can(user, "forms.manage") ? [{ href: "/forms", label: "Event forms", icon: "qr" }] : []),
    { href: "/tasks", label: "Tasks", icon: "check", badge: counts?.tasks || undefined },
    ...(can(user, "finance.view") ? [{ href: "/finance", label: "Invoices & receipts", icon: "money" }] : []),
    { href: "/partners", label: "Partners & courses", icon: "building" },
    ...(can(user, "reports.view") ? [{ href: "/reports", label: "Reports", icon: "chart" }] : []),
    ...(can(user, "settings.users") || can(user, "settings.system") || can(user, "import.run") || can(user, "audit.view") || can(user, "leads.connect") ? [{ href: "/settings", label: "Settings", icon: "cog" }] : []),
  ];

  return (
    <div className="min-h-dvh">
      <Sidebar items={items} user={{ name: user.name, role: user.roleName, branch: user.primaryBranchName }} signOut={signOut} />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
