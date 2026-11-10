// The one seam between Portion and PayPal. Business code only sees these types.
// Field names follow PayPal's OpenAPI schemas for Orders v2 and Payouts v1,
// read from developer.paypal.com on 2026-11-10.

export type GatewayMode = "sandbox" | "preview";

export interface CreateOrderInput {
  amount: string; // "120.00"
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
}

export interface CreatedOrder {
  orderId: string;
  approveUrl: string;
}

export interface CapturedPayment {
  orderId: string;
  captureId: string;
  status: string; // COMPLETED, PENDING, DECLINED, ...
  amount: string;
  currency: string;
  payerEmail: string | null;
  payerName: string | null;
  createTime: string | null;
}

export interface PayoutItemInput {
  receiver: string;
  amount: string;
  currency: string;
  note: string;
  senderItemId: string;
}

export interface CreatePayoutInput {
  requestId: string;
  senderBatchId: string;
  emailSubject: string;
  emailMessage: string;
  items: PayoutItemInput[];
}

export interface CreatedPayout {
  payoutBatchId: string;
  batchStatus: string;
}

export interface PayoutItemState {
  payoutItemId: string | null;
  transactionId: string | null;
  transactionStatus: string; // SUCCESS, FAILED, PENDING, UNCLAIMED, RETURNED, ONHOLD, BLOCKED, REFUNDED, REVERSED
  senderItemId: string | null;
  feeValue: string | null;
  errorName: string | null;
}

export interface PayoutBatchState {
  payoutBatchId: string;
  batchStatus: string; // DENIED, PENDING, PROCESSING, SUCCESS, CANCELED
  items: PayoutItemState[];
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly name: string,
    readonly retryable: boolean,
    readonly debugId: string | null = null,
    readonly links: { href: string; rel: string }[] = [],
  ) {
    super(message);
  }
}

export interface PayPalGateway {
  readonly mode: GatewayMode;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  captureOrder(orderId: string): Promise<CapturedPayment>;
  createPayout(input: CreatePayoutInput): Promise<CreatedPayout>;
  getPayout(payoutBatchId: string): Promise<PayoutBatchState>;
}
