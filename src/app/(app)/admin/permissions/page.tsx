import { readRolePermissions } from "@/lib/data/local-store";
import { RolePermissionsManager } from "@/components/admin/role-permissions-manager";

export const metadata = { title: "Roles & access · Settings" };

export default async function PermissionsSettingsPage() {
  const overrides = await readRolePermissions();
  return <RolePermissionsManager overrides={overrides} />;
}
