import { getDb, nowIso, tx } from "./db";
import { formatMoney, parseAmount, toAmount } from "./money";
import { divide } from "./plan";
import { getAdvisor } from "./ai";
import { currency, getGateway, PayPalError } from "./paypal";
import {
  getActivePlan,
  getBatch,
  getDestination,
  getInstallId,
  getLimits,
  getPayment,
  markDestinationApproved,
  partsForPayment,
  partsForSpend,
  setPaymentStatus,
  toBatch,
  toPart,
  type Batch,
  type Part,
  type PartStatus,
  type Payment,
} from "./repo";

type Row = Record<string, unknown>;

const TERMINAL_OK: PartStatus[] = ["paid", "kept", "declined"];
const PROBLEM: PartStatus[] = ["failed", "returned"];
const HELD_AT_PAYPAL: PartStatus[] = ["unclaimed", "onhold"];

function utcDay(iso: string) {
  return iso.slice(0, 10);
}

/** Money already committed to leave the account today, read from our own records. */
function sentTodayCents(): number {
  const today = utcDay(nowIso());
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cents), 0) AS n FROM parts
       WHERE kind = 'payout' AND status IN ('queued','sent','paid','unclaimed','onhold')
       AND substr(updated_at, 1, 10) = ?`,
    )
    .get(today) as Row;
  return Number(r.n);
}

export interface GuardResult {
  status: "queued" | "needs_approval";
  holdReason: string | null;
}

/** Guards run in code on every outgoing part. The AI cannot skip them. */
export function guardPayout(cents: number, destinationId: number, alreadyPlannedToday: number): GuardResult {
  const destination = getDestination(destinationId);
  if (!destination) return { status: "needs_approval", holdReason: "Destination not found." };
  const limits = getLimits();
  const reasons: string[] = [];
  if (!destination.approved) reasons.push(`First payment to ${destination.label}. Approve this destination once.`);
  if (cents > limits.perPaymentLimitCents) {
    reasons.push(`Above your limit of ${formatMoney(limits.perPaymentLimitCents)} per payment.`);
  }
  if (sentTodayCents() + alreadyPlannedToday + cents > limits.dailyLimitCents) {
    reasons.push(`Would pass your daily limit of ${formatMoney(limits.dailyLimitCents)}.`);
  }
  return reasons.length ? { status: "needs_approval", holdReason: reasons.join(" ") } : { status: "queued", holdReason: null };
}

// ---------- dividing a payment ----------

export interface ProcessOptions {
  /** The user said "treat this as income" after the check asked them. */
  userConfirmed?: boolean;
}

/**
 * Runs a recorded payment through the approved plan. Safe to call more than once:
 * a payment is divided at most once, and payout batches carry fixed request IDs.
 */
export async function processPayment(paymentId: number, opts: ProcessOptions = {}): Promise<Payment> {
  let payment = getPayment(paymentId);
  if (!payment) throw new Error(`No payment ${paymentId}`);
  if (payment.seeded) return payment;

  const startable = payment.status === "recorded" || payment.status === "waiting_plan" ||
    (payment.status === "waiting_user" && opts.userConfirmed);
  if (!startable) {
    await sendQueued({ paymentId });
    return getPayment(paymentId)!;
  }

  const plan = getActivePlan();
  if (!plan) {
    setPaymentStatus(paymentId, "waiting_plan", "No approved plan yet. Approve a plan and this payment will be divided.");
    return getPayment(paymentId)!;
  }

  if (!opts.userConfirmed) {
    // The check only answers "apply the plan" or "ask the user". Anything else, or an error, means ask.
    let decision: "apply" | "ask" = "ask";
    let reason = "The payment check did not answer, so this payment waits for you.";
    let source = "code";
    try {
      const check = await getAdvisor().checkPayment({
        amount: toAmount(payment.amountCents),
        currency: payment.currency,
        payer: payment.payerName ?? payment.payerEmail,
        note: payment.note,
        potNames: plan.pots.map((p) => p.name),
      });
      decision = check.decision === "apply" ? "apply" : "ask";
      reason = check.reason;
      source = check.source;
    } catch {
      // Unsure means wait.
    }
    getDb().prepare("UPDATE payments SET check_source = ?, check_reason = ? WHERE id = ?").run(source, reason, paymentId);
    if (decision !== "apply") {
      setPaymentStatus(paymentId, "waiting_user", reason);
      return getPayment(paymentId)!;
    }
  } else {
    getDb()
      .prepare("UPDATE payments SET check_source = 'user', check_reason = ? WHERE id = ?")
      .run("You confirmed this payment is income for the plan.", paymentId);
  }

  const result = divide(payment.amountCents, plan.pots);
  if (!result.ok) {
    setPaymentStatus(paymentId, "waiting_user", result.reason);
    return getPayment(paymentId)!;
  }

  const divided = tx(() => {
    // Claim the payment so a second caller cannot divide it again.
    const claim = getDb()
      .prepare("UPDATE payments SET status = 'paying', status_reason = NULL, plan_id = ? WHERE id = ? AND status IN ('recorded','waiting_plan','waiting_user')")
      .run(plan.id, paymentId);
    if (Number(claim.changes) !== 1) return false;

    const now = nowIso();
    const insert = getDb().prepare(
      `INSERT INTO parts (payment_id, pot_key, pot_name, purpose, reason, cents, kind, destination_id, receiver_email, status, hold_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let plannedToday = 0;
    for (const { index, cents } of result.parts) {
      const pot = plan.pots[index]!;
      if (cents === 0) continue;
      if (pot.destinationId === null) {
        insert.run(paymentId, pot.key, pot.name, pot.purpose, pot.reason, cents, "keep", null, null, "kept", null, now, now);
        continue;
      }
      const destination = getDestination(pot.destinationId)!;
      const guard = guardPayout(cents, destination.id, plannedToday);
      if (guard.status === "queued") plannedToday += cents;
      insert.run(
        paymentId, pot.key, pot.name, pot.purpose, pot.reason, cents, "payout",
        destination.id, destination.email, guard.status, guard.holdReason, now, now,
      );
    }
    return true;
  });

  if (divided) await sendQueued({ paymentId });
  refreshPaymentStatus(paymentId);
  payment = getPayment(paymentId)!;
  return payment;
}

