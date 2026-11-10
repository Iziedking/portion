import { getDb, nowIso, tx } from "./db";
import { potKey, validatePlan, type KnownDestination, type PotDraft } from "./plan";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

// ---------- settings ----------

export interface Limits {
  perPaymentLimitCents: number;
  dailyLimitCents: number;
}

const DEFAULT_LIMITS: Limits = { perPaymentLimitCents: 50_000, dailyLimitCents: 100_000 };

export function getLimits(): Limits {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as Row[];
  const map = new Map(rows.map((r) => [String(r.key), String(r.value)]));
  return {
    perPaymentLimitCents: Number(map.get("per_payment_limit_cents") ?? DEFAULT_LIMITS.perPaymentLimitCents),
    dailyLimitCents: Number(map.get("daily_limit_cents") ?? DEFAULT_LIMITS.dailyLimitCents),
  };
}

export function setLimits(limits: Limits) {
  for (const [k, v] of [
    ["per_payment_limit_cents", limits.perPaymentLimitCents],
    ["daily_limit_cents", limits.dailyLimitCents],
  ] as const) {
    if (!Number.isSafeInteger(v) || v <= 0) throw new Error("Limits must be above 0.");
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(k, String(v));
  }
}

// ---------- destinations ----------

export interface Destination extends KnownDestination {
  createdAt: string;
  approvedAt: string | null;
}

function toDestination(r: Row): Destination {
  return {
    id: num(r.id),
    label: String(r.label),
    email: String(r.email),
    approved: num(r.approved) === 1,
    createdAt: String(r.created_at),
    approvedAt: str(r.approved_at),
  };
}

export function listDestinations(): Destination[] {
  return (getDb().prepare("SELECT * FROM destinations ORDER BY id").all() as Row[]).map(toDestination);
}

export function getDestination(id: number): Destination | null {
  const r = getDb().prepare("SELECT * FROM destinations WHERE id = ?").get(id) as Row | undefined;
  return r ? toDestination(r) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only the user can call this, from the destinations form. The AI has no path here. */
export function addDestination(label: string, email: string): Destination {
  const cleanEmail = email.trim().toLowerCase();
  const cleanLabel = label.trim();
  if (!cleanLabel || cleanLabel.length > 40) throw new Error("Give the destination a short name.");
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 127) throw new Error("That is not a valid email.");
  const existing = getDb().prepare("SELECT * FROM destinations WHERE email = ?").get(cleanEmail) as Row | undefined;
  if (existing) throw new Error("That email is already a destination.");
  const info = getDb()
    .prepare("INSERT INTO destinations (label, email, approved, created_at) VALUES (?, ?, 0, ?)")
    .run(cleanLabel, cleanEmail, nowIso());
  return getDestination(num(info.lastInsertRowid))!;
}

export function markDestinationApproved(id: number) {
  getDb()
    .prepare("UPDATE destinations SET approved = 1, approved_at = COALESCE(approved_at, ?) WHERE id = ?")
    .run(nowIso(), id);
}

// ---------- plans ----------

export type PlanSource = "user" | "ai" | "preview";

export interface Pot extends PotDraft {
  id: number;
  key: string;
  position: number;
}

export interface Plan {
  id: number;
  status: "draft" | "approved" | "retired";
  source: PlanSource;
  userWords: string | null;
  summary: string | null;
  savingsNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  pots: Pot[];
}

function loadPots(planId: number): Pot[] {
  const rows = getDb().prepare("SELECT * FROM pots WHERE plan_id = ? ORDER BY position").all(planId) as Row[];
  return rows.map((r) => ({
    id: num(r.id),
    key: String(r.pot_key),
    position: num(r.position),
    name: String(r.name),
    purpose: String(r.purpose),
    shareKind: String(r.share_kind) as Pot["shareKind"],
    shareBps: num(r.share_bps),
    fixedCents: num(r.fixed_cents),
    destinationId: r.destination_id === null ? null : num(r.destination_id),
    reason: String(r.reason),
  }));
}

function toPlan(r: Row): Plan {
  return {
    id: num(r.id),
    status: String(r.status) as Plan["status"],
    source: String(r.source) as PlanSource,
    userWords: str(r.user_words),
    summary: str(r.summary),
    savingsNote: str(r.savings_note),
    createdAt: String(r.created_at),
    approvedAt: str(r.approved_at),
    pots: loadPots(num(r.id)),
  };
}

export function getPlan(id: number): Plan | null {
  const r = getDb().prepare("SELECT * FROM plans WHERE id = ?").get(id) as Row | undefined;
  return r ? toPlan(r) : null;
}

export function getActivePlan(): Plan | null {
  const r = getDb().prepare("SELECT * FROM plans WHERE status = 'approved' ORDER BY approved_at DESC LIMIT 1").get() as
    | Row
    | undefined;
  return r ? toPlan(r) : null;
}

