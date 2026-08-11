/**
 * The organisation's Safe Work Method Statement configuration and each
 * project's captured values. These are deliberately plain data structures:
 * the database persists them as JSON, while the UI and future PDF renderer use
 * the same shape. Keeping this file pure means a revised paper form does not
 * require a database migration.
 */

export type SwmsChoice = { id: string; label: string };

export type SwmsHazard = {
  id: string;
  task: string;
  hazard: string;
  controls: string;
};

export interface SwmsTemplate {
  name: string;
  versionLabel: string;
  mandatoryNotice: string;
  quickReference: string[];
  scopeItems: SwmsChoice[];
  siteReportItems: SwmsChoice[];
  hazards: SwmsHazard[];
  photoChecklist: SwmsChoice[];
}

export interface SwmsValues {
  salesOrder: string;
  preparedAt: string;
  builder: string;
  siteAddress: string;
  suburb: string;
  principal: string;
  leadInstaller: string;
  scope: Record<string, boolean>;
  repairNotes: string;
  siteReport: Record<string, boolean>;
  otherSiteReport: string;
  powerIsolated: boolean;
  powerRestored: boolean;
  hazards: Record<string, { present: boolean; controlled: boolean }>;
  hazardNotes: string;
  studWidths: {
    gfWalls: string;
    ffWalls: string;
    ceilingSpacing: string;
    subFloor: string;
    midFloor: string;
  };
  comments: string;
  installerNames: string[];
  jobStatus: string;
  timeOut: string;
  photoChecklist: Record<string, boolean>;
  photoNotes: string;
}

