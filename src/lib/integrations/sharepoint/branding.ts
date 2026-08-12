import "server-only";
import { randomUUID } from "node:crypto";
import { validateImageAsset } from "@/lib/data/assets";
import { graphFetch } from "../graph/client";
import { getDefaultDriveId, type DriveItemRef } from "./folders";
import { safeFileName } from "./upload";

export interface OrganisationLogoLocation {
  driveId: string;
  itemId: string;
}

/**
 * Store branding beside the Projects folder, at the root of the existing
 * SharePoint document library. Project folders are deliberately untouched.
 */
export async function uploadOrganisationLogo(file: File): Promise<OrganisationLogoLocation> {
  return uploadOrganisationBrandingImage(file, "Organisation-logo");
}

/** Store the certificate letterhead beside the organisation logo, not in a job folder. */
export async function uploadOrganisationCertificateHeader(file: File): Promise<OrganisationLogoLocation> {
  return uploadOrganisationBrandingImage(file, "Certificate-header");
}

async function uploadOrganisationBrandingImage(file: File, prefix: string): Promise<OrganisationLogoLocation> {
  const validationError = validateImageAsset(file);
  if (validationError) throw new Error(validationError);

  const driveId = await getDefaultDriveId();
  const root = await graphFetch<DriveItemRef>(`/drives/${driveId}/root`);
  const fileName = safeFileName(`${prefix}-${randomUUID()}-${file.name}`);
  const item = await graphFetch<DriveItemRef>(
    `/drives/${driveId}/items/${root.id}:/${encodeURIComponent(fileName)}:/content?@microsoft.graph.conflictBehavior=rename`,
    {
      method: "PUT",
      headers: { "content-type": file.type },
      body: await file.arrayBuffer(),
    },
  );
  return { driveId, itemId: item.id };
}
