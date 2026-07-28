import type { LineKind } from "@/lib/db/schema/enums";
import { convert, marginPctOf, sellFromMargin } from "./money";

export interface QuoteLineInput {
  id?: string;
  /** Links catalogue-derived material lines back to the source material for editing. */
  catalogueMaterialId?: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unit: string;
  /** Cost per unit in the supplier's currency. */
  unitCostCents: number;
  costCurrency: string;
  /** Rate to the org currency, captured at the time the line was priced. */
  fxRate: number;
  marginPct: number;
  /** When set, the operator has typed a sell price and margin is derived from it. */
  unitSellCentsOverride?: number | null;
}

export interface PricedQuoteLine extends QuoteLineInput {
  unitCostOrgCents: number;
  unitSellCents: number;
  lineCostCents: number;
  lineSellCents: number;
  lineMarginCents: number;
  effectiveMarginPct: number;
  isOverride: boolean;
}

export interface QuoteTotals {
  lines: PricedQuoteLine[];
  subtotalCostCents: number;
  subtotalSellCents: number;
  marginCents: number;
  marginPct: number;
  taxCents: number;
  totalCents: number;
  /** Cost split by line kind — drives the estimate breakdown panel. */
  costByKind: Record<LineKind, number>;
}

export function priceLine(line: QuoteLineInput): PricedQuoteLine {
  const unitCostOrgCents = convert(line.unitCostCents, line.fxRate);
  const isOverride = line.unitSellCentsOverride != null;
  const unitSellCents = isOverride
    ? line.unitSellCentsOverride!
    : sellFromMargin(unitCostOrgCents, line.marginPct);

  const lineCostCents = Math.round(unitCostOrgCents * line.quantity);
  const lineSellCents = Math.round(unitSellCents * line.quantity);

  return {
    ...line,
    unitCostOrgCents,
    unitSellCents,
    lineCostCents,
    lineSellCents,
    lineMarginCents: lineSellCents - lineCostCents,
    effectiveMarginPct: marginPctOf(unitCostOrgCents, unitSellCents),
    isOverride,
  };
}

const EMPTY_BY_KIND: Record<LineKind, number> = {
  labour: 0,
  material: 0,
  supplier: 0,
  freight: 0,
  subcontract: 0,
  other: 0,
};

export function calculateQuote(lines: QuoteLineInput[], taxRatePct = 10): QuoteTotals {
  const priced = lines.map(priceLine);

  const subtotalCostCents = priced.reduce((sum, l) => sum + l.lineCostCents, 0);
  const subtotalSellCents = priced.reduce((sum, l) => sum + l.lineSellCents, 0);
  const taxCents = Math.round(subtotalSellCents * (taxRatePct / 100));

  const costByKind = priced.reduce<Record<LineKind, number>>(
    (acc, l) => ({ ...acc, [l.kind]: acc[l.kind] + l.lineCostCents }),
    { ...EMPTY_BY_KIND },
  );

  return {
    lines: priced,
    subtotalCostCents,
    subtotalSellCents,
    marginCents: subtotalSellCents - subtotalCostCents,
    marginPct: marginPctOf(subtotalCostCents, subtotalSellCents),
    taxCents,
    totalCents: subtotalSellCents + taxCents,
    costByKind,
  };
}

/**
 * Org-level floor for issuing a quote without a second signature. Sits in
 * `organizations.settings.minimumMarginPct` once Admin is wired up.
 */
export const DEFAULT_MINIMUM_MARGIN_PCT = 20;

export function needsMarginApproval(totals: QuoteTotals, minimumPct = DEFAULT_MINIMUM_MARGIN_PCT): boolean {
  return totals.marginPct < minimumPct;
}