export interface SwmsRecord {
  templateName: string;
  templateVersion: string;
  values: SwmsValues;
  photoDocumentIds: string[];
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

const choice = (id: string, label: string): SwmsChoice => ({ id, label });

export const DEFAULT_SWMS_TEMPLATE: SwmsTemplate = {
  name: "Safe Work Method Statement",
  versionLabel: "V9.2",
  mandatoryNotice: "SWMS must be completed before starting work",
  quickReference: [
    "Check with other trades for site access",
    "Complete JSA / Site Report",
    "Check that material to be used is correct",
    "Check for builder specific requirements",
    "Install according to work method statements",
    "Report any changes or issues on site report",
    "Phone any issues through to the office",
    "Clean site and remove excess material",
    "Lock house",
    "Ensure all loads are secure upon departure",
  ],
  scopeItems: [
    choice("dampcourse", "Dampcourse"),
    choice("wrap-gf", "Wrap - GF"),
    choice("wrap-ff", "Wrap - FF"),
    choice("five-star", "5 Star Inspection"),
    choice("wall-insulation", "Wall Insulation"),
    choice("sub-mid-floor", "Sub/Mid Floor"),
    choice("polyester-infill", "Polyester Infill"),
    choice("ceiling-load", "Ceiling Load"),
    choice("ceiling-spread", "Ceiling Spread"),
    choice("fireseal", "Fireseal"),
  ],
  siteReportItems: [
    choice("muddy-site", "Muddy site"), choice("walk-around-clean", "Walk around clean"), choice("broken-windows", "Broken windows"),
    choice("staples-in-pipe", "Staples in pipe"), choice("elevated-footing", "Elevated footing"), choice("roof-on-fascia", "Roof on fascia"),
    choice("tile-stacks", "Tile stacks on roof"), choice("fall-protection", "Fall protection"), choice("plaster-deliveries", "Plaster deliveries"),
    choice("ceiling-loaded", "Ceiling loaded"), choice("carpet-tiles", "Carpet / tiles"), choice("marks-dirty", "Marks / dirty"),
    choice("plaster-damage", "Plaster damage"), choice("manhole-cover", "Manhole cover"), choice("electrical-rough-in", "Electrical rough in"),
    choice("plumbing-rough-in", "Plumbing rough in"), choice("fans-downlights", "Fans / downlights"), choice("duct-fit-off", "Duct fit off"),
    choice("displaced-tiles", "Displaced tiles"), choice("material-excess", "Material excess"), choice("two-metre-fall-zone", "2 metre fall zone"),
  ],
  hazards: [
    { id: "inspect-site", task: "Inspect site and plan job", hazard: "Gravitational - slips, trips and falls; sprains and strains", controls: "Take 2. Review the SWMS and JSA. Identify and control risks. Wear appropriate PPE before entering site." },
    { id: "unload-manual", task: "Unload materials and equipment", hazard: "Biomechanical - manual handling; sprains and strains", controls: "Do not over exert or reach. Use two-person lifting for heavy items and safe lifting techniques." },
    { id: "unload-traffic", task: "Unload materials and equipment", hazard: "Traffic - workers struck by vehicles while unloading", controls: "Unload from the kerb side. Set up traffic control when unloading from a roadside." },
    { id: "unload-thermal", task: "Unload materials and equipment", hazard: "Thermal - working outside, heat stress or UV exposure", controls: "Take regular breaks, drink water, wear PPE and sunscreen." },
    { id: "site-access", task: "Working in and around house", hazard: "Gravitational - slips, trips and falls", controls: "Take 2. Review SWMS and JSA. Keep work areas clean and remove obstructions." },
    { id: "load-ceiling", task: "Loading material into ceiling", hazard: "Gravitational - fall from ladder or scaffold", controls: "Use a suitable industrial ladder. Check it before use, secure it, maintain three points of contact and wear slip-resistant footwear." },
    { id: "load-manual", task: "Loading material into ceiling", hazard: "Biomechanical - manual handling", controls: "Have one installer in roof space and use another installer to pass material up. Use safe lifting techniques." },
    { id: "cutting", task: "Cutting packaging and insulation material", hazard: "Sharp object - cuts", controls: "Take 2. Cut away from body and others. Use a retractable blade, protect power tools and wear gloves." },
    { id: "install-fall", task: "Installing material", hazard: "Gravitational - fall from ladder", controls: "Use a suitable industrial ladder. Check, secure and balance the ladder, maintain three points of contact and ensure adequate lighting." },
    { id: "install-electric", task: "Installing material", hazard: "Energised electrical installations - electrocution", controls: "Isolate power and tag off before installation. Check exposed wires, use non-conductive fixing rods and test/tag tools." },
    { id: "install-vermin", task: "Installing material", hazard: "Biological - vermin; poisonous bite", controls: "Identify vermin. Isolate the area or do not complete the job if it cannot be made safe." },
    { id: "install-dust", task: "Installing material", hazard: "Dust or fibre exposure", controls: "Wear correct PPE including glasses, dust mask and gloves while installing material." },
    { id: "install-sharp", task: "Installing material", hazard: "Sharp object - cuts from protruding nails or framework", controls: "Remove or bend protruding nails and wear gloves." },
    { id: "clean-fall", task: "Clean up site", hazard: "Gravitational - fall from ladder", controls: "Use a suitable industrial ladder, maintain three points of contact and wear slip-resistant footwear." },
    { id: "clean-manual", task: "Clean up site", hazard: "Biomechanical - manual handling", controls: "Do not over exert or reach. Use two-person lifting where needed and place waste in the bin." },
  ],
  photoChecklist: [
    choice("installed-areas", "All installed areas (minimum 6 photos)"), choice("site-board", "Site board - mandatory"),
    choice("heater-platform", "Insulated heater platform"), choice("split-packs", "Split packs in ceiling"),
    choice("incomplete-areas", "Areas that cannot be completed"), choice("site-damage", "Any site damage"),
    choice("secured-site", "Secured site / in bin"), choice("clean-site", "Clean site after install"), choice("polyester-infills", "Polyester infills"),
  ],
};

function choices(value: unknown, fallback: SwmsChoice[]): SwmsChoice[] {
  if (!Array.isArray(value)) return fallback;
  const normalised = value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<SwmsChoice>;
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      const id = typeof candidate.id === "string" ? candidate.id.trim() : `item-${index + 1}`;
      return label ? { id, label } : null;
    })
    .filter((item): item is SwmsChoice => item !== null);
  return normalised.length ? normalised : fallback;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalised = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return normalised.length ? normalised : fallback;
}

export function normaliseSwmsTemplate(value: unknown): SwmsTemplate {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_SWMS_TEMPLATE);
  const input = value as Partial<SwmsTemplate>;
  const hazards = Array.isArray(input.hazards)
    ? input.hazards.map((item, index) => {
      const candidate = item as Partial<SwmsHazard>;
      return {
        id: typeof candidate.id === "string" && candidate.id ? candidate.id : `hazard-${index + 1}`,
        task: typeof candidate.task === "string" ? candidate.task : "",
        hazard: typeof candidate.hazard === "string" ? candidate.hazard : "",
        controls: typeof candidate.controls === "string" ? candidate.controls : "",
      };
    }).filter((item) => item.task && item.hazard) : DEFAULT_SWMS_TEMPLATE.hazards;
  return {
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : DEFAULT_SWMS_TEMPLATE.name,
    versionLabel: typeof input.versionLabel === "string" && input.versionLabel.trim() ? input.versionLabel.trim() : DEFAULT_SWMS_TEMPLATE.versionLabel,
    mandatoryNotice: typeof input.mandatoryNotice === "string" && input.mandatoryNotice.trim() ? input.mandatoryNotice.trim() : DEFAULT_SWMS_TEMPLATE.mandatoryNotice,
    quickReference: stringList(input.quickReference, DEFAULT_SWMS_TEMPLATE.quickReference),
    scopeItems: choices(input.scopeItems, DEFAULT_SWMS_TEMPLATE.scopeItems),
    siteReportItems: choices(input.siteReportItems, DEFAULT_SWMS_TEMPLATE.siteReportItems),
    hazards: hazards.length ? hazards : DEFAULT_SWMS_TEMPLATE.hazards,
    photoChecklist: choices(input.photoChecklist, DEFAULT_SWMS_TEMPLATE.photoChecklist),
  };
}

