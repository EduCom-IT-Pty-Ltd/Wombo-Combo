"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";

/**
 * Retry folder provisioning for a project whose first attempt failed.
 *
 * Provisioning is deliberately non-fatal at creation time, so a Graph outage
 * leaves a project with no folder and an explanatory timeline entry. This is how
 * that gets put right without recreating the project.
 */
export async function retrySharePointFolder(projectId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireCapability("project.edit");
  if (!hasDatabase) return { ok: false, message: "Not available without a database." };

  const { graphConfigured } = await import("@/lib/integrations/graph/client");
  if (!graphConfigured()) return { ok: false, message: "SharePoint is not configured on this deployment." };

  const { provisionProjectSharePoint } = await import("@/lib/integrations/sharepoint/provision-project");
  await provisionProjectSharePoint(session.org.id, projectId);

  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db()
    .select({ url: projects.sharepointFolderUrl })
    .from(projects)
    .where(and(eq(projects.orgId, session.org.id), eq(projects.id, projectId)))
    .limit(1);

  revalidatePath(`/projects/${projectId}`, "layout");
  return row?.url
    ? { ok: true, message: "SharePoint folder created." }
    : { ok: false, message: "Still could not create the folder — see the project activity for the reason." };
}

/** The project's folder link, for the documents tab. */
export async function getSharePointFolder(projectId: string): Promise<{ url: string | null }> {
  const session = await requireCapability("project.view");
  if (!hasDatabase) return { url: null };
  const { db } = await import("@/lib/db");
  const { projects } = await import("@/lib/db/schema/projects");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db()
    .select({ url: projects.sharepointFolderUrl })
    .from(projects)
    .where(and(eq(projects.orgId, session.org.id), eq(projects.id, projectId)))
    .limit(1);
  return { url: row?.url ?? null };
}
