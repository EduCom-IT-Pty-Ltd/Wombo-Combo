import { marginPctOf } from "./money";

export interface CostingInputs {
  quotedSellCents: number;
  quotedCostCents: number;
  /** Approved time entries, already converted to hours at the snapshotted rate. */
  labour: Array<{ hours: number; costRateCentsPerHour: number }>;
  materials: Array<{ quantity: number; unitCostCents: number }>;
  budgetedLabourCostCents?: number;
  subcontractorMaterialCostCents?: number;
  /** Only approved variations count towards revenue. */
  variations: Array<{ status: string; quotedSellCents: number; estimatedCostCents: number }>;
}

export interface CostingResult {
  actualLabourHours: number;
  actualLabourCostCents: number;
  actualMaterialCostCents: number;
  budgetedLabourCostCents: number;
  labourVarianceCents: number;
  subcontractorMaterialCostCents: number;
  variationSellCents: number;
  variationCostCents: number;
  totalRevenueCents: number;
  totalCostCents: number;
  grossProfitCents: number;
  grossMarginPct: number;
  /** Actual cost vs quoted cost. Positive means we ran over. */
  costVarianceCents: number;
  /** Achieved margin vs quoted margin, in percentage points. */
  marginVariancePts: number;
  /**
   * False when no labour or materials have been captured. Without this a job
   * with nothing recorded reports a flawless 100% margin, which reads as a
   * great result rather than as missing data.
   */
  hasCostData: boolean;
}

export function calculateCosting(input: CostingInputs): CostingResult {
  const actualLabourHours = input.labour.reduce((s, l) => s + l.hours, 0);
  const actualLabourCostCents = input.labour.reduce(
    (s, l) => s + Math.round(l.hours * l.costRateCentsPerHour),
    0,
  );
  const actualMaterialCostCents = input.materials.reduce(
    (s, m) => s + Math.round(m.quantity * m.unitCostCents),
    0,
  );
  const budgetedLabourCostCents = input.budgetedLabourCostCents ?? 0;
  const subcontractorMaterialCostCents = input.subcontractorMaterialCostCents ?? 0;

  const approved = input.variations.filter((v) => v.status === "approved" || v.status === "invoiced");
  const variationSellCents = approved.reduce((s, v) => s + v.quotedSellCents, 0);
  const variationCostCents = approved.reduce((s, v) => s + v.estimatedCostCents, 0);

  const totalRevenueCents = input.quotedSellCents + variationSellCents;
  const totalCostCents = actualLabourCostCents + actualMaterialCostCents + subcontractorMaterialCostCents + variationCostCents;
  const grossProfitCents = totalRevenueCents - totalCostCents;
  const grossMarginPct = marginPctOf(totalCostCents, totalRevenueCents);

  return {
    actualLabourHours,
    actualLabourCostCents,
    actualMaterialCostCents,
    budgetedLabourCostCents,
    labourVarianceCents: actualLabourCostCents - budgetedLabourCostCents,
    subcontractorMaterialCostCents,
    variationSellCents,
    variationCostCents,
    totalRevenueCents,
    totalCostCents,
    grossProfitCents,
    grossMarginPct,
    costVarianceCents: totalCostCents - input.quotedCostCents,
    marginVariancePts: grossMarginPct - marginPctOf(input.quotedCostCents, input.quotedSellCents),
    hasCostData: input.labour.length > 0 || input.materials.length > 0 || subcontractorMaterialCostCents > 0 || budgetedLabourCostCents > 0,
  };
}

/** Hours worked on a time entry, minus unpaid breaks. */
export function entryHours(startedAt: Date, endedAt: Date | null, breakMinutes: number): number {
  if (!endedAt) return 0;
  const ms = endedAt.getTime() - startedAt.getTime();
  return Math.max(0, ms / 3_600_000 - breakMinutes / 60);
}