export function emptySwmsValues(template: SwmsTemplate, defaults: Partial<Pick<SwmsValues, "salesOrder" | "builder" | "siteAddress" | "suburb">> = {}): SwmsValues {
  return {
    salesOrder: defaults.salesOrder ?? "",
    preparedAt: new Date().toISOString(),
    builder: defaults.builder ?? "",
    siteAddress: defaults.siteAddress ?? "",
    suburb: defaults.suburb ?? "",
    principal: "",
    leadInstaller: "",
    scope: Object.fromEntries(template.scopeItems.map((item) => [item.id, false])),
    repairNotes: "",
    siteReport: Object.fromEntries(template.siteReportItems.map((item) => [item.id, false])),
    otherSiteReport: "",
    powerIsolated: false,
    powerRestored: false,
    hazards: Object.fromEntries(template.hazards.map((item) => [item.id, { present: false, controlled: false }])),
    hazardNotes: "",
    studWidths: { gfWalls: "", ffWalls: "", ceilingSpacing: "", subFloor: "", midFloor: "" },
    comments: "",
    installerNames: ["", "", "", ""],
    jobStatus: "",
    timeOut: "",
    photoChecklist: Object.fromEntries(template.photoChecklist.map((item) => [item.id, false])),
    photoNotes: "",
  };
}

export function normaliseSwmsValues(value: unknown, template: SwmsTemplate, defaults?: Partial<Pick<SwmsValues, "salesOrder" | "builder" | "siteAddress" | "suburb">>): SwmsValues {
  const fallback = emptySwmsValues(template, defaults);
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<SwmsValues>;
  const record = (source: unknown, available: Record<string, boolean>) => {
    if (!source || typeof source !== "object") return available;
    return Object.fromEntries(Object.keys(available).map((id) => [id, Boolean((source as Record<string, unknown>)[id])]));
  };
  const text = <K extends keyof SwmsValues>(key: K, fallbackValue: SwmsValues[K]) =>
    typeof input[key] === "string" ? input[key] as SwmsValues[K] : fallbackValue;
  const inputHazards = input.hazards && typeof input.hazards === "object" ? input.hazards : {};
  return {
    ...fallback,
    salesOrder: text("salesOrder", fallback.salesOrder), preparedAt: text("preparedAt", fallback.preparedAt), builder: text("builder", fallback.builder),
    siteAddress: text("siteAddress", fallback.siteAddress), suburb: text("suburb", fallback.suburb), principal: text("principal", fallback.principal),
    leadInstaller: text("leadInstaller", fallback.leadInstaller), scope: record(input.scope, fallback.scope), repairNotes: text("repairNotes", fallback.repairNotes),
    siteReport: record(input.siteReport, fallback.siteReport), otherSiteReport: text("otherSiteReport", fallback.otherSiteReport),
    powerIsolated: Boolean(input.powerIsolated), powerRestored: Boolean(input.powerRestored),
    hazards: Object.fromEntries(template.hazards.map((item) => {
      const state = (inputHazards as Record<string, unknown>)[item.id] as Partial<{ present: boolean; controlled: boolean }> | undefined;
      return [item.id, { present: Boolean(state?.present), controlled: Boolean(state?.controlled) }];
    })),
    hazardNotes: text("hazardNotes", fallback.hazardNotes),
    studWidths: { ...fallback.studWidths, ...(input.studWidths && typeof input.studWidths === "object" ? Object.fromEntries(Object.entries(input.studWidths).filter(([, item]) => typeof item === "string")) : {}) },
    comments: text("comments", fallback.comments),
    installerNames: Array.isArray(input.installerNames) ? input.installerNames.slice(0, 4).map((item) => typeof item === "string" ? item : "").concat(Array(Math.max(0, 4 - input.installerNames.length)).fill("")) : fallback.installerNames,
    jobStatus: text("jobStatus", fallback.jobStatus), timeOut: text("timeOut", fallback.timeOut),
    photoChecklist: record(input.photoChecklist, fallback.photoChecklist), photoNotes: text("photoNotes", fallback.photoNotes),
  };
}
