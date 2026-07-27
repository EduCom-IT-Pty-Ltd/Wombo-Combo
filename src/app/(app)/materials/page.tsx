import { getSession } from "@/lib/auth/session";
import { listCatalogueMaterials, listCustomerPriceLists } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui";
import { MaterialsManager } from "@/components/materials/materials-manager";

export const metadata = { title: "Materials" };
export default async function MaterialsPage() { const session = await getSession(); const [materials, priceLists] = await Promise.all([listCatalogueMaterials(session.org.id), listCustomerPriceLists(session.org.id)]); return <div className="space-y-4"><PageHeader title="Materials" description="Catalogue, standard pricing and customer-specific price lists." /><MaterialsManager materials={materials} priceLists={priceLists} /></div>; }