// ---------- payout batches ----------

function newBatch(owner: { paymentId?: number; spendId?: number }, partIds: number[]): Batch {
  return tx(() => {
    const ownerCol = owner.paymentId ? "payment_id" : "spend_id";
    const ownerId = owner.paymentId ?? owner.spendId!;
    const seq = Number(
      (getDb().prepare(`SELECT COUNT(*) AS n FROM batches WHERE ${ownerCol} = ?`).get(ownerId) as Row).n,
    ) + 1;
    // Derived from the payment, never random: the same payment always maps to the same request.
    // The install ID keeps two databases on one PayPal account from sharing request IDs.
    const install = getInstallId();
    const requestId = owner.paymentId
      ? `portion-${install}-pay-${ownerId}-${seq}`
      : `portion-${install}-spend-${ownerId}-${seq}`;
    const info = getDb()
      .prepare(`INSERT INTO batches (request_id, ${ownerCol}, state, created_at) VALUES (?, ?, 'created', ?)`)
      .run(requestId, ownerId, nowIso());
    const batchId = Number(info.lastInsertRowid);
    const assign = getDb().prepare("UPDATE parts SET batch_id = ?, updated_at = ? WHERE id = ? AND batch_id IS NULL");
    for (const id of partIds) assign.run(batchId, nowIso(), id);
    return getBatch(batchId)!;
  });
}

