import "server-only";
import { graphFetch, siteId } from "../graph/client";

/**
 * Project folder provisioning in SharePoint.
 *
 * The identity of a folder is its `driveItemId`, never its path. Paths are
 * labels: the moment someone renames a customer or drags a folder in the
 * SharePoint UI, a path-keyed record points at nothing. `driveItemId` survives
 * both, so it is what gets stored against the project.
 */

export interface DriveItemRef {
  id: string;
  name: string;
  webUrl: string;
}

/**
 * Numbered so SharePoint's alphabetical sort matches the order work actually
 * happens in. Without the prefixes "Quote" sorts after "Handover", which reads
 * as backwards to anyone opening the folder.
 */
export const PROJECT_SUBFOLDERS = [
  "01 Quote",
  "02 Drawings",
  "03 Site Photos",
  "04 QA",
  "05 Variations",
  "06 Handover",
] as const;

/** Characters SharePoint rejects in an item name, plus leading/trailing dots. */
export function sanitiseSegment(name: string): string {
  return name
    .replace(/["*:<>?/\\|#%]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 120);
}

/** The default document library. Its id is stable, so callers cache it. */
export async function getDefaultDriveId(): Promise<string> {
  const drive = await graphFetch<{ id: string }>(`/sites/${siteId()}/drive`);
  return drive.id;
}

/**
 * Create one folder under `parentId`, or return the existing one.
 *
 * `conflictBehavior: "fail"` then treating 409 as success is deliberate, rather
 * than "replace" — replace would discard a folder that already has files in it.
 * This makes provisioning idempotent, which matters because it will be retried
 * after a throttle or a half-finished run.
 */
export async function ensureFolder(
  driveId: string,
  parentId: string,
  name: string,
): Promise<DriveItemRef> {
  try {
    return await graphFetch<DriveItemRef>(`/drives/${driveId}/items/${parentId}/children`, {
      method: "POST",
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 409) throw error;

    // Already there. Look it up by path relative to the parent rather than
    // listing every child, which would paginate on a large library.
    return await graphFetch<DriveItemRef>(
      `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(name)}`,
    );
  }
}

/**
 * Build `{root}/{customer}/{projectNumber} - {projectName}/` and its subfolders.
 *
 * Returns the project folder itself; that id is what belongs on the project
 * record. Folders are created level by level because each one needs its parent's
 * id — Graph has no atomic "create this tree" call, so a failure part-way leaves
 * a partial tree. That is safe to re-run: every step is idempotent.
 */
export async function provisionProjectFolders(input: {
  customerName: string;
  projectNumber: string;
  projectName: string;
  driveId?: string;
  rootFolder?: string;
}): Promise<{ driveId: string; project: DriveItemRef; subfolders: DriveItemRef[] }> {
  const driveId = input.driveId ?? (await getDefaultDriveId());
  const rootName = sanitiseSegment(input.rootFolder ?? process.env.SHAREPOINT_ROOT_FOLDER ?? "Projects");

  const root = await graphFetch<DriveItemRef>(`/drives/${driveId}/root`);
  const projectsRoot = await ensureFolder(driveId, root.id, rootName);
  const customer = await ensureFolder(driveId, projectsRoot.id, sanitiseSegment(input.customerName));
  const project = await ensureFolder(
    driveId,
    customer.id,
    sanitiseSegment(`${input.projectNumber} - ${input.projectName}`),
  );

  // Sequential, not Promise.all: six concurrent writes to the same parent is a
  // reliable way to collect 429s, and the whole tree is six calls regardless.
  const subfolders: DriveItemRef[] = [];
  for (const name of PROJECT_SUBFOLDERS) {
    subfolders.push(await ensureFolder(driveId, project.id, name));
  }

  return { driveId, project, subfolders };
}

/** Used by the connectivity check to clean up after itself. */
export async function deleteItem(driveId: string, itemId: string): Promise<void> {
  await graphFetch(`/drives/${driveId}/items/${itemId}`, { method: "DELETE" });
}
