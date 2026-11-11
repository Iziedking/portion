import { formatMoney } from "./money";
import type { Batch, Part, Payment } from "./repo";

/** One step of the money trail: how far a payment has got, read from what is stored, never assumed. */
export type StepState = "done" | "current" | "todo" | "bad" | "skip";

export interface TrailStep {
  key: "received" | "checked" | "split" | "sent" | "confirmed";
  label: string;
  state: StepState;
  detail: string;
  ids: string[];
}

const WAITING: Part["status"][] = ["sent", "queued", "unclaimed", "onhold"];

export function paymentTrail(payment: Payment, parts: Part[], batches: Batch[]): TrailStep[] {
  const payouts = parts.filter((p) => p.kind === "payout");
  const total = parts.reduce((s, p) => s + p.cents, 0);

  const received: TrailStep = {
    key: "received",
    label: "Received",
    state: "done",
    detail: payment.seeded ? "Seeded history, not a PayPal payment" : "PayPal captured it",
    ids: [payment.orderId ? `Order ${payment.orderId}` : null, `Capture ${payment.captureId}`].filter((x): x is string => x !== null),
  };

  let checked: TrailStep;
  if (payment.status === "waiting_plan") {
    checked = { key: "checked", label: "Checked", state: "current", detail: "Waiting for an approved plan", ids: [] };
  } else if (payment.status === "waiting_user") {
    checked = { key: "checked", label: "Checked", state: "current", detail: "Waiting for you to confirm it is income", ids: [] };
  } else if (payment.status === "recorded") {
    checked = { key: "checked", label: "Checked", state: "current", detail: "Being checked now", ids: [] };
  } else {
    const who = payment.checkSource === "ai" ? "AI agent" : payment.checkSource === "user" ? "You" : "Fixed rules";
    checked = {
      key: "checked",
      label: "Checked",
      state: "done",
      detail: payment.checkSource === "user" ? "You confirmed it is income" : `${who}: follow the plan`,
      ids: payment.checkReason ? [payment.checkReason] : [],
    };
  }

  const split: TrailStep = parts.length
    ? { key: "split", label: "Split", state: "done", detail: `${parts.length} parts, whole cents`, ids: [`Adds up to ${formatMoney(total, payment.currency)}`] }
    : { key: "split", label: "Split", state: "todo", detail: "Not divided yet", ids: [] };

  let sent: TrailStep;
  let confirmed: TrailStep;
  if (!parts.length) {
    sent = { key: "sent", label: "Sent", state: "todo", detail: "Nothing sent yet", ids: [] };
    confirmed = { key: "confirmed", label: "Confirmed", state: "todo", detail: "Nothing to confirm yet", ids: [] };
  } else if (!payouts.length) {
    sent = { key: "sent", label: "Sent", state: "skip", detail: "Nothing to send, every part is kept", ids: [] };
    confirmed = { key: "confirmed", label: "Confirmed", state: "skip", detail: "Kept in the account", ids: [] };
  } else {
    const posted = batches.filter((b) => b.payoutBatchId);
    const unsure = batches.some((b) => b.state === "unknown");
    const approvals = payouts.filter((p) => p.status === "needs_approval").length;
    const declined = payouts.filter((p) => p.status === "declined").length;
    if (approvals) {
      sent = { key: "sent", label: "Sent", state: "current", detail: `${approvals} waiting for your approval`, ids: [] };
    } else if (unsure && !posted.length) {
      sent = { key: "sent", label: "Sent", state: "current", detail: "Retrying with the same request ID", ids: batches.map((b) => `Request ${b.requestId}`) };
    } else if (posted.length) {
      sent = {
        key: "sent",
        label: "Sent",
        state: "done",
        detail: posted.length === 1 ? "One PayPal payout batch" : `${posted.length} PayPal payout batches`,
        ids: posted.flatMap((b) => [`Batch ${b.payoutBatchId}`, `Request ${b.requestId}`]),
      };
    } else if (declined === payouts.length) {
      sent = { key: "sent", label: "Sent", state: "skip", detail: "You kept these parts back", ids: [] };
    } else {
      sent = { key: "sent", label: "Sent", state: "current", detail: "Sending to PayPal", ids: [] };
    }

    const live = payouts.filter((p) => p.status !== "declined");
    const failed = live.filter((p) => p.status === "failed" || p.status === "returned");
    const paid = live.filter((p) => p.status === "paid");
    const waiting = live.filter((p) => WAITING.includes(p.status));
    const fee = paid.reduce((s, p) => s + (p.feeCents ?? 0), 0);
    const ids = paid.flatMap((p) => (p.payoutItemId ? [`Item ${p.payoutItemId}`] : []));
    if (paid.some((p) => p.feeCents !== null)) ids.push(`Fee read from PayPal ${formatMoney(fee, payment.currency)}`);
    if (failed.length) {
      confirmed = { key: "confirmed", label: "Confirmed", state: "bad", detail: `PayPal could not pay ${failed.length} part${failed.length === 1 ? "" : "s"}`, ids };
    } else if (!live.length) {
      confirmed = { key: "confirmed", label: "Confirmed", state: "skip", detail: "Nothing went out", ids: [] };
    } else if (paid.length === live.length) {
      confirmed = { key: "confirmed", label: "Confirmed", state: "done", detail: "PayPal says paid", ids };
    } else if (waiting.some((p) => p.status === "unclaimed")) {
      confirmed = { key: "confirmed", label: "Confirmed", state: "current", detail: "Waiting to be claimed at PayPal", ids };
    } else if (sent.state === "done") {
      confirmed = { key: "confirmed", label: "Confirmed", state: "current", detail: "Waiting for PayPal", ids };
    } else {
      confirmed = { key: "confirmed", label: "Confirmed", state: "todo", detail: "After PayPal pays it", ids: [] };
    }
  }
  return [received, checked, split, sent, confirmed];
}

/** Five-step trail for one part, for the ledger rows. */
export function partTrail(part: Part): StepState[] {
  if (part.kind === "keep" || part.status === "kept" || part.status === "declined") {
    return ["done", "done", "done", "skip", "skip"];
  }
  switch (part.status) {
    case "paid":
      return ["done", "done", "done", "done", "done"];
    case "failed":
    case "returned":
      return ["done", "done", "done", "done", "bad"];
    case "needs_approval":
      return ["done", "done", "done", "current", "todo"];
    case "queued":
      return ["done", "done", "done", "current", "todo"];
    default:
      return ["done", "done", "done", "done", "current"];
  }
}
