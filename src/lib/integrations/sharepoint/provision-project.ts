import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema/projects";
import { customers } from "@/lib/db/schema/crm";
import { graphConfigured } from "../graph/client";
import { provisionProjectFolders } from "./folders";
import { recordEvent } from "@/lib/data/pg/workflow";

/**
 * Create a project's SharePoint folder tree and record where it landed.
 *
 * Deliberately **never throws**. Folder provisioning is a side effect of
 * creating a project, not a condition of it — Graph being slow, throttled or
 * briefly down must not stop someone raising a job. Failures are written to the
 * project timeline so they are visible and can be retried, rather than
 * disappearing or taking the whole request with them.
 *
 * Idempotent, because retrying is the normal case: `ensureFolder` treats an
 * existing folder as success, so a second run returns the same driveItemId
 * rather than creating "Project (1)".
 */
export async function provisionProjectSharePoint(orgId: string, projectId: string): Promise<void> {
  if (!graphConfigured()) return;

  const [row] = await db()
    .select({
      id: projects.id,
      projectNumber: projects.projectNumber,
      title: projects.title,
      customerName: customers.name,
      existing: projects.sharepointFolderItemId,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)))
    .limit(1);

  if (!row || row.existing) return;

  try {
    const result = await provisionProjectFolders({
      customerName: row.customerName,
      projectNumber: row.projectNumber,
      projectName: row.title,
    });

    await db()
      .update(projects)
      .set({
        sharepointDriveId: result.driveId,
        sharepointFolderItemId: result.project.id,
        sharepointFolderUrl: result.project.webUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));

    await recordEvent({
      orgId,
      projectId,
      type: "sharepoint.folder_created",
      summary: `SharePoint folder created: ${result.project.name}`,
      payload: { webUrl: result.project.webUrl, driveItemId: result.project.id },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordEvent({
      orgId,
      projectId,
      type: "sharepoint.folder_failed",
      summary: `SharePoint folder could not be created: ${message}`,
      payload: { error: message },
    });
  }
}
