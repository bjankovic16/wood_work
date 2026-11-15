/** Formats a length for display: whole millimetres without decimals, otherwise one decimal. */
export function formatMm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
