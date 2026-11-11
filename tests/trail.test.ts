import { describe, expect, it } from "vitest";
import type { Batch, Part, Payment } from "@/lib/repo";
import { partTrail, paymentTrail } from "@/lib/trail";

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 1,
  captureId: "CAP1",
  orderId: "ORD1",
  amountCents: 100_000,
  currency: "USD",
  payerEmail: null,
  payerName: "Client",
  note: "",
  receivedAt: "2026-11-10T10:00:00.000Z",
  seeded: false,
  status: "done",
  statusReason: null,
  planId: 1,
  checkSource: "ai",
  checkReason: "Client work",
  ...over,
});

const part = (over: Partial<Part> = {}): Part => ({
  id: 1,
  paymentId: 1,
  spendId: null,
  potKey: "tax",
  potName: "Tax",
  purpose: "",
  reason: "",
  cents: 50_000,
  kind: "keep",
  destinationId: null,
  receiverEmail: null,
  status: "kept",
  holdReason: null,
  batchId: null,
  payoutItemId: null,
  transactionId: null,
  transactionStatus: null,
  feeCents: null,
  error: null,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 1,
  requestId: "portion-pay-1-1",
  paymentId: 1,
  spendId: null,
  payoutBatchId: "B1",
  state: "posted",
  batchStatus: "SUCCESS",
  error: null,
  attempts: 1,
  createdAt: "",
  lastCheckedAt: null,
  ...over,
});

const states = (s: ReturnType<typeof paymentTrail>) => s.map((x) => x.state);

describe("money trail", () => {
  it("shows every step done once PayPal confirms the payout", () => {
    const parts = [part(), part({ id: 2, kind: "payout", status: "paid", cents: 50_000, payoutItemId: "IT1", feeCents: 25 })];
    const steps = paymentTrail(payment(), parts, [batch()]);
    expect(states(steps)).toEqual(["done", "done", "done", "done", "done"]);
    expect(steps[4]!.ids).toContain("Fee read from PayPal $0.25");
    expect(steps[2]!.ids[0]).toBe("Adds up to $1,000.00");
  });

  it("waits at the check when the AI agent was unsure", () => {
    const steps = paymentTrail(payment({ status: "waiting_user" }), [], []);
    expect(states(steps)).toEqual(["done", "current", "todo", "todo", "todo"]);
  });

  it("an unclaimed payout is waiting, not failed", () => {
    const parts = [part({ kind: "payout", status: "unclaimed" })];
    const steps = paymentTrail(payment({ status: "paying" }), parts, [batch()]);
    expect(steps[4]!.state).toBe("current");
    expect(steps[4]!.detail).toContain("claimed");
  });

  it("a failed part marks the last step bad", () => {
    const parts = [part({ kind: "payout", status: "failed" })];
    expect(paymentTrail(payment({ status: "needs_attention" }), parts, [batch()])[4]!.state).toBe("bad");
  });

  it("a new destination holds the payout at Sent until approved", () => {
    const parts = [part({ kind: "payout", status: "needs_approval" })];
    const steps = paymentTrail(payment({ status: "paying" }), parts, []);
    expect(steps[3]!.state).toBe("current");
    expect(steps[3]!.detail).toContain("approval");
  });

  it("a payment that is all kept skips sending", () => {
    expect(states(paymentTrail(payment({ status: "kept" }), [part()], []))).toEqual(["done", "done", "done", "skip", "skip"]);
  });

  it("part dots follow the part status", () => {
    expect(partTrail(part({ kind: "payout", status: "paid" }))).toEqual(["done", "done", "done", "done", "done"]);
    expect(partTrail(part())).toEqual(["done", "done", "done", "skip", "skip"]);
  });
});
