import { getDb, nowIso, tx } from "./db";
import { formatMoney, toAmount } from "./money";
import { divide, percentToBps, validatePlan, type PotDraft } from "./plan";
import { getAdvisor, nudgeTemplate, previewAdvisor, type EarningSummary, type NudgeFacts, type PlanProposal } from "./ai";
import { guardPayout, sendQueued } from "./engine";
import { currency } from "./paypal";
import {
  getActivePlan,
  getDestination,
  listDestinations,
  listPayments,
  partsForSpend,
  saveDraft,
  type Payment,
  type Plan,
} from "./repo";

type Row = Record<string, unknown>;

// ---------- earning history ----------

export function earningSummary(payments: Payment[]): EarningSummary {
  const sorted = [...payments].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const amounts = sorted.map((p) => p.amountCents);
  const count = amounts.length;
  const total = amounts.reduce((a, b) => a + b, 0);
  const mean = count ? total / count : 0;
  const variance = count ? amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / count : 0;
  const cv = mean ? Math.sqrt(variance) / mean : 0;
  const months = new Set(sorted.map((p) => p.receivedAt.slice(0, 7))).size;
  const unevenness =
    count < 3
      ? "too few payments to judge"
      : cv < 0.25
        ? "fairly steady amounts"
        : cv < 0.6
          ? `uneven: the largest payment is ${(Math.max(...amounts) / Math.min(...amounts)).toFixed(1)} times the smallest`
          : `very uneven: the largest payment is ${(Math.max(...amounts) / Math.min(...amounts)).toFixed(1)} times the smallest`;
  return {
    count,
    months,
    totalAmount: toAmount(total),
    averageAmount: toAmount(Math.round(mean)),
    smallest: toAmount(count ? Math.min(...amounts) : 0),
    largest: toAmount(count ? Math.max(...amounts) : 0),
    unevenness,
    payments: sorted.map((p) => ({ date: p.receivedAt.slice(0, 10), amount: toAmount(p.amountCents) })),
  };
}

// ---------- AI plan proposal ----------

export type ProposalResult =
  | { ok: true; plan: Plan; usedFallback: boolean }
  | { ok: false; problems: string[]; proposal: PlanProposal | null };

/** Converts what the AI said into pots. Code, not the model, decides if it is acceptable. */
export function proposalToPots(proposal: PlanProposal, destinationIds: Set<number>): { pots: PotDraft[]; problems: string[] } {
  const problems: string[] = [];
  const pots: PotDraft[] = proposal.pots.map((p, i) => {
    const bps = percentToBps(p.percent);
    if (bps === null) problems.push(`Pot ${i + 1} has a percent with too many decimals.`);
    let destinationId: number | null = null;
    if (p.destinationId !== 0) {
      if (destinationIds.has(p.destinationId)) destinationId = p.destinationId;
      else problems.push(`"${p.name}" points to a destination you never added.`);
    }
    return {
      name: p.name,
      purpose: p.purpose,
      shareKind: "percent",
      shareBps: bps ?? 0,
      fixedCents: 0,
      destinationId,
      reason: p.reason,
    };
  });
  return { pots, problems };
}

export async function proposePlan(userWords: string): Promise<ProposalResult> {
  const words = userWords.trim().slice(0, 1500);
  const history = listPayments().filter((p) => p.status !== "waiting_user");
  const destinations = listDestinations();
  const input = {
    earnings: earningSummary(history),
    userWords: words,
    destinations: destinations.map((d) => ({ id: d.id, label: d.label })),
    currency: currency(),
  };

  let proposal: PlanProposal;
  let usedFallback = false;
  try {
    proposal = await getAdvisor().proposePlan(input);
  } catch {
    // Claude off, over its daily limit, or failed: use the fixed rules and label them.
    proposal = await previewAdvisor.proposePlan(input);
    usedFallback = true;
  }

  const { pots, problems } = proposalToPots(proposal, new Set(destinations.map((d) => d.id)));
  const all = [...problems, ...validatePlan(pots, destinations)];
  if (all.length) return { ok: false, problems: all, proposal };

  const plan = saveDraft({
    source: proposal.source === "ai" ? "ai" : "preview",
    pots,
    userWords: words,
    summary: proposal.summary,
    savingsNote: proposal.savingsNote,
  });
  return { ok: true, plan, usedFallback };
}

// ---------- try a plan on past payments ----------

export interface TrialRow {
  paymentId: number;
  date: string;
  amountCents: number;
  seeded: boolean;
  parts: { potName: string; cents: number; keep: boolean }[] | null;
  problem: string | null;
}

