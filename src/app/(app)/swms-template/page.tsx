import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { getSwmsTemplate } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui";
import { SwmsTemplateManager } from "@/components/swms/swms-template-manager";

export const metadata = { title: "SWMS template" };

export default async function SwmsTemplatePage() {
  const session = await getSession();
  if (!can(session.role, "admin.manage", session.permissionOverrides)) notFound();
  const template = await getSwmsTemplate(session.org.id);
  return <div className="space-y-4"><PageHeader title="SWMS template" description="Configure the Safe Work Method Statement used on every project." /><SwmsTemplateManager template={template} /></div>;
}
