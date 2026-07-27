import { getSession } from "@/lib/auth/session";
import { listCatalogueMaterials, listProductionTemplates } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui";
import { ProductionTemplateManager } from "@/components/production/production-template-manager";

export const metadata = { title: "Production templates" };

export default async function ProductionTemplatesPage() {
  const session = await getSession();
  const [materials, templates] = await Promise.all([
    listCatalogueMaterials(session.org.id),
    listProductionTemplates(session.org.id),
  ]);
  return <div className="space-y-4"><PageHeader title="Production templates" description="Reusable production models that add the right materials to a project quote." /><ProductionTemplateManager materials={materials} templates={templates} /></div>;
}
