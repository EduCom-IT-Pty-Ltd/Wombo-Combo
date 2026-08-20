/** Stable, high-contrast fallback colours for customers without a saved colour. */
const CUSTOMER_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#0891b2", "#4f46e5", "#be123c"];

export function customerColorFor(id: string, savedColor?: string | null): string {
  if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) return savedColor;
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CUSTOMER_COLORS[hash % CUSTOMER_COLORS.length];
}
