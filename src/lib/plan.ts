import { allocate } from "./money";

export const FULL_BPS = 10_000; // 100.00%
export const MAX_POTS = 12;

export type ShareKind = "percent" | "fixed";

export interface PotDraft {
  name: string;
  purpose: string;
  shareKind: ShareKind;
  /** Basis points, used when shareKind is percent. 2500 = 25%. */
  shareBps: number;
  /** Whole cents, used when shareKind is fixed. */
  fixedCents: number;
  /** null keeps the money in the account under the pot's label. */
  destinationId: number | null;
  reason: string;
}

export interface KnownDestination {
  id: number;
  label: string;
  email: string;
  approved: boolean;
}

export function potKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * Checks a plan before anyone sees it or it runs. The same check applies to
 * plans typed by the user and plans proposed by the AI.
 */
export function validatePlan(pots: readonly PotDraft[], destinations: readonly KnownDestination[]): string[] {
  const errors: string[] = [];
  if (pots.length === 0) errors.push("A plan needs at least one pot.");
  if (pots.length > MAX_POTS) errors.push(`A plan can have at most ${MAX_POTS} pots.`);

  const keys = new Set<string>();
  const destinationIds = new Set(destinations.map((d) => d.id));
  let bps = 0;
  let percentPots = 0;

  pots.forEach((pot, i) => {
    const label = pot.name.trim() || `Pot ${i + 1}`;
    const key = potKey(pot.name);
    if (!key) errors.push(`Pot ${i + 1} needs a name.`);
    else if (keys.has(key)) errors.push(`Two pots are called "${label}".`);
    keys.add(key);
    if (pot.name.length > 40) errors.push(`"${label}": name is longer than 40 characters.`);
    if (pot.purpose.length > 140) errors.push(`"${label}": purpose is longer than 140 characters.`);
    if (pot.reason.length > 240) errors.push(`"${label}": reason is longer than 240 characters.`);

    // Emails only ever come from the destinations list the user typed.
    for (const text of [pot.name, pot.purpose, pot.reason]) {
      if (EMAIL_LIKE.test(text)) errors.push(`"${label}": text fields cannot hold an email address.`);
    }

    if (pot.shareKind === "percent") {
      percentPots += 1;
      if (!Number.isSafeInteger(pot.shareBps) || pot.shareBps <= 0 || pot.shareBps > FULL_BPS) {
        errors.push(`"${label}": percent must be above 0 and at most 100.`);
      } else bps += pot.shareBps;
    } else if (pot.shareKind === "fixed") {
      if (!Number.isSafeInteger(pot.fixedCents) || pot.fixedCents <= 0) {
        errors.push(`"${label}": a fixed amount must be above 0.`);
      }
    } else {
      errors.push(`"${label}": unknown share type.`);
    }

    if (pot.destinationId !== null && !destinationIds.has(pot.destinationId)) {
      errors.push(`"${label}": that destination is not one you added.`);
    }
  });

  if (percentPots === 0) errors.push("At least one pot must take a percent, so every cent has a place.");
  else if (bps !== FULL_BPS) {
    errors.push(`Percent shares add up to ${(bps / 100).toFixed(2)}%. They must add up to exactly 100%.`);
  }
  return errors;
}

export interface DividedPart {
  index: number;
  cents: number;
}

export type DivideResult =
  | { ok: true; parts: DividedPart[] }
  | { ok: false; reason: string };

/**
 * Fixed amounts come out first. Percent pots split what is left.
 * Every cent of the payment lands in exactly one pot.
 */
export function divide(totalCents: number, pots: readonly PotDraft[]): DivideResult {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return { ok: false, reason: "Payment amount is not valid." };
  const fixedTotal = pots.reduce((sum, p) => (p.shareKind === "fixed" ? sum + p.fixedCents : sum), 0);
  if (fixedTotal > totalCents) {
    return { ok: false, reason: "The fixed amounts in the plan are more than this payment." };
  }
  const percentIdx = pots.flatMap((p, i) => (p.shareKind === "percent" ? [i] : []));
  if (percentIdx.length === 0) return { ok: false, reason: "The plan has no percent pot." };

  const rest = totalCents - fixedTotal;
  const split = allocate(rest, percentIdx.map((i) => pots[i]!.shareBps));
  const cents = pots.map((p) => (p.shareKind === "fixed" ? p.fixedCents : 0));
  percentIdx.forEach((potIndex, j) => {
    cents[potIndex] = split[j]!;
  });

  const sum = cents.reduce((a, b) => a + b, 0);
  if (sum !== totalCents) return { ok: false, reason: "Parts do not add up to the payment." };
  return { ok: true, parts: cents.map((c, index) => ({ index, cents: c })) };
}

export function percentToBps(percent: number): number | null {
  const bps = Math.round(percent * 100);
  if (Math.abs(bps - percent * 100) > 1e-6) return null;
  return bps;
}