export function getLatestDraft(): Plan | null {
  const r = getDb().prepare("SELECT * FROM plans WHERE status = 'draft' ORDER BY id DESC LIMIT 1").get() as
    | Row
    | undefined;
  return r ? toPlan(r) : null;
}

export class PlanInvalidError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
  }
}

function writePots(planId: number, pots: readonly PotDraft[]) {
  const db = getDb();
  db.prepare("DELETE FROM pots WHERE plan_id = ?").run(planId);
  const insert = db.prepare(
    `INSERT INTO pots (plan_id, position, pot_key, name, purpose, share_kind, share_bps, fixed_cents, destination_id, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  pots.forEach((p, i) =>
    insert.run(
      planId,
      i,
      potKey(p.name),
      p.name.trim(),
      p.purpose.trim(),
      p.shareKind,
      p.shareKind === "percent" ? p.shareBps : 0,
      p.shareKind === "fixed" ? p.fixedCents : 0,
      p.destinationId,
      p.reason.trim(),
    ),
  );
}

/** Saves a draft. It is checked here, so an invalid plan never reaches the screen or the engine. */
export function saveDraft(input: {
  source: PlanSource;
  pots: PotDraft[];
  userWords?: string | null;
  summary?: string | null;
  savingsNote?: string | null;
}): Plan {
  const problems = validatePlan(input.pots, listDestinations());
  if (problems.length) throw new PlanInvalidError(problems);
  return tx(() => {
    getDb().prepare("DELETE FROM plans WHERE status = 'draft'").run();
    const info = getDb()
      .prepare("INSERT INTO plans (status, source, user_words, summary, savings_note, created_at) VALUES ('draft', ?, ?, ?, ?, ?)")
      .run(input.source, input.userWords ?? null, input.summary ?? null, input.savingsNote ?? null, nowIso());
    const id = num(info.lastInsertRowid);
    writePots(id, input.pots);
    return getPlan(id)!;
  });
}

/** Nothing runs until this is called from the user's approve button. */
export function approvePlan(planId: number): Plan {
  return tx(() => {
    const plan = getPlan(planId);
    if (!plan || plan.status !== "draft") throw new Error("Only a draft plan can be approved.");
    const problems = validatePlan(plan.pots, listDestinations());
    if (problems.length) throw new PlanInvalidError(problems);
    const now = nowIso();
    getDb().prepare("UPDATE plans SET status = 'retired' WHERE status = 'approved'").run();
    getDb().prepare("UPDATE plans SET status = 'approved', approved_at = ? WHERE id = ?").run(now, planId);
    return getPlan(planId)!;
  });
}

// ---------- payments ----------

export type PaymentStatus =
  | "history"
  | "recorded"
  | "waiting_plan"
  | "waiting_user"
  | "paying"
  | "done"
  | "needs_attention"
  | "kept";

export interface Payment {
  id: number;
  captureId: string;
  orderId: string | null;
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  payerName: string | null;
  note: string;
  receivedAt: string;
  seeded: boolean;
  status: PaymentStatus;
  statusReason: string | null;
  planId: number | null;
  checkSource: string | null;
  checkReason: string | null;
}

function toPayment(r: Row): Payment {
  return {
    id: num(r.id),
    captureId: String(r.capture_id),
    orderId: str(r.order_id),
    amountCents: num(r.amount_cents),
    currency: String(r.currency),
    payerEmail: str(r.payer_email),
    payerName: str(r.payer_name),
    note: String(r.note),
    receivedAt: String(r.received_at),
    seeded: num(r.seeded) === 1,
    status: String(r.status) as PaymentStatus,
    statusReason: str(r.status_reason),
    planId: r.plan_id === null ? null : num(r.plan_id),
    checkSource: str(r.check_source),
    checkReason: str(r.check_reason),
  };
}

export function getPayment(id: number): Payment | null {
  const r = getDb().prepare("SELECT * FROM payments WHERE id = ?").get(id) as Row | undefined;
  return r ? toPayment(r) : null;
}

export function listPayments(opts: { includeSeeded?: boolean } = {}): Payment[] {
  const sql = opts.includeSeeded === false
    ? "SELECT * FROM payments WHERE seeded = 0 ORDER BY received_at DESC"
    : "SELECT * FROM payments ORDER BY received_at DESC";
  return (getDb().prepare(sql).all() as Row[]).map(toPayment);
}

/** Records a captured payment once. A second call with the same capture ID returns the first record. */
export function recordPayment(input: {
  captureId: string;
  orderId: string | null;
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  payerName: string | null;
  note: string;
  receivedAt: string;
  seeded?: boolean;
}): { payment: Payment; isNew: boolean } {
  const existing = getDb().prepare("SELECT * FROM payments WHERE capture_id = ?").get(input.captureId) as Row | undefined;
  if (existing) return { payment: toPayment(existing), isNew: false };
  const info = getDb()
    .prepare(
      `INSERT INTO payments (capture_id, order_id, amount_cents, currency, payer_email, payer_name, note, received_at, seeded, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.captureId,
      input.orderId,
      input.amountCents,
      input.currency,
      input.payerEmail,
      input.payerName,
      input.note.slice(0, 500),
      input.receivedAt,
      input.seeded ? 1 : 0,
      input.seeded ? "history" : "recorded",
    );
  return { payment: getPayment(num(info.lastInsertRowid))!, isNew: true };
}

export function setPaymentStatus(id: number, status: PaymentStatus, reason: string | null = null) {
  getDb().prepare("UPDATE payments SET status = ?, status_reason = ? WHERE id = ?").run(status, reason, id);
}

// ---------- parts ----------

export type PartStatus =
  | "kept"
  | "needs_approval"
  | "queued"
  | "sent"
  | "paid"
  | "unclaimed"
  | "failed"
  | "returned"
  | "onhold"
  | "declined";

export interface Part {
  id: number;
  paymentId: number | null;
  spendId: number | null;
  potKey: string;
  potName: string;
  purpose: string;
  reason: string;
  cents: number;
  kind: "keep" | "payout";
  destinationId: number | null;
  receiverEmail: string | null;
  status: PartStatus;
  holdReason: string | null;
  batchId: number | null;
  payoutItemId: string | null;
  transactionId: string | null;
  transactionStatus: string | null;
  feeCents: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPart(r: Row): Part {
  return {
    id: num(r.id),
    paymentId: r.payment_id === null ? null : num(r.payment_id),
    spendId: r.spend_id === null ? null : num(r.spend_id),
    potKey: String(r.pot_key),
    potName: String(r.pot_name),
    purpose: String(r.purpose),
    reason: String(r.reason),
    cents: num(r.cents),
    kind: String(r.kind) as Part["kind"],
    destinationId: r.destination_id === null ? null : num(r.destination_id),
    receiverEmail: str(r.receiver_email),
    status: String(r.status) as PartStatus,
    holdReason: str(r.hold_reason),
    batchId: r.batch_id === null ? null : num(r.batch_id),
    payoutItemId: str(r.payout_item_id),
    transactionId: str(r.transaction_id),
    transactionStatus: str(r.transaction_status),
    feeCents: r.fee_cents === null ? null : num(r.fee_cents),
    error: str(r.error),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function partsForPayment(paymentId: number): Part[] {
  return (getDb().prepare("SELECT * FROM parts WHERE payment_id = ? ORDER BY id").all(paymentId) as Row[]).map(toPart);
}

export function partsForSpend(spendId: number): Part[] {
  return (getDb().prepare("SELECT * FROM parts WHERE spend_id = ? ORDER BY id").all(spendId) as Row[]).map(toPart);
}

export function getPart(id: number): Part | null {
  const r = getDb().prepare("SELECT * FROM parts WHERE id = ?").get(id) as Row | undefined;
  return r ? toPart(r) : null;
}

export function partsWaitingApproval(): Part[] {
  return (getDb().prepare("SELECT * FROM parts WHERE status = 'needs_approval' ORDER BY id").all() as Row[]).map(toPart);
}

export function allParts(): Part[] {
  return (getDb().prepare("SELECT * FROM parts ORDER BY id DESC").all() as Row[]).map(toPart);
}

// ---------- batches ----------

export interface Batch {
  id: number;
  requestId: string;
  paymentId: number | null;
  spendId: number | null;
  payoutBatchId: string | null;
  state: "created" | "posted" | "unknown" | "rejected";
  batchStatus: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  lastCheckedAt: string | null;
}

export function toBatch(r: Row): Batch {
  return {
    id: num(r.id),
    requestId: String(r.request_id),
    paymentId: r.payment_id === null ? null : num(r.payment_id),
    spendId: r.spend_id === null ? null : num(r.spend_id),
    payoutBatchId: str(r.payout_batch_id),
    state: String(r.state) as Batch["state"],
    batchStatus: str(r.batch_status),
    error: str(r.error),
    attempts: num(r.attempts),
    createdAt: String(r.created_at),
    lastCheckedAt: str(r.last_checked_at),
  };
}

export function getBatch(id: number): Batch | null {
  const r = getDb().prepare("SELECT * FROM batches WHERE id = ?").get(id) as Row | undefined;
  return r ? toBatch(r) : null;
}

export function batchesForPayment(paymentId: number): Batch[] {
  return (getDb().prepare("SELECT * FROM batches WHERE payment_id = ? ORDER BY id").all(paymentId) as Row[]).map(toBatch);
}

export function countBatches(): number {
  return num((getDb().prepare("SELECT COUNT(*) AS n FROM batches").get() as Row).n);
}
