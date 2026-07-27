import type {
  Assignment,
  Customer,
  Defect,
  DocumentRecord,
  Inspection,
  LeaveEntry,
  MaterialUse,
  Person,
  ProjectDetail,
  ProjectEvent,
  QuoteSummary,
  Site,
  Task,
  TimeEntry,
  Variation,
} from "./types";
import type { ProjectStatus } from "@/lib/db/schema/enums";

/**
 * Demo dataset — a mid-size commercial fitout contractor with jobs spread across
 * every stage of the workflow. Exists so the app is explorable before Neon is
 * connected; `src/lib/data/*.ts` reads from here whenever `isDemoMode` is true.
 *
 * Dates are relative to load time so the scheduling board and dashboard always
 * look current.
 */

const DAY = 86_400_000;
const base = new Date();
base.setHours(7, 0, 0, 0);

function at(dayOffset: number, hour = 7, minute = 0): string {
  const d = new Date(base.getTime() + dayOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const person = (
  id: string,
  name: string,
  role: Person["role"],
  opts: Partial<Pick<Person, "isSchedulable" | "costRateCentsPerHour">> = {},
): Person => ({
  id,
  name,
  initials: initials(name),
  role,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@northline.example`,
  isSchedulable: opts.isSchedulable ?? false,
  costRateCentsPerHour: opts.costRateCentsPerHour ?? 0,
});

export const people: Person[] = [
  person("u-sam", "Sam Rivera", "project_manager"),
  person("u-dee", "Dee Okafor", "estimator"),
  person("u-kit", "Kit Nguyen", "scheduler"),
  person("u-ash", "Ash Malik", "installer", { isSchedulable: true, costRateCentsPerHour: 6800 }),
  person("u-jo", "Jo Petrov", "installer", { isSchedulable: true, costRateCentsPerHour: 7200 }),
  person("u-rae", "Rae Lindqvist", "installer", { isSchedulable: true, costRateCentsPerHour: 6500 }),
  person("u-max", "Max Toure", "installer", { isSchedulable: true, costRateCentsPerHour: 7000 }),
  person("u-ola", "Ola Bergström", "qa_inspector"),
  person("u-fin", "Fin Carrasco", "finance"),
];

export const customers: Customer[] = [
  {
    id: "c-harbourside",
    name: "Harbourside Developments",
    accountType: "Head contractor",
    abn: "51 824 753 556",
    paymentTermsDays: 30,
    primaryContactName: "Priya Raman",
    primaryContactEmail: "priya@harbourside.example",
    primaryContactPhone: "+61 2 9000 1122",
    siteCount: 3,
    activeProjects: 3,
    lifetimeValueCents: 184_500_00,
  },
  {
    id: "c-meridian",
    name: "Meridian Retail Group",
    accountType: "Direct client",
    abn: "22 471 302 118",
    paymentTermsDays: 14,
    primaryContactName: "Tom Whitfield",
    primaryContactEmail: "tom.w@meridianretail.example",
    primaryContactPhone: "+61 3 8800 4410",
    siteCount: 2,
    activeProjects: 2,
    lifetimeValueCents: 96_200_00,
  },
  {
    id: "c-brightpath",
    name: "Brightpath Education Trust",
    accountType: "Government / education",
    abn: "78 118 906 442",
    paymentTermsDays: 45,
    primaryContactName: "Nadia Osei",
    primaryContactEmail: "n.osei@brightpath.example",
    primaryContactPhone: "+61 2 8100 3390",
    siteCount: 4,
    activeProjects: 2,
    lifetimeValueCents: 212_800_00,
  },
  {
    id: "c-carbon",
    name: "Carbon & Co Workspaces",
    accountType: "Direct client",
    abn: "60 553 219 774",
    paymentTermsDays: 21,
    primaryContactName: "Elliot Shaw",
    primaryContactEmail: "elliot@carbonco.example",
    primaryContactPhone: "+61 7 3300 5567",
    siteCount: 1,
    activeProjects: 1,
    lifetimeValueCents: 41_300_00,
  },
  {
    id: "c-vertex",
    name: "Vertex Health Partners",
    accountType: "Head contractor",
    abn: "35 902 664 810",
    paymentTermsDays: 30,
    primaryContactName: "Grace Lau",
    primaryContactEmail: "grace.lau@vertexhealth.example",
    primaryContactPhone: "+61 2 9440 7781",
    siteCount: 2,
    activeProjects: 2,
    lifetimeValueCents: 133_900_00,
  },
];

export const sites: Site[] = [
  {
    id: "s-quay",
    customerId: "c-harbourside",
    name: "Quay West Tower — L12",
    address: "88 Quay Street",
    suburb: "Haymarket",
    state: "NSW",
    postcode: "2000",
    accessNotes: "Loading dock off Thomas St. Site induction required. Lift bookings via building manager, 24h notice.",
  },
  {
    id: "s-foreshore",
    customerId: "c-harbourside",
    name: "Foreshore Residences — Lobby",
    address: "4 Marina Parade",
    suburb: "Pyrmont",
    state: "NSW",
    postcode: "2009",
    accessNotes: "No work before 7:30am. Street parking only.",
  },
  {
    id: "s-meridian-cbd",
    customerId: "c-meridian",
    name: "Meridian CBD Flagship",
    address: "271 Collins Street",
    suburb: "Melbourne",
    state: "VIC",
    postcode: "3000",
    accessNotes: "After-hours fitout only, 7pm–5am. Centre management sign-in at B2.",
  },
  {
    id: "s-brightpath-north",
    customerId: "c-brightpath",
    name: "Brightpath North Campus — Block C",
    address: "19 Learmonth Road",
    suburb: "Epping",
    state: "NSW",
    postcode: "2121",
    accessNotes: "Working With Children Check required for all crew. School holidays access only.",
  },
  {
    id: "s-carbon-hq",
    customerId: "c-carbon",
    name: "Carbon & Co HQ — Level 3",
    address: "310 Adelaide Street",
    suburb: "Brisbane",
    state: "QLD",
    postcode: "4000",
    accessNotes: "Freight lift booked 8am–4pm weekdays.",
  },
  {
    id: "s-vertex-clinic",
    customerId: "c-vertex",
    name: "Vertex Northshore Clinic",
    address: "2 Westbourne Street",
    suburb: "St Leonards",
    state: "NSW",
    postcode: "2065",
    accessNotes: "Live medical facility. Infection control protocol applies; no dust-generating work in Zone A.",
  },
];

interface ProjectSeed {
  id: string;
  number: string;
  title: string;
  status: ProjectStatus;
  customerId: string;
  siteId: string;
  valueCents: number;
  marginPct: number;
  pm: string;
  scope: string;
  scheduledStart?: number;
  scheduledEnd?: number;
  po?: string;
  poReceivedDays?: number;
  depositCents?: number;
  depositReceivedDays?: number;
  installedDays?: number;
  requestedStartDays?: number;
  heldFrom?: ProjectStatus;
  updatedDays: number;
}

const projectSeeds: ProjectSeed[] = [
  {
    id: "p-1041",
    number: "NLI-2026-0041",
    title: "Quay West L12 — full commercial fitout",
    status: "in_progress",
    customerId: "c-harbourside",
    siteId: "s-quay",
    valueCents: 248_600_00,
    marginPct: 31.4,
    pm: "u-sam",
    scope:
      "Strip-out of existing partitions, new glazed office fronts, 42 workstations, two meeting rooms with acoustic treatment, kitchen joinery and full carpet replacement across 640sqm.",
    scheduledStart: -4,
    scheduledEnd: 6,
    po: "HSD-PO-88412",
    poReceivedDays: -21,
    depositCents: 62_150_00,
    depositReceivedDays: -19,
    updatedDays: 0,
  },
  {
    id: "p-1038",
    number: "NLI-2026-0038",
    title: "Meridian CBD — retail shopfront refit",
    status: "qa",
    customerId: "c-meridian",
    siteId: "s-meridian-cbd",
    valueCents: 88_400_00,
    marginPct: 27.8,
    pm: "u-sam",
    scope:
      "After-hours refit of flagship shopfront: new display joinery, LED lighting track, feature wall cladding and back-of-house shelving.",
    scheduledStart: -12,
    scheduledEnd: -2,
    po: "MRG-4471",
    poReceivedDays: -34,
    depositCents: 22_100_00,
    depositReceivedDays: -33,
    installedDays: -2,
    updatedDays: -1,
  },
  {
    id: "p-1036",
    number: "NLI-2026-0036",
    title: "Vertex Northshore — consult room upgrade",
    status: "final_costing",
    customerId: "c-vertex",
    siteId: "s-vertex-clinic",
    valueCents: 64_900_00,
    marginPct: 24.1,
    pm: "u-sam",
    scope:
      "Six consult rooms refurbished with hygienic wall panelling, new cabinetry, and compliant hand-wash stations. Infection control protocol throughout.",
    scheduledStart: -24,
    scheduledEnd: -14,
    po: "VHP-PO-2210",
    poReceivedDays: -46,
    depositCents: 16_225_00,
    depositReceivedDays: -44,
    installedDays: -14,
    updatedDays: -3,
  },
  {
    id: "p-1033",
    number: "NLI-2026-0033",
    title: "Foreshore Residences — lobby joinery",
    status: "ready_for_invoice",
    customerId: "c-harbourside",
    siteId: "s-foreshore",
    valueCents: 41_750_00,
    marginPct: 33.9,
    pm: "u-sam",
    scope: "Concierge desk, mail room joinery and feature timber slat ceiling to the main lobby.",
    scheduledStart: -38,
    scheduledEnd: -30,
    po: "HSD-PO-87990",
    poReceivedDays: -58,
    installedDays: -30,
    updatedDays: -5,
  },
  {
    id: "p-1029",
    number: "NLI-2026-0029",
    title: "Brightpath North — Block C classrooms",
    status: "closed",
    customerId: "c-brightpath",
    siteId: "s-brightpath-north",
    valueCents: 127_300_00,
    marginPct: 22.6,
    pm: "u-sam",
    scope: "Eight classrooms refitted with new storage joinery, pinboards, acoustic ceilings and flooring.",
    scheduledStart: -70,
    scheduledEnd: -52,
    po: "BET-PO-5512",
    poReceivedDays: -92,
    installedDays: -52,
    updatedDays: -14,
  },
  {
    id: "p-1044",
    number: "NLI-2026-0044",
    title: "Carbon & Co HQ — L3 collaboration hub",
    status: "scheduled",
    customerId: "c-carbon",
    siteId: "s-carbon-hq",
    valueCents: 57_200_00,
    marginPct: 29.7,
    pm: "u-sam",
    scope:
      "Open-plan collaboration zone: banquette seating, four acoustic booths (imported, EU supply), moveable whiteboard walls and services rough-in.",
    scheduledStart: 4,
    scheduledEnd: 11,
    po: "CCW-PO-0093",
    poReceivedDays: -6,
    depositCents: 14_300_00,
    depositReceivedDays: -5,
    updatedDays: -1,
  },
  {
    id: "p-1045",
    number: "NLI-2026-0045",
    title: "Brightpath North — library refurbishment",
    status: "waiting_for_scheduling",
    customerId: "c-brightpath",
    siteId: "s-brightpath-north",
    valueCents: 73_800_00,
    marginPct: 25.2,
    pm: "u-sam",
    scope: "Library reconfiguration: mobile shelving, reading nook joinery, new service counter and carpet tiles.",
    po: "BET-PO-5788",
    poReceivedDays: -2,
    requestedStartDays: 18,
    updatedDays: 0,
  },
  {
    id: "p-1046",
    number: "NLI-2026-0046",
    title: "Vertex Northshore — reception & waiting area",
    status: "approved",
    customerId: "c-vertex",
    siteId: "s-vertex-clinic",
    valueCents: 39_400_00,
    marginPct: 28.3,
    pm: "u-sam",
    scope: "Reception counter, waiting area seating joinery and wayfinding signage.",
    depositCents: 9_850_00,
    requestedStartDays: 25,
    updatedDays: 0,
  },
  {
    id: "p-1047",
    number: "NLI-2026-0047",
    title: "Meridian Chadstone — pop-up kiosk build",
    status: "quote_sent",
    customerId: "c-meridian",
    siteId: "s-meridian-cbd",
    valueCents: 26_900_00,
    marginPct: 34.5,
    pm: "u-dee",
    scope: "Freestanding retail kiosk: powder-coated frame, integrated lighting, lockable display cases.",
    requestedStartDays: 30,
    updatedDays: -2,
  },
  {
    id: "p-1048",
    number: "NLI-2026-0048",
    title: "Harbourside Quay West — L14 expansion",
    status: "quote_sent",
    customerId: "c-harbourside",
    siteId: "s-quay",
    valueCents: 194_200_00,
    marginPct: 30.1,
    pm: "u-dee",
    scope:
      "Expansion of the L12 works onto L14: matching partition system, 30 workstations and a boardroom with integrated AV joinery.",
    requestedStartDays: 45,
    updatedDays: -1,
  },
  {
    id: "p-1049",
    number: "NLI-2026-0049",
    title: "Carbon & Co — Level 2 quiet rooms",
    status: "quoting",
    customerId: "c-carbon",
    siteId: "s-carbon-hq",
    valueCents: 0,
    marginPct: 0,
    pm: "u-dee",
    scope: "Six single-person quiet rooms with acoustic rating NRC 0.85, integrated ventilation and lighting.",
    requestedStartDays: 52,
    updatedDays: 0,
  },
  {
    id: "p-1050",
    number: "NLI-2026-0050",
    title: "Brightpath East — staff room upgrade",
    status: "new_request",
    customerId: "c-brightpath",
    siteId: "s-brightpath-north",
    valueCents: 0,
    marginPct: 0,
    pm: "u-sam",
    scope: "Kitchenette replacement, new lockers and breakout seating for a 40-person staff room. Scope TBC on site visit.",
    requestedStartDays: 60,
    updatedDays: 0,
  },
  {
    id: "p-1043",
    number: "NLI-2026-0043",
    title: "Meridian Southbank — storage mezzanine",
    status: "on_hold",
    customerId: "c-meridian",
    siteId: "s-meridian-cbd",
    valueCents: 48_600_00,
    marginPct: 26.4,
    pm: "u-sam",
    scope: "Structural storage mezzanine with access stair. Paused pending landlord structural approval.",
    heldFrom: "waiting_for_scheduling",
    po: "MRG-4502",
    poReceivedDays: -12,
    updatedDays: -8,
  },
  {
    id: "p-1039",
    number: "NLI-2026-0039",
    title: "Harbourside Wharf 9 — amenities upgrade",
    status: "lost",
    customerId: "c-harbourside",
    siteId: "s-foreshore",
    valueCents: 82_100_00,
    marginPct: 19.8,
    pm: "u-dee",
    scope: "Amenities refurbishment across two levels. Lost on price to an incumbent.",
    updatedDays: -18,
  },
];

const customerById = new Map(customers.map((c) => [c.id, c]));
const siteById = new Map(sites.map((s) => [s.id, s]));

export const projects: ProjectDetail[] = projectSeeds.map((s) => {
  const customer = customerById.get(s.customerId)!;
  const site = siteById.get(s.siteId)!;
  return {
    id: s.id,
    projectNumber: s.number,
    title: s.title,
    status: s.status,
    heldFromStatus: s.heldFrom ?? null,
    customerId: s.customerId,
    customerName: customer.name,
    siteId: s.siteId,
    siteLabel: `${site.name} · ${site.suburb} ${site.state}`,
    contractValueCents: s.valueCents,
    quotedMarginPct: s.marginPct,
    projectManagerId: s.pm,
    scheduledStartAt: s.scheduledStart != null ? at(s.scheduledStart) : null,
    scheduledEndAt: s.scheduledEnd != null ? at(s.scheduledEnd, 15) : null,
    poNumber: s.po ?? null,
    poReceivedAt: s.poReceivedDays != null ? at(s.poReceivedDays, 10) : null,
    updatedAt: at(s.updatedDays, 14),
    openTasks: 0,
    openDefects: 0,
    assignedInstallerIds: [],
    scopeOfWorks: s.scope,
    initialNotes: null,
    depositRequiredCents: s.depositCents ?? null,
    depositReceivedAt: s.depositReceivedDays != null ? at(s.depositReceivedDays, 11) : null,
    requestedStartOn: s.requestedStartDays != null ? at(s.requestedStartDays) : null,
    installationCompletedAt: s.installedDays != null ? at(s.installedDays, 16) : null,
    site,
    customer,
  };
});

export const quotes: QuoteSummary[] = [
  {
    id: "q-1041-2",
    projectId: "p-1041",
    reference: "NLI-2026-0041-Q2",
    version: 2,
    status: "accepted",
    totalCents: 273_460_00,
    subtotalSellCents: 248_600_00,
    subtotalCostCents: 170_539_00,
    marginPct: 31.4,
    taxRatePct: 10,
    validUntil: at(-10),
    sentAt: at(-30, 9),
    preparedById: "u-dee",
    lines: [
      { kind: "labour", description: "Strip-out and make good — 4 installers", quantity: 160, unit: "hr", unitCostCents: 6900, costCurrency: "AUD", fxRate: 1, marginPct: 30 },
      { kind: "labour", description: "Partition and glazing installation", quantity: 240, unit: "hr", unitCostCents: 7100, costCurrency: "AUD", fxRate: 1, marginPct: 32 },
      { kind: "material", description: "Glazed office front system, 2400h", quantity: 38, unit: "lm", unitCostCents: 41_200, costCurrency: "AUD", fxRate: 1, marginPct: 30 },
      { kind: "supplier", description: "Acoustic ceiling baffles (EU import)", quantity: 120, unit: "ea", unitCostCents: 4_850, costCurrency: "EUR", fxRate: 1.64, marginPct: 35 },
      { kind: "material", description: "Workstation joinery — 42 positions", quantity: 42, unit: "ea", unitCostCents: 78_500, costCurrency: "AUD", fxRate: 1, marginPct: 28 },
      { kind: "material", description: "Commercial carpet tile, 640sqm supply & lay", quantity: 640, unit: "sqm", unitCostCents: 6_400, costCurrency: "AUD", fxRate: 1, marginPct: 33 },
      { kind: "freight", description: "Site delivery and lift bookings", quantity: 1, unit: "ea", unitCostCents: 4_200_00, costCurrency: "AUD", fxRate: 1, marginPct: 15 },
    ],
  },
  {
    id: "q-1048-1",
    projectId: "p-1048",
    reference: "NLI-2026-0048-Q1",
    version: 1,
    status: "sent",
    totalCents: 213_620_00,
    subtotalSellCents: 194_200_00,
    subtotalCostCents: 135_766_00,
    marginPct: 30.1,
    taxRatePct: 10,
    validUntil: at(21),
    sentAt: at(-1, 16),
    preparedById: "u-dee",
    lines: [
      { kind: "labour", description: "Partition system installation", quantity: 200, unit: "hr", unitCostCents: 7100, costCurrency: "AUD", fxRate: 1, marginPct: 31 },
      { kind: "material", description: "Matching partition system to L12", quantity: 34, unit: "lm", unitCostCents: 41_200, costCurrency: "AUD", fxRate: 1, marginPct: 30 },
      { kind: "material", description: "Workstation joinery — 30 positions", quantity: 30, unit: "ea", unitCostCents: 78_500, costCurrency: "AUD", fxRate: 1, marginPct: 28 },
      { kind: "subcontract", description: "Boardroom AV joinery integration", quantity: 1, unit: "ea", unitCostCents: 18_400_00, costCurrency: "AUD", fxRate: 1, marginPct: 25 },
    ],
  },
  {
    id: "q-1049-1",
    projectId: "p-1049",
    reference: "NLI-2026-0049-Q1",
    version: 1,
    status: "draft",
    totalCents: 0,
    subtotalSellCents: 0,
    subtotalCostCents: 0,
    marginPct: 0,
    taxRatePct: 10,
    validUntil: null,
    sentAt: null,
    preparedById: "u-dee",
    lines: [
      { kind: "supplier", description: "Acoustic pod shell, NRC 0.85 (EU import)", quantity: 6, unit: "ea", unitCostCents: 3_940_00, costCurrency: "EUR", fxRate: 1.64, marginPct: 32 },
      { kind: "labour", description: "Pod assembly and services connection", quantity: 72, unit: "hr", unitCostCents: 7000, costCurrency: "AUD", fxRate: 1, marginPct: 30 },
    ],
  },
  {
    id: "q-1047-1",
    projectId: "p-1047",
    reference: "NLI-2026-0047-Q1",
    version: 1,
    status: "sent",
    totalCents: 29_590_00,
    subtotalSellCents: 26_900_00,
    subtotalCostCents: 17_620_00,
    marginPct: 34.5,
    taxRatePct: 10,
    validUntil: at(14),
    sentAt: at(-2, 11),
    preparedById: "u-dee",
    lines: [
      { kind: "material", description: "Powder-coated steel kiosk frame", quantity: 1, unit: "ea", unitCostCents: 9_800_00, costCurrency: "AUD", fxRate: 1, marginPct: 35 },
      { kind: "material", description: "Lockable glass display cases", quantity: 4, unit: "ea", unitCostCents: 1_150_00, costCurrency: "AUD", fxRate: 1, marginPct: 34 },
      { kind: "labour", description: "Fabrication and on-site assembly", quantity: 48, unit: "hr", unitCostCents: 6800, costCurrency: "AUD", fxRate: 1, marginPct: 34 },
    ],
  },
];

export const tasks: Task[] = [
  { id: "t-1", projectId: "p-1041", title: "Confirm lift booking for Thursday delivery", kind: "admin", status: "todo", assigneeId: "u-kit", dueOn: at(1), createdByAutomation: null },
  { id: "t-2", projectId: "p-1041", title: "Install glazed fronts — grid A to F", kind: "install", status: "in_progress", assigneeId: "u-ash", dueOn: at(2), createdByAutomation: null },
  { id: "t-3", projectId: "p-1041", title: "Chase acoustic baffle ETA with EU supplier", kind: "procurement", status: "blocked", assigneeId: "u-dee", dueOn: at(0), createdByAutomation: null },
  { id: "t-4", projectId: "p-1041", title: "Workstation joinery install — bays 1-14", kind: "install", status: "done", assigneeId: "u-jo", dueOn: at(-2), createdByAutomation: null },
  { id: "t-5", projectId: "p-1038", title: "Complete QA inspection", kind: "qa", status: "in_progress", assigneeId: "u-ola", dueOn: at(1), createdByAutomation: "raise-qa-inspection" },
  { id: "t-6", projectId: "p-1038", title: "Rectify display case alignment", kind: "defect", status: "todo", assigneeId: "u-max", dueOn: at(2), createdByAutomation: null },
  { id: "t-7", projectId: "p-1046", title: "Request purchase order from customer", kind: "admin", status: "todo", assigneeId: "u-sam", dueOn: at(1), createdByAutomation: "request-purchase-order" },
  { id: "t-8", projectId: "p-1045", title: "Allocate crew for library refurb", kind: "admin", status: "todo", assigneeId: "u-kit", dueOn: at(3), createdByAutomation: null },
  { id: "t-9", projectId: "p-1036", title: "Reconcile supplier invoices against costing", kind: "admin", status: "in_progress", assigneeId: "u-fin", dueOn: at(1), createdByAutomation: null },
  { id: "t-10", projectId: "p-1050", title: "Book site visit to scope staff room", kind: "general", status: "todo", assigneeId: "u-sam", dueOn: at(4), createdByAutomation: null },
  { id: "t-11", projectId: "p-1044", title: "Confirm EU booth delivery lands before install week", kind: "procurement", status: "todo", assigneeId: "u-dee", dueOn: at(2), createdByAutomation: null },
  { id: "t-12", projectId: "p-1048", title: "Follow up quote with Priya", kind: "admin", status: "todo", assigneeId: "u-dee", dueOn: at(3), createdByAutomation: null },
];

export const assignments: Assignment[] = [
  { id: "a-1", projectId: "p-1041", projectNumber: "NLI-2026-0041", projectTitle: "Quay West L12 — full commercial fitout", siteLabel: "Quay West Tower — L12 · Haymarket NSW", userId: "u-ash", status: "confirmed", startsAt: at(-4), endsAt: at(6, 15), role: "Lead installer" },
  { id: "a-2", projectId: "p-1041", projectNumber: "NLI-2026-0041", projectTitle: "Quay West L12 — full commercial fitout", siteLabel: "Quay West Tower — L12 · Haymarket NSW", userId: "u-jo", status: "confirmed", startsAt: at(-4), endsAt: at(6, 15), role: "Installer" },
  { id: "a-3", projectId: "p-1041", projectNumber: "NLI-2026-0041", projectTitle: "Quay West L12 — full commercial fitout", siteLabel: "Quay West Tower — L12 · Haymarket NSW", userId: "u-rae", status: "confirmed", startsAt: at(0), endsAt: at(3, 15), role: "Installer" },
  { id: "a-4", projectId: "p-1044", projectNumber: "NLI-2026-0044", projectTitle: "Carbon & Co HQ — L3 collaboration hub", siteLabel: "Carbon & Co HQ — Level 3 · Brisbane QLD", userId: "u-max", status: "confirmed", startsAt: at(4), endsAt: at(11, 15), role: "Lead installer" },
  { id: "a-5", projectId: "p-1044", projectNumber: "NLI-2026-0044", projectTitle: "Carbon & Co HQ — L3 collaboration hub", siteLabel: "Carbon & Co HQ — Level 3 · Brisbane QLD", userId: "u-rae", status: "tentative", startsAt: at(5), endsAt: at(11, 15), role: "Installer" },
  { id: "a-6", projectId: "p-1038", projectNumber: "NLI-2026-0038", projectTitle: "Meridian CBD — retail shopfront refit", siteLabel: "Meridian CBD Flagship · Melbourne VIC", userId: "u-max", status: "completed", startsAt: at(-12, 19), endsAt: at(-2, 5), role: "Lead installer" },
];

export const leave: LeaveEntry[] = [
  { id: "l-1", userId: "u-jo", type: "annual", status: "approved", startsAt: at(8), endsAt: at(19, 17), reason: "Family holiday" },
  { id: "l-2", userId: "u-rae", type: "sick", status: "approved", startsAt: at(-6), endsAt: at(-5, 17), reason: null },
  { id: "l-3", userId: "u-ash", type: "training", status: "requested", startsAt: at(9), endsAt: at(9, 17), reason: "EWP refresher" },
  { id: "l-4", userId: "u-max", type: "annual", status: "requested", startsAt: at(14), endsAt: at(21, 17), reason: null },
];

export const timeEntries: TimeEntry[] = [
  { id: "te-1", projectId: "p-1041", userId: "u-ash", startedAt: at(-4, 7), endedAt: at(-4, 15, 30), breakMinutes: 30, costRateCentsPerHour: 6800, notes: null },
  { id: "te-2", projectId: "p-1041", userId: "u-jo", startedAt: at(-4, 7), endedAt: at(-4, 15, 30), breakMinutes: 30, costRateCentsPerHour: 7200, notes: null },
  { id: "te-3", projectId: "p-1041", userId: "u-ash", startedAt: at(-3, 7), endedAt: at(-3, 16), breakMinutes: 45, costRateCentsPerHour: 6800, notes: "Late finish — waiting on lift access" },
  { id: "te-4", projectId: "p-1041", userId: "u-jo", startedAt: at(-3, 7), endedAt: at(-3, 16), breakMinutes: 45, costRateCentsPerHour: 7200, notes: null },
  { id: "te-5", projectId: "p-1041", userId: "u-ash", startedAt: at(-1, 7), endedAt: at(-1, 15), breakMinutes: 30, costRateCentsPerHour: 6800, notes: null },
  { id: "te-6", projectId: "p-1041", userId: "u-rae", startedAt: at(0, 7, 15), endedAt: null, breakMinutes: 0, costRateCentsPerHour: 6500, notes: null },
  { id: "te-7", projectId: "p-1038", userId: "u-max", startedAt: at(-3, 19), endedAt: at(-2, 5), breakMinutes: 60, costRateCentsPerHour: 7000, notes: "Night shift" },
  { id: "te-8", projectId: "p-1036", userId: "u-max", startedAt: at(-16, 7), endedAt: at(-16, 16), breakMinutes: 45, costRateCentsPerHour: 7000, notes: null },
  { id: "te-9", projectId: "p-1036", userId: "u-ash", startedAt: at(-15, 7), endedAt: at(-15, 15, 30), breakMinutes: 30, costRateCentsPerHour: 6800, notes: null },
  // Completed jobs carry full history so the margin-performance table has
  // something real to compare quoted against achieved.
  { id: "te-10", projectId: "p-1033", userId: "u-jo", startedAt: at(-38, 7), endedAt: at(-38, 15, 30), breakMinutes: 30, costRateCentsPerHour: 7200, notes: null },
  { id: "te-11", projectId: "p-1033", userId: "u-rae", startedAt: at(-37, 7), endedAt: at(-37, 16), breakMinutes: 45, costRateCentsPerHour: 6500, notes: null },
  { id: "te-12", projectId: "p-1033", userId: "u-jo", startedAt: at(-34, 7), endedAt: at(-34, 15), breakMinutes: 30, costRateCentsPerHour: 7200, notes: null },
  { id: "te-13", projectId: "p-1033", userId: "u-rae", startedAt: at(-31, 7), endedAt: at(-31, 15, 30), breakMinutes: 30, costRateCentsPerHour: 6500, notes: null },
  { id: "te-14", projectId: "p-1029", userId: "u-ash", startedAt: at(-70, 7), endedAt: at(-70, 16), breakMinutes: 45, costRateCentsPerHour: 6800, notes: null },
  { id: "te-15", projectId: "p-1029", userId: "u-jo", startedAt: at(-68, 7), endedAt: at(-68, 16, 30), breakMinutes: 45, costRateCentsPerHour: 7200, notes: "Overran — ceiling grid clash" },
  { id: "te-16", projectId: "p-1029", userId: "u-max", startedAt: at(-64, 7), endedAt: at(-64, 17), breakMinutes: 45, costRateCentsPerHour: 7000, notes: null },
  { id: "te-17", projectId: "p-1029", userId: "u-rae", startedAt: at(-58, 7), endedAt: at(-58, 16), breakMinutes: 30, costRateCentsPerHour: 6500, notes: null },
];

export const materials: MaterialUse[] = [
  { id: "m-1", projectId: "p-1041", description: "Glazed office front system, 2400h", quantity: 22, unit: "lm", unitCostCents: 41_200, recordedById: "u-ash", recordedAt: at(-3, 14) },
  { id: "m-2", projectId: "p-1041", description: "Commercial carpet tile", quantity: 180, unit: "sqm", unitCostCents: 6_400, recordedById: "u-jo", recordedAt: at(-1, 15) },
  { id: "m-3", projectId: "p-1041", description: "Additional acoustic sealant", quantity: 24, unit: "ea", unitCostCents: 1_850, recordedById: "u-ash", recordedAt: at(-1, 12) },
  { id: "m-4", projectId: "p-1036", description: "Hygienic wall panelling", quantity: 96, unit: "sqm", unitCostCents: 9_200, recordedById: "u-max", recordedAt: at(-16, 15) },
  { id: "m-5", projectId: "p-1036", description: "Hand-wash station assembly", quantity: 6, unit: "ea", unitCostCents: 128_000, recordedById: "u-max", recordedAt: at(-15, 11) },
  { id: "m-6", projectId: "p-1033", description: "Concierge desk joinery package", quantity: 1, unit: "ea", unitCostCents: 1_640_000, recordedById: "u-jo", recordedAt: at(-37, 14) },
  { id: "m-7", projectId: "p-1033", description: "Feature timber slat ceiling", quantity: 84, unit: "sqm", unitCostCents: 13_400, recordedById: "u-rae", recordedAt: at(-34, 13) },
  { id: "m-8", projectId: "p-1029", description: "Classroom storage joinery", quantity: 8, unit: "ea", unitCostCents: 742_000, recordedById: "u-ash", recordedAt: at(-66, 15) },
  { id: "m-9", projectId: "p-1029", description: "Acoustic ceiling tile", quantity: 520, unit: "sqm", unitCostCents: 7_100, recordedById: "u-max", recordedAt: at(-62, 14) },
  { id: "m-10", projectId: "p-1029", description: "Vinyl flooring supply & lay", quantity: 480, unit: "sqm", unitCostCents: 8_900, recordedById: "u-rae", recordedAt: at(-58, 15) },
];

export const variations: Variation[] = [
  { id: "v-1", projectId: "p-1041", reference: "VO-0041-01", title: "Additional power outlets to bays 15-28", status: "approved", estimatedCostCents: 3_240_00, quotedSellCents: 4_800_00 },
  { id: "v-2", projectId: "p-1041", reference: "VO-0041-02", title: "Upgrade meeting room glazing to double-glazed", status: "submitted", estimatedCostCents: 6_100_00, quotedSellCents: 9_200_00 },
  { id: "v-3", projectId: "p-1036", reference: "VO-0036-01", title: "Extra consult room added to scope", status: "approved", estimatedCostCents: 7_400_00, quotedSellCents: 10_600_00 },
];

export const documents: DocumentRecord[] = [
  { id: "d-1", projectId: "p-1041", name: "Quay West L12 — construction set Rev C.pdf", kind: "drawing", sizeBytes: 8_420_112, version: 3, requiresAcknowledgement: false, uploadedAt: at(-25, 9), uploadedById: "u-sam" },
  { id: "d-2", projectId: "p-1041", name: "SWMS — partition install and working at heights.pdf", kind: "swms", sizeBytes: 412_880, version: 2, requiresAcknowledgement: true, uploadedAt: at(-22, 10), uploadedById: "u-sam" },
  { id: "d-3", projectId: "p-1041", name: "Building induction and hot works permit.pdf", kind: "permit", sizeBytes: 208_450, version: 1, requiresAcknowledgement: true, uploadedAt: at(-21, 8), uploadedById: "u-kit" },
  { id: "d-4", projectId: "p-1041", name: "HSD-PO-88412.pdf", kind: "purchase_order", sizeBytes: 96_220, version: 1, requiresAcknowledgement: false, uploadedAt: at(-21, 10), uploadedById: "u-fin" },
  { id: "d-5", projectId: "p-1038", name: "Completion certificate — Meridian CBD.pdf", kind: "completion_certificate", sizeBytes: 142_100, version: 1, requiresAcknowledgement: false, uploadedAt: at(-1, 12), uploadedById: "u-ola" },
  { id: "d-6", projectId: "p-1044", name: "Acoustic booth shop drawings (EU supplier).pdf", kind: "drawing", sizeBytes: 3_100_400, version: 1, requiresAcknowledgement: false, uploadedAt: at(-8, 13), uploadedById: "u-dee" },
];

export const inspections: Inspection[] = [
  {
    id: "i-1038",
    projectId: "p-1038",
    result: "pending",
    inspectorId: "u-ola",
    scheduledFor: at(1, 9),
    completedAt: null,
    items: [
      { id: "ii-1", prompt: "All joinery secured and level within 2mm tolerance", isCritical: true, passed: true, comment: null },
      { id: "ii-2", prompt: "Electrical terminations tested and tagged", isCritical: true, passed: true, comment: null },
      { id: "ii-3", prompt: "Display case alignment and door operation", isCritical: false, passed: false, comment: "Left-hand case sits 4mm proud. Rectification raised." },
      { id: "ii-4", prompt: "Lighting track aligned and fully operational", isCritical: false, passed: null, comment: null },
      { id: "ii-5", prompt: "Site cleaned and waste removed", isCritical: false, passed: null, comment: null },
    ],
  },
  {
    id: "i-1036",
    projectId: "p-1036",
    result: "pass",
    inspectorId: "u-ola",
    scheduledFor: at(-13, 9),
    completedAt: at(-13, 11, 30),
    items: [
      { id: "ii-6", prompt: "Hygienic panel joints sealed to spec", isCritical: true, passed: true, comment: null },
      { id: "ii-7", prompt: "Hand-wash stations connected and tested", isCritical: true, passed: true, comment: null },
      { id: "ii-8", prompt: "Infection control barriers removed and area cleaned", isCritical: false, passed: true, comment: null },
    ],
  },
];

export const defects: Defect[] = [
  { id: "df-1", projectId: "p-1038", title: "Left display case sits 4mm proud of frame", severity: "minor", assigneeId: "u-max", dueOn: at(2), resolvedAt: null },
  { id: "df-2", projectId: "p-1041", title: "Scuff to plasterboard near grid C", severity: "minor", assigneeId: "u-jo", dueOn: at(3), resolvedAt: null },
];

export const events: ProjectEvent[] = [
  { id: "e-1", projectId: "p-1041", type: "status.changed", summary: "Status moved from Scheduled to In Progress", actorId: "u-ash", occurredAt: at(-4, 7, 20) },
  { id: "e-2", projectId: "p-1041", type: "field.clock_on", summary: "Ash Malik clocked on at Quay West Tower", actorId: "u-ash", occurredAt: at(-4, 7, 22) },
  { id: "e-3", projectId: "p-1041", type: "variation.raised", summary: "VO-0041-02 raised: upgrade meeting room glazing", actorId: "u-ash", occurredAt: at(-2, 13, 5) },
  { id: "e-4", projectId: "p-1041", type: "automation.notify", summary: "Install date confirmation sent to Priya Raman", actorId: null, occurredAt: at(-6, 9, 0) },
  { id: "e-5", projectId: "p-1038", type: "automation.qa_created", summary: "QA inspection raised automatically on installation complete", actorId: null, occurredAt: at(-2, 16, 5) },
  { id: "e-6", projectId: "p-1045", type: "automation.status", summary: "PO received — moved to Waiting for Scheduling", actorId: null, occurredAt: at(-2, 10, 15) },
  { id: "e-7", projectId: "p-1046", type: "quote.accepted", summary: "Quote NLI-2026-0046-Q1 accepted by Grace Lau", actorId: "u-dee", occurredAt: at(-1, 15, 40) },
  { id: "e-8", projectId: "p-1048", type: "quote.sent", summary: "Quote NLI-2026-0048-Q1 issued to Harbourside Developments", actorId: "u-dee", occurredAt: at(-1, 16, 0) },
];

// Backfill the denormalised counters the list views read.
for (const project of projects) {
  project.openTasks = tasks.filter((t) => t.projectId === project.id && t.status !== "done" && t.status !== "cancelled").length;
  project.openDefects = defects.filter((d) => d.projectId === project.id && !d.resolvedAt).length;
  project.assignedInstallerIds = [
    ...new Set(assignments.filter((a) => a.projectId === project.id && a.status !== "cancelled").map((a) => a.userId)),
  ];
}