/** Puts every queued part without a batch into one new batch and posts it. Also retries unsure posts. */
export async function sendQueued(owner: { paymentId?: number; spendId?: number }): Promise<void> {
  const parts = owner.paymentId ? partsForPayment(owner.paymentId) : partsForSpend(owner.spendId!);
  const fresh = parts.filter((p) => p.status === "queued" && p.batchId === null);
  if (fresh.length) newBatch(owner, fresh.map((p) => p.id));

  const ownerCol = owner.paymentId ? "payment_id" : "spend_id";
  const ownerId = owner.paymentId ?? owner.spendId!;
  const pending = (getDb()
    .prepare(`SELECT * FROM batches WHERE ${ownerCol} = ? AND state IN ('created','unknown') ORDER BY id`)
    .all(ownerId) as Row[]).map(toBatch);
  for (const batch of pending) await postBatch(batch.id);
}

export async function postBatch(batchId: number): Promise<Batch> {
  const batch = getBatch(batchId);
  if (!batch || (batch.state !== "created" && batch.state !== "unknown")) return batch!;
  const parts = (getDb().prepare("SELECT * FROM parts WHERE batch_id = ? ORDER BY id").all(batchId) as Row[]).map(toPart);
  if (parts.length === 0) {
    getDb().prepare("UPDATE batches SET state = 'rejected', error = 'No parts' WHERE id = ?").run(batchId);
    return getBatch(batchId)!;
  }
  // Code checks the parts it is about to send add up to what was planned for them.
  const total = parts.reduce((s, p) => s + p.cents, 0);
  if (parts.some((p) => p.cents <= 0 || !p.receiverEmail) || total <= 0) {
    getDb().prepare("UPDATE batches SET state = 'rejected', error = 'Invalid parts' WHERE id = ?").run(batchId);
    return getBatch(batchId)!;
  }

  getDb().prepare("UPDATE batches SET attempts = attempts + 1 WHERE id = ?").run(batchId);
  const cur = parts[0]?.paymentId ? (getPayment(parts[0].paymentId!)?.currency ?? currency()) : currency();
  try {
    const created = await getGateway().createPayout({
      requestId: batch.requestId,
      senderBatchId: batch.requestId,
      emailSubject: "You have a payment",
      emailMessage: "This payment was sent with Portion from a PayPal sandbox account. No real money.",
      items: parts.map((p) => ({
        receiver: p.receiverEmail!,
        amount: toAmount(p.cents),
        currency: cur,
        note: `${p.potName}: ${p.purpose}`,
        senderItemId: `part-${p.id}`,
      })),
    });
    tx(() => {
      getDb()
        .prepare("UPDATE batches SET state = 'posted', payout_batch_id = ?, batch_status = ?, error = NULL WHERE id = ?")
        .run(created.payoutBatchId, created.batchStatus, batchId);
      getDb().prepare("UPDATE parts SET status = 'sent', updated_at = ? WHERE batch_id = ? AND status = 'queued'").run(nowIso(), batchId);
    });
  } catch (err) {
    const e = err instanceof PayPalError ? err : new PayPalError(String(err), 0, "UNKNOWN", true);
    // A duplicate sender_batch_id means PayPal already has this batch: find it from the link.
    const original = e.links.find((l) => /\/v1\/payments\/payouts\/[^/?]+/.test(l.href));
    if (original) {
      const id = /\/v1\/payments\/payouts\/([^/?]+)/.exec(original.href)![1]!;
      tx(() => {
        getDb().prepare("UPDATE batches SET state = 'posted', payout_batch_id = ?, error = NULL WHERE id = ?").run(id, batchId);
        getDb().prepare("UPDATE parts SET status = 'sent', updated_at = ? WHERE batch_id = ? AND status = 'queued'").run(nowIso(), batchId);
      });
    } else if (isDuplicateBatch(e)) {
      // PayPal already has this batch (seen in the sandbox: 400 with no link back to it).
      // Never post again and never call it failed. The parts left the account.
      tx(() => {
        getDb().prepare("UPDATE batches SET state = 'posted', error = 'ALREADY_AT_PAYPAL' WHERE id = ?").run(batchId);
        getDb()
          .prepare(
            `UPDATE parts SET status = 'sent', hold_reason = 'PayPal already has this payout but did not send back its batch ID, so Portion cannot read it back. Check the sandbox account activity.', updated_at = ?
             WHERE batch_id = ? AND status = 'queued'`,
          )
          .run(nowIso(), batchId);
      });
    } else if (e.retryable) {
      // We do not know if PayPal made the batch. Retrying with the same request ID is safe.
      getDb().prepare("UPDATE batches SET state = 'unknown', error = ? WHERE id = ?").run(e.name, batchId);
    } else {
      tx(() => {
        getDb().prepare("UPDATE batches SET state = 'rejected', error = ? WHERE id = ?").run(e.name, batchId);
        getDb()
          .prepare("UPDATE parts SET status = 'failed', error = ?, updated_at = ? WHERE batch_id = ? AND status = 'queued'")
          .run(e.name, nowIso(), batchId);
      });
    }
  }
  return getBatch(batchId)!;
}

