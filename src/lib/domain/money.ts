/**
 * Money is integer cents everywhere. Floats never touch a price.
 */

export function formatMoney(cents: number, currency = "AUD", opts: { compact?: boolean } = {}): string {
  const value = cents / 100;
  if (opts.compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(pct: number, digits = 1): string {
  return `${pct.toFixed(digits)}%`;
}

/** Sell price from cost and a margin *on sell* (not markup on cost). */
export function sellFromMargin(costCents: number, marginPct: number): number {
  const m = Math.min(Math.max(marginPct, 0), 99.9) / 100;
  return Math.round(costCents / (1 - m));
}

/** Margin percentage of sell, given cost and sell. */
export function marginPctOf(costCents: number, sellCents: number): number {
  if (sellCents <= 0) return 0;
  return ((sellCents - costCents) / sellCents) * 100;
}

/** Converts a foreign-currency cost at the rate captured on the line. */
export function convert(cents: number, fxRate: number): number {
  return Math.round(cents * fxRate);
}
