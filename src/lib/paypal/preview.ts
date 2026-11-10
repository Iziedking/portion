import { randomUUID } from "node:crypto";
import {
  PayPalError,
  type CapturedPayment,
  type CreateOrderInput,
  type CreatedOrder,
  type CreatedPayout,
  type CreatePayoutInput,
  type PayoutBatchState,
  type PayPalGateway,
} from "./types";

/**
 * Preview mode: a local stand-in for PayPal so the app runs with no keys.
 * Nothing here touches PayPal. The app labels every screen "preview" in this mode.
 *
 * Receiver rules, so failure handling can be shown:
 *   *@fail.example       -> FAILED
 *   *@unclaimed.example  -> UNCLAIMED
 *   anything else        -> PENDING on create, SUCCESS on first read
 */
interface PreviewOrder {
  id: string;
  amount: string;
  currency: string;
  approved: boolean;
  capture: CapturedPayment | null;
}
interface PreviewBatch {
  id: string;
  reads: number;
  items: { senderItemId: string; receiver: string; amount: string; payoutItemId: string }[];
}
interface PreviewState {
  orders: Map<string, PreviewOrder>;
  batchesByRequest: Map<string, PreviewBatch>;
  batches: Map<string, PreviewBatch>;
  failNextPayoutPost: number;
  payoutPosts: number;
}

const g = globalThis as unknown as { __portionPreview?: PreviewState };
function state(): PreviewState {
  g.__portionPreview ??= {
    orders: new Map(),
    batchesByRequest: new Map(),
    batches: new Map(),
    failNextPayoutPost: 0,
    payoutPosts: 0,
  };
  return g.__portionPreview;
}

export function resetPreviewState() {
  delete g.__portionPreview;
}

/** Test hook: make the next N payout posts fail with a network error after PayPal "received" them. */
export function failNextPayoutPosts(n: number) {
  state().failNextPayoutPost = n;
}

export function previewPayoutPostCount(): number {
  return state().payoutPosts;
}

export function approvePreviewOrder(orderId: string): boolean {
  const order = state().orders.get(orderId);
  if (!order) return false;
  order.approved = true;
  return true;
}

function shortId(prefix: string) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 13).toUpperCase()}`;
}

export class PreviewGateway implements PayPalGateway {
  readonly mode = "preview" as const;
  constructor(private readonly appUrl: string) {}

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const id = shortId("PREVIEW-ORDER-");
    state().orders.set(id, { id, amount: input.amount, currency: input.currency, approved: false, capture: null });
    return { orderId: id, approveUrl: `${this.appUrl}/pay/preview-approve?token=${encodeURIComponent(id)}` };
  }

  async captureOrder(orderId: string): Promise<CapturedPayment> {
    const order = state().orders.get(orderId);
    if (!order) throw new PayPalError("Unknown order", 404, "RESOURCE_NOT_FOUND", false);
    if (!order.approved) throw new PayPalError("Payer has not approved", 422, "ORDER_NOT_APPROVED", false);
    order.capture ??= {
      orderId,
      captureId: shortId("PREVIEW-CAP-"),
      status: "COMPLETED",
      amount: order.amount,
      currency: order.currency,
      payerEmail: "client@preview.example",
      payerName: "Preview client",
      createTime: new Date().toISOString(),
    };
    return order.capture;
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatedPayout> {
    const s = state();
    s.payoutPosts += 1;
    let batch = s.batchesByRequest.get(input.requestId);
    if (!batch) {
      batch = {
        id: shortId("PREVIEW-BATCH-"),
        reads: 0,
        items: input.items.map((item) => ({
          senderItemId: item.senderItemId,
          receiver: item.receiver,
          amount: item.amount,
          payoutItemId: shortId("PREVIEW-ITEM-"),
        })),
      };
      s.batchesByRequest.set(input.requestId, batch);
      s.batches.set(batch.id, batch);
    }
    if (s.failNextPayoutPost > 0) {
      s.failNextPayoutPost -= 1;
      throw new PayPalError("Simulated timeout", 0, "NETWORK", true);
    }
    return { payoutBatchId: batch.id, batchStatus: "PENDING" };
  }

  async getPayout(payoutBatchId: string): Promise<PayoutBatchState> {
    const batch = state().batches.get(payoutBatchId);
    if (!batch) throw new PayPalError("Unknown batch", 404, "RESOURCE_NOT_FOUND", false);
    batch.reads += 1;
    const items = batch.items.map((item) => {
      const receiver = item.receiver.toLowerCase();
      const transactionStatus = receiver.endsWith("@fail.example")
        ? "FAILED"
        : receiver.endsWith("@unclaimed.example")
          ? "UNCLAIMED"
          : "SUCCESS";
      return {
        payoutItemId: item.payoutItemId,
        transactionId: transactionStatus === "SUCCESS" ? shortId("PREVIEW-TX-") : null,
        transactionStatus,
        senderItemId: item.senderItemId,
        feeValue: null,
        errorName: transactionStatus === "FAILED" ? "RECEIVER_UNREGISTERED" : null,
      };
    });
    return { payoutBatchId, batchStatus: "SUCCESS", items };
  }
}
