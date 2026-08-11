/**
 * Fixed capture form for retrofit assessment scopes. Unlike SWMS, this is not
 * an organisation-configurable template: the questions mirror the estimator's
 * established paper sheet and remain consistent across all retrofit jobs.
 */
export type ProjectType = "build" | "retro";

export interface RetroScopeValues {
  customerName: string;
  phone: string;
  email: string;
  address: string;
  spaces: string[];
  existingInsulation: string;
  spaceCondition: string;
  studSpacing: string;
  roofType: string;
  accessPoint: string;
  garageArea: string;
  houseArea: string;
  newInsulationRating: string;
  removalType: string;
  notes: string;
  assessedBy: string;
  assessedOn: string;
}

export interface RetroScopeRecord {
  values: RetroScopeValues;
  photoDocumentIds: string[];
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export function emptyRetroScopeValues(defaults: Partial<Pick<RetroScopeValues, "customerName" | "phone" | "email" | "address" | "assessedBy">> = {}): RetroScopeValues {
  return {
    customerName: defaults.customerName ?? "",
    phone: defaults.phone ?? "",
    email: defaults.email ?? "",
    address: defaults.address ?? "",
    spaces: [],
    existingInsulation: "",
    spaceCondition: "",
    studSpacing: "",
    roofType: "",
    accessPoint: "",
    garageArea: "",
    houseArea: "",
    newInsulationRating: "",
    removalType: "",
    notes: "",
    assessedBy: defaults.assessedBy ?? "",
    assessedOn: "",
  };
}

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

export function normaliseRetroScopeValues(value: unknown, defaults: Partial<Pick<RetroScopeValues, "customerName" | "phone" | "email" | "address" | "assessedBy">> = {}): RetroScopeValues {
  const fallback = emptyRetroScopeValues(defaults);
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<RetroScopeValues>;
  return {
    customerName: text(input.customerName, fallback.customerName),
    phone: text(input.phone, fallback.phone),
    email: text(input.email, fallback.email),
    address: text(input.address, fallback.address),
    spaces: Array.isArray(input.spaces) ? input.spaces.filter((item): item is string => typeof item === "string").slice(0, 8) : [],
    existingInsulation: text(input.existingInsulation),
    spaceCondition: text(input.spaceCondition),
    studSpacing: text(input.studSpacing),
    roofType: text(input.roofType),
    accessPoint: text(input.accessPoint),
    garageArea: text(input.garageArea),
    houseArea: text(input.houseArea),
    newInsulationRating: text(input.newInsulationRating),
    removalType: text(input.removalType),
    notes: text(input.notes),
    assessedBy: text(input.assessedBy, fallback.assessedBy),
    assessedOn: text(input.assessedOn),
  };
}
