/**
 * Monetary helpers.
 *
 * The demo API returns amounts as signed IEEE-754 doubles in major units
 * (e.g. -127.85), while the OpenAPI contract in Annexe E declares
 * `amount: integer, minimum: 1` in cents. That divergence is DEF-004.
 *
 * Until it is resolved, every arithmetic comparison in this suite is done in
 * integer cents so that no assertion can fail (or pass) because of binary
 * floating-point drift. 0.1 + 0.2 !== 0.3 is not an acceptable reason for a
 * payments regression suite to go red.
 */
export function toCents(major: number): number {
  return Math.round(major * 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + toCents(v), 0);
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Parses "$1,234.56", "1 234,56 $", "-$40.00" into signed integer cents. */
export function parseCurrencyToCents(display: string): number {
  const negative = /^\s*-|\(.*\)/.test(display);
  const digits = display.replace(/[^\d.,]/g, '');
  // Last separator present is the decimal separator.
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);
  let normalised: string;
  if (decimalAt === -1) {
    normalised = digits.replace(/[.,]/g, '');
  } else {
    const intPart = digits.slice(0, decimalAt).replace(/[.,\s]/g, '');
    const fracPart = digits.slice(decimalAt + 1).replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    normalised = `${intPart}.${fracPart}`;
  }
  const value = Math.round(Number.parseFloat(normalised) * 100);
  if (Number.isNaN(value)) throw new Error(`Cannot parse currency string: "${display}"`);
  return negative ? -value : value;
}