export function tryOnPastPayments(pots: PotDraft[], limit = 8): TrialRow[] {
  return listPayments()
    .slice(0, limit)
    .map((p) => {
      const result = divide(p.amountCents, pots);
      return {
        paymentId: p.id,
        date: p.receivedAt.slice(0, 10),
        amountCents: p.amountCents,
        seeded: p.seeded,
        parts: result.ok
          ? result.parts.map(({ index, cents }) => ({
              potName: pots[index]!.name,
              cents,
              keep: pots[index]!.destinationId === null,
            }))
          : null,
        problem: result.ok ? null : result.reason,
      };
    });
}

// ---------- pace ----------

export interface Period {
  start: Date;
  end: Date;
  elapsed: number; // 0..1
  daysLeft: number;
}

export function monthPeriod(now: Date): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const elapsed = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  return { start, end, elapsed: Math.min(1, Math.max(0, elapsed)), daysLeft };
}

/** A pot is ahead of pace when the share used is more than 15 points past the share of the month gone. */
export const PACE_MARGIN = 0.15;

export function isAheadOfPace(fundedCents: number, spentCents: number, elapsed: number): boolean {
  if (fundedCents <= 0 || spentCents <= 0) return false;
  return spentCents / fundedCents > elapsed + PACE_MARGIN;
}

export interface PotPace {
  key: string;
  name: string;
  purpose: string;
  reason: string;
  fundedCents: number;
  spentCents: number;
  leftCents: number;
  usedShare: number;
  expectedLeftCents: number;
  ahead: boolean;
}

/** Pace is tracked for pots whose money stays in the account. Paid-out pots leave the account on arrival. */
export function potPace(now = new Date(), plan: Plan | null = getActivePlan()): { period: Period; pots: PotPace[] } {
  const period = monthPeriod(now);
  if (!plan) return { period, pots: [] };
  const from = period.start.toISOString();
  const to = period.end.toISOString();
  const db = getDb();
  const pots = plan.pots
    .filter((p) => p.destinationId === null)
    .map((pot) => {
      const funded = Number(
        (db
          .prepare(
            `SELECT COALESCE(SUM(pa.cents), 0) AS n FROM parts pa JOIN payments py ON py.id = pa.payment_id
             WHERE pa.pot_key = ? AND pa.status IN ('kept','declined') AND py.received_at >= ? AND py.received_at < ?`,
          )
          .get(pot.key, from, to) as Row).n,
      );
      const spent = Number(
        (db
          .prepare(
            `SELECT COALESCE(SUM(pa.cents), 0) AS n FROM parts pa JOIN spends s ON s.id = pa.spend_id
             WHERE pa.pot_key = ? AND pa.status NOT IN ('failed','returned','declined') AND s.created_at >= ? AND s.created_at < ?`,
          )
          .get(pot.key, from, to) as Row).n,
      );
      return {
        key: pot.key,
        name: pot.name,
        purpose: pot.purpose,
        reason: pot.reason,
        fundedCents: funded,
        spentCents: spent,
        leftCents: funded - spent,
        usedShare: funded > 0 ? spent / funded : 0,
        expectedLeftCents: Math.round(funded * (1 - period.elapsed)),
        ahead: isAheadOfPace(funded, spent, period.elapsed),
      };
    });
  return { period, pots };
}

// ---------- nudges ----------

export function nudgeFacts(p: PotPace, period: Period): NudgeFacts {
  return {
    potName: p.name,
    usedPercent: String(Math.round(p.usedShare * 100)),
    periodPercent: String(Math.round(period.elapsed * 100)),
    leftAmount: formatMoney(p.leftCents, currency()),
    daysLeft: String(period.daysLeft),
  };
}

/** The AI's wording is used only if it repeats the code's numbers and stays short. */
export function acceptNudgeText(text: string, facts: NudgeFacts): boolean {
  const t = text.trim();
  return (
    t.length > 0 &&
    t.length <= 240 &&
    !t.includes("@") &&
    t.includes(`${facts.usedPercent}%`) &&
    t.includes(`${facts.periodPercent}%`)
  );
}

export interface Nudge {
  id: number;
  potKey: string;
  day: string;
  message: string;
  source: "ai" | "template";
  createdAt: string;
}

