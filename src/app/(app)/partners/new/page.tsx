import { requirePermission } from "@/lib/auth";
import { q } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { PartnerForm } from "../partner-form";

export const metadata = { title: "Add institution" };

export default async function NewPartner() {
  await requirePermission("partners.edit");
  const countries = await q<{ code: string; name: string }>("select code, name from countries order by name");
  return (
    <>
      <PageHeader back={{ href: "/partners", label: "Partners & courses" }} title="Add institution" />
      <Card><PartnerForm countries={countries} /></Card>
    </>
  );
}
