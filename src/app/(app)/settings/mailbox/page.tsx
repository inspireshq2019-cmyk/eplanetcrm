import { requirePermission } from "@/lib/auth";
import { getMailbox } from "@/lib/mailbox";
import { dateTime } from "@/lib/format";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { disconnect, sendTest } from "./actions";

export const metadata = { title: "Admissions mailbox" };

const ERR: Record<string, string> = {
  google_not_configured: "Google sign-in keys aren't set up on the hosting yet, so the mailbox can't be connected.",
  state: "That took too long or came from another window. Please try again.",
  cancelled: "Connecting was cancelled. Nothing changed.",
  denied: "Only owners can connect the mailbox.",
};

export default async function MailboxSettings({ searchParams }: { searchParams: Promise<{ error?: string; detail?: string; connected?: string }> }) {
  await requirePermission("settings.system");
  const sp = await searchParams;
  const box = await getMailbox();
  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Admissions mailbox" subtitle="The shared mailbox the CRM sends application packs and sub-agent sign-in codes from." />
      <div className="grid max-w-3xl gap-4">
        {sp.connected && <Notice tone="ok">Mailbox connected.</Notice>}
        {sp.error && <Notice tone="red">{sp.error === "failed" ? sp.detail ?? "Couldn't connect." : ERR[sp.error] ?? "Couldn't connect."}</Notice>}
        <Card title={box ? `Connected: ${box.email}` : "Not connected"}>
          {box ? (
            <div className="grid gap-4">
              <p className="text-sm text-slate">Connected {dateTime(box.connected_at, "Asia/Dhaka")}{box.connected_by ? ` by ${box.connected_by}` : ""}. The CRM can send email from this mailbox but can&apos;t read it.</p>
              <ActionForm action={sendTest} className="flex flex-wrap gap-2"><Submit className="btn">Send me a test email</Submit></ActionForm>
              <form action={disconnect}><ConfirmButton confirmLabel="Click again to disconnect">Disconnect</ConfirmButton></form>
            </div>
          ) : (
            <div className="grid gap-4 text-sm">
              <p>Connect the shared admissions mailbox (for example admissions@eplanetintl.com). You&apos;ll sign in to Google <b>as that mailbox</b> and allow the CRM to send email. Until it&apos;s connected, application packs can&apos;t be emailed and sub-agents can&apos;t sign in.</p>
              <p className="text-slate">Before connecting: in Google Cloud, turn on the Gmail API for the Eplanet CRM project and add <code className="rounded bg-sky px-1">/api/mailbox/callback</code> on the CRM&apos;s address as a redirect address. The setup guide has the steps.</p>
              <div><a className="btn btn-primary" href="/api/mailbox/connect">Connect the mailbox</a></div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
