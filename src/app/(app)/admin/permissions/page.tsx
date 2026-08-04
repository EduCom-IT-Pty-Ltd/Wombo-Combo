import { getRolePermissions } from "@/lib/data/repository";
import { RolePermissionsManager } from "@/components/admin/role-permissions-manager";
import { requireSettingsAccess } from "../guard";

export const metadata = { title: "Roles & access · Settings" };

export default async function PermissionsSettingsPage() {
  const session = await requireSettingsAccess();
  const overrides = await getRolePermissions(session.org.id);
  return <RolePermissionsManager overrides={overrides} />;
}
