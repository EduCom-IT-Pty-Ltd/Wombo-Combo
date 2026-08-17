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
  /** A small editable floor-plan sketch that belongs to this scope only. */
  sketch: RetroScopeSketch | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface RetroScopePoint { x: number; y: number; }
export interface RetroScopeStroke { id: string; points: RetroScopePoint[]; }
export interface RetroScopeMeasurement { id: string; start: RetroScopePoint; end: RetroScopePoint; label: string; }
export interface RetroScopeLabel { id: string; point: RetroScopePoint; text: string; }
export interface RetroScopeSketch {
  strokes: RetroScopeStroke[];
  measurements: RetroScopeMeasurement[];
  labels: RetroScopeLabel[];
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
const coordinate = (value: unknown, maximum: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : 0;
const point = (value: unknown): RetroScopePoint | null => {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<RetroScopePoint>;
  if (typeof input.x !== "number" || typeof input.y !== "number") return null;
  return { x: coordinate(input.x, 1000), y: coordinate(input.y, 700) };
};
const identifier = (value: unknown, fallback: string) => typeof value === "string" && value.length <= 120 ? value : fallback;

/** Keeps the JSON record compact and safe to render in the mobile sketcher/PDF. */
export function normaliseRetroScopeSketch(value: unknown): RetroScopeSketch | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<RetroScopeSketch>;
  const strokes = Array.isArray(input.strokes) ? input.strokes.slice(0, 120).flatMap((stroke, index) => {
    if (!stroke || typeof stroke !== "object") return [];
    const item = stroke as Partial<RetroScopeStroke>;
    const points = Array.isArray(item.points) ? item.points.slice(0, 600).map(point).filter((item): item is RetroScopePoint => item !== null) : [];
    return points.length > 1 ? [{ id: identifier(item.id, `stroke-${index}`), points }] : [];
  }) : [];
  const measurements = Array.isArray(input.measurements) ? input.measurements.slice(0, 120).flatMap((measurement, index) => {
    if (!measurement || typeof measurement !== "object") return [];
    const item = measurement as Partial<RetroScopeMeasurement>;
    const start = point(item.start); const end = point(item.end); const label = text(item.label).trim().slice(0, 100);
    return start && end && label ? [{ id: identifier(item.id, `measurement-${index}`), start, end, label }] : [];
  }) : [];
  const labels = Array.isArray(input.labels) ? input.labels.slice(0, 120).flatMap((label, index) => {
    if (!label || typeof label !== "object") return [];
    const item = label as Partial<RetroScopeLabel>;
    const at = point(item.point); const labelText = text(item.text).trim().slice(0, 100);
    return at && labelText ? [{ id: identifier(item.id, `label-${index}`), point: at, text: labelText }] : [];
  }) : [];
  return strokes.length || measurements.length || labels.length ? { strokes, measurements, labels } : null;
}

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