/** PayPal's reply when a sender_batch_id was already used (sandbox, 2026-11-10). */
export function isDuplicateBatch(e: PayPalError): boolean {
  return e.status === 400 && /sender_batch_id already exists|DUPLICATE/i.test(`${e.name} ${e.message}`);
}

const STATUS_MAP: Record<string, PartStatus> = {
  SUCCESS: "paid",
  PENDING: "sent",
  UNCLAIMED: "unclaimed",
  ONHOLD: "onhold",
  FAILED: "failed",
  BLOCKED: "failed",
  RETURNED: "returned",
  REFUNDED: "returned",
  REVERSED: "returned",
};

/** Reads a batch back from PayPal and updates each part on its own. */
export async function refreshBatch(batchId: number): Promise<Batch> {
  const batch = getBatch(batchId);
  if (!batch?.payoutBatchId) return batch!;
  const state = await getGateway().getPayout(batch.payoutBatchId);
  tx(() => {
    const now = nowIso();
    getDb()
      .prepare("UPDATE batches SET batch_status = ?, last_checked_at = ? WHERE id = ?")
      .run(state.batchStatus, now, batchId);
    for (const item of state.items) {
      const m = /^part-(\d+)$/.exec(item.senderItemId ?? "");
      if (!m) continue;
      const partId = Number(m[1]);
      const status = STATUS_MAP[item.transactionStatus] ?? "sent";
      let fee: number | null = null;
      if (item.feeValue) {
        try {
          fee = parseAmount(item.feeValue);
        } catch {
          fee = null;
        }
      }
      getDb()
        .prepare(
          `UPDATE parts SET status = ?, transaction_status = ?, payout_item_id = ?, transaction_id = ?, fee_cents = ?, error = ?, updated_at = ?
           WHERE id = ? AND batch_id = ?`,
        )
        .run(status, item.transactionStatus, item.payoutItemId, item.transactionId, fee, item.errorName, now, partId, batchId);
      if (status === "paid") {
        const part = toPart(getDb().prepare("SELECT * FROM parts WHERE id = ?").get(partId) as Row);
        if (part.destinationId) markDestinationApproved(part.destinationId);
      }
    }
  });
  if (batch.paymentId) refreshPaymentStatus(batch.paymentId);
  return getBatch(batchId)!;
}

/**
 * "Done" only when every part is settled and every paid-out part was read back from PayPal.
 */
export function refreshPaymentStatus(paymentId: number) {
  const payment = getPayment(paymentId);
  if (!payment || payment.seeded) return;
  if (!["paying", "done", "needs_attention", "kept"].includes(payment.status)) return;
  const parts = partsForPayment(paymentId);
  if (parts.length === 0) return;
  const problems = parts.filter((p) => PROBLEM.includes(p.status));
  const waiting = parts.filter((p) => p.status === "needs_approval");
  const held = parts.filter((p) => HELD_AT_PAYPAL.includes(p.status));
  const allSettled = parts.every((p) => TERMINAL_OK.includes(p.status));
  if (problems.length) {
    setPaymentStatus(paymentId, "needs_attention", `${problems.length} part(s) did not arrive. See below.`);
  } else if (held.length) {
    setPaymentStatus(
      paymentId,
      "paying",
      `${held.length} part(s) are waiting at PayPal. An unclaimed payout goes back to the account if nobody claims it in 30 days.`,
    );
  } else if (allSettled) {
    const anyPayout = parts.some((p) => p.kind === "payout" && p.status === "paid");
    setPaymentStatus(paymentId, anyPayout ? "done" : "kept", null);
  } else if (waiting.length) {
    setPaymentStatus(paymentId, "paying", `${waiting.length} part(s) wait for your approval.`);
  } else {
    setPaymentStatus(paymentId, "paying", "Waiting for PayPal to confirm each part.");
  }
}