export async function refreshNudges(now = new Date()): Promise<Nudge[]> {
  const { period, pots } = potPace(now);
  const day = now.toISOString().slice(0, 10);
  const db = getDb();
  for (const p of pots.filter((x) => x.ahead)) {
    const exists = db.prepare("SELECT 1 FROM nudges WHERE pot_key = ? AND day = ?").get(p.key, day);
    if (exists) continue;
    const facts = nudgeFacts(p, period);
    let message = nudgeTemplate(facts);
    let source: "ai" | "template" = "template";
    try {
      const written = await getAdvisor().writeNudge(facts);
      if (written.source === "ai" && acceptNudgeText(written.message, facts)) {
        message = written.message.trim();
        source = "ai";
      }
    } catch {
      // The template already carries the numbers.
    }
    db.prepare("INSERT OR IGNORE INTO nudges (pot_key, day, message, source, facts, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(p.key, day, message, source, JSON.stringify(facts), nowIso());
  }
  return todaysNudges(now);
}

export function todaysNudges(now = new Date()): Nudge[] {
  const day = now.toISOString().slice(0, 10);
  return (getDb().prepare("SELECT * FROM nudges WHERE day = ? ORDER BY id DESC").all(day) as Row[]).map((r) => ({
    id: Number(r.id),
    potKey: String(r.pot_key),
    day: String(r.day),
    message: String(r.message),
    source: String(r.source) as Nudge["source"],
    createdAt: String(r.created_at),
  }));
}

// ---------- spending from a pot ----------

export async function spendFromPot(input: { potKey: string; cents: number; destinationId: number; note: string }) {
  const plan = getActivePlan();
  const pot = plan?.pots.find((p) => p.key === input.potKey && p.destinationId === null);
  if (!pot) throw new Error("Pick a pot that keeps its money in the account.");
  const destination = getDestination(input.destinationId);
  if (!destination) throw new Error("Pick one of your destinations.");
  if (!Number.isSafeInteger(input.cents) || input.cents <= 0) throw new Error("Enter an amount above 0.");
  const pace = potPace(new Date(), plan).pots.find((p) => p.key === pot.key);
  if (!pace || pace.leftCents < input.cents) {
    throw new Error(`${pot.name} has ${formatMoney(pace?.leftCents ?? 0, currency())} left this month.`);
  }

  const spendId = tx(() => {
    const now = nowIso();
    const info = getDb()
      .prepare("INSERT INTO spends (pot_key, pot_name, cents, destination_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(pot.key, pot.name, input.cents, destination.id, input.note.trim().slice(0, 140), now);
    const id = Number(info.lastInsertRowid);
    const guard = guardPayout(input.cents, destination.id, 0);
    getDb()
      .prepare(
        `INSERT INTO parts (spend_id, pot_key, pot_name, purpose, reason, cents, kind, destination_id, receiver_email, status, hold_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, 'payout', ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, pot.key, pot.name, input.note.trim().slice(0, 140) || pot.purpose, input.cents, destination.id, destination.email, guard.status, guard.holdReason, now, now);
    return id;
  });
  await sendQueued({ spendId });
  return { spendId, parts: partsForSpend(spendId) };
}

// ---------- overview ----------

export interface OverviewRow {
  potName: string;
  purpose: string;
  keptCents: number;
  paidCents: number;
  pendingCents: number;
  problemCents: number;
  spentCents: number;
}

export function overviewByPot(): OverviewRow[] {
  const rows = getDb()
    .prepare(
      `SELECT pot_name, COALESCE(MAX(CASE WHEN payment_id IS NOT NULL THEN purpose END), '') AS purpose,
        SUM(CASE WHEN payment_id IS NOT NULL AND status IN ('kept','declined') THEN cents ELSE 0 END) AS kept,
        SUM(CASE WHEN payment_id IS NOT NULL AND kind = 'payout' AND status = 'paid' THEN cents ELSE 0 END) AS paid,
        SUM(CASE WHEN kind = 'payout' AND status IN ('needs_approval','queued','sent','unclaimed','onhold') THEN cents ELSE 0 END) AS pending,
        SUM(CASE WHEN status IN ('failed','returned') THEN cents ELSE 0 END) AS problem,
        SUM(CASE WHEN spend_id IS NOT NULL AND status = 'paid' THEN cents ELSE 0 END) AS spent
       FROM parts GROUP BY pot_key, pot_name ORDER BY pot_name`,
    )
    .all() as Row[];
  return rows.map((r) => ({
    potName: String(r.pot_name),
    purpose: String(r.purpose),
    keptCents: Number(r.kept),
    paidCents: Number(r.paid),
    pendingCents: Number(r.pending),
    problemCents: Number(r.problem),
    spentCents: Number(r.spent),
  }));
}
