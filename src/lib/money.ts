// All money is held as whole cents in integers. Strings only at the edges.

const AMOUNT_RE = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

export function parseAmount(input: string): number {
  const text = input.trim();
  const match = AMOUNT_RE.exec(text);
  if (!match) throw new Error(`Not a valid amount: "${input}"`);
  const whole = Number(match[1]);
  const frac = (match[2] ?? "").padEnd(2, "0");
  return whole * 100 + Number(frac);
}

export function toAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Bad cents: ${cents}`);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export function formatMoney(cents: number, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${sign}${symbol}${whole}.${frac}`;
}

/**
 * Splits a total into parts proportional to integer weights, in whole cents.
 * Largest remainder method: each part gets its floor, then the leftover cents
 * go one at a time to the parts with the biggest remainders (earlier part wins a tie).
 * The parts always add up to the total.
 */
export function allocate(totalCents: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error("Total must be whole cents");
  if (weights.length === 0) throw new Error("Need at least one weight");
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new Error("Weights must be whole numbers");
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new Error("Weights add up to zero");

  const base = weights.map((w) => Math.floor((totalCents * w) / weightSum));
  const remainders = weights.map((w, i) => ({ i, r: (totalCents * w) % weightSum }));
  let left = totalCents - base.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (left === 0) break;
    base[i] = (base[i] ?? 0) + 1;
    left -= 1;
  }
  return base;
}

export function splitEqually(totalCents: number, count: number): number[] {
  return allocate(totalCents, Array.from({ length: count }, () => 1));
}
