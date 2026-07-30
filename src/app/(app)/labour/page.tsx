import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getLabourSettings, listCatalogueMaterials } from "@/lib/data/repository";
import { LabourManager } from "@/components/labour/labour-manager";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Labour" };

export default async function LabourPage() {
  const session = await getSession();
  if (!can(session.role, "labour.manage", session.permissionOverrides)) notFound();
  const [settings, materials] = await Promise.all([getLabourSettings(session.org.id), listCatalogueMaterials(session.org.id)]);
  return <div className="space-y-4"><PageHeader title="Labour" description="Standard job labour budgets and subcontractor material rates." /><LabourManager settings={settings} materials={materials} /></div>;
}
