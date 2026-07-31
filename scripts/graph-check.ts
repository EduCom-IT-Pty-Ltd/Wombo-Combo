/**
 * End-to-end connectivity check for the SharePoint integration.
 *
 *   npx tsx scripts/graph-check.ts
 *
 * Proves the whole chain in one run: client-credentials token, the
 * `Sites.Selected` grant, the default document library, folder creation, and
 * idempotency. Creates a folder tree under a clearly-labelled test customer and
 * removes it again, so it can be run repeatedly without leaving debris.
 *
 * Pass --keep to leave the tree in place and look at it in SharePoint.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const keep = process.argv.includes("--keep");

  const { graphConfigured, siteId, GraphError } = await import("../src/lib/integrations/graph/client");
  const { getDefaultDriveId, provisionProjectFolders, deleteItem, PROJECT_SUBFOLDERS } = await import(
    "../src/lib/integrations/sharepoint/folders"
  );

  if (!graphConfigured()) {
    console.error("Not configured. These must be set in .env.local:");
    for (const key of ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "SHAREPOINT_SITE_ID"]) {
      console.error(`  ${process.env[key] ? "OK     " : "MISSING"}  ${key}`);
    }
    process.exit(1);
  }

  try {
    console.log("1. Token + site access");
    const { graphFetch } = await import("../src/lib/integrations/graph/client");
    const site = await graphFetch<{ displayName: string; webUrl: string }>(`/sites/${siteId()}`);
    console.log(`   ${site.displayName} — ${site.webUrl}`);

    console.log("2. Default document library");
    const driveId = await getDefaultDriveId();
    console.log(`   driveId ${driveId}`);

    console.log("3. Creating folder tree");
    const result = await provisionProjectFolders({
      customerName: "ZZ Connectivity Test",
      projectNumber: "TEST-0001",
      projectName: "Delete me",
      driveId,
    });
    console.log(`   ${result.project.webUrl}`);
    for (const folder of result.subfolders) console.log(`     ${folder.name}`);

    if (result.subfolders.length !== PROJECT_SUBFOLDERS.length) {
      throw new Error(`Expected ${PROJECT_SUBFOLDERS.length} subfolders, got ${result.subfolders.length}`);
    }

    console.log("4. Re-running to confirm it is idempotent");
    const again = await provisionProjectFolders({
      customerName: "ZZ Connectivity Test",
      projectNumber: "TEST-0001",
      projectName: "Delete me",
      driveId,
    });
    if (again.project.id !== result.project.id) {
      throw new Error("Second run created a different folder — provisioning is not idempotent");
    }
    console.log("   same driveItemId, no duplicates");

    if (keep) {
      console.log(`\nLeft in place (--keep): ${result.project.webUrl}`);
    } else {
      console.log("5. Cleaning up");
      // Removing the customer folder takes the project tree with it.
      const customerFolder = await graphFetch<{ id: string }>(
        `/drives/${driveId}/root:/${encodeURIComponent(process.env.SHAREPOINT_ROOT_FOLDER ?? "Projects")}/${encodeURIComponent("ZZ Connectivity Test")}`,
      );
      await deleteItem(driveId, customerFolder.id);
      console.log("   removed");
    }

    console.log("\nAll checks passed.");
  } catch (error) {
    if (error instanceof GraphError) {
      console.error(`\nFAILED (HTTP ${error.status}${error.graphCode ? `, ${error.graphCode}` : ""})`);
      console.error(error.message);
      if (error.status === 401) console.error("\n-> Token rejected. Check tenant id, client id and secret.");
      if (error.status === 403) {
        console.error("\n-> Authenticated but not authorised. The Sites.Selected grant for this app");
        console.error("   on this site is missing or was made against a different site.");
      }
      if (error.status === 404) console.error("\n-> Site or drive not found. Check SHAREPOINT_SITE_ID.");
    } else {
      console.error("\nFAILED");
      console.error(error);
    }
    process.exit(1);
  }
}

void main();