// ---------- approvals ----------

export async function approvePart(partId: number): Promise<Part> {
  const part = toPart(getDb().prepare("SELECT * FROM parts WHERE id = ?").get(partId) as Row);
  if (part.status !== "needs_approval") return part;
  // The user approved this part, so its destination is approved from now on.
  if (part.destinationId) markDestinationApproved(part.destinationId);
  getDb()
    .prepare("UPDATE parts SET status = 'queued', hold_reason = NULL, updated_at = ? WHERE id = ? AND status = 'needs_approval'")
    .run(nowIso(), partId);
  await sendQueued(part.paymentId ? { paymentId: part.paymentId } : { spendId: part.spendId! });
  if (part.paymentId) refreshPaymentStatus(part.paymentId);
  return toPart(getDb().prepare("SELECT * FROM parts WHERE id = ?").get(partId) as Row);
}

/** Declining keeps the money in the account under the pot's label. */
export function declinePart(partId: number): Part {
  getDb()
    .prepare("UPDATE parts SET status = 'declined', hold_reason = 'You declined this part. The money stays in the account.', updated_at = ? WHERE id = ? AND status = 'needs_approval'")
    .run(nowIso(), partId);
  const part = toPart(getDb().prepare("SELECT * FROM parts WHERE id = ?").get(partId) as Row);
  if (part.paymentId) refreshPaymentStatus(part.paymentId);
  return part;
}

/** A failed or returned part can be kept in the account instead. The money is back with the app's account. */
export function keepFailedPart(partId: number): Part {
  getDb()
    .prepare("UPDATE parts SET status = 'declined', hold_reason = 'Did not arrive. Kept in the account under this pot.', updated_at = ? WHERE id = ? AND status IN ('failed','returned')")
    .run(nowIso(), partId);
  const part = toPart(getDb().prepare("SELECT * FROM parts WHERE id = ?").get(partId) as Row);
  if (part.paymentId) refreshPaymentStatus(part.paymentId);
  return part;
}

// ---------- background work ----------

/** Called on a timer. No webhooks: this is how Portion notices changes. */
export async function tick(): Promise<{ processed: number; refreshed: number; retried: number }> {
  let processed = 0;
  let refreshed = 0;
  let retried = 0;
  const recorded = getDb().prepare("SELECT id FROM payments WHERE status IN ('recorded','waiting_plan') AND seeded = 0").all() as Row[];
  const hasPlan = getActivePlan() !== null;
  for (const r of recorded) {
    if (!hasPlan) break;
    await processPayment(Number(r.id));
    processed += 1;
  }
  const unsure = (getDb().prepare("SELECT * FROM batches WHERE state IN ('created','unknown') AND attempts < 10").all() as Row[]).map(toBatch);
  for (const b of unsure) {
    await postBatch(b.id);
    retried += 1;
  }
  const open = (getDb()
    .prepare(
      `SELECT DISTINCT b.* FROM batches b JOIN parts p ON p.batch_id = b.id
       WHERE b.state = 'posted' AND p.status IN ('sent','unclaimed','onhold')`,
    )
    .all() as Row[]).map(toBatch);
  for (const b of open) {
    try {
      await refreshBatch(b.id);
      refreshed += 1;
    } catch {
      // Try again on the next tick.
    }
  }
  return { processed, refreshed, retried };
}
