import { z } from "zod";
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

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 20_000;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const linkSchema = z.object({ href: z.string(), rel: z.string() });
const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(linkSchema).default([]),
});
const moneySchema = z.object({ currency_code: z.string(), value: z.string() });
const captureSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: moneySchema,
  create_time: z.string().optional(),
});
const capturedOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  payer: z
    .object({
      email_address: z.string().optional(),
      name: z.object({ given_name: z.string().optional(), surname: z.string().optional() }).optional(),
    })
    .optional(),
  payment_source: z
    .object({
      paypal: z
        .object({
          email_address: z.string().optional(),
          name: z.object({ given_name: z.string().optional(), surname: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
  purchase_units: z
    .array(z.object({ payments: z.object({ captures: z.array(captureSchema).optional() }).optional() }))
    .default([]),
});
const payoutCreatedSchema = z.object({
  batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }),
});
const payoutBatchSchema = z.object({
  batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }),
  items: z
    .array(
      z.object({
        payout_item_id: z.string().optional(),
        transaction_id: z.string().optional(),
        transaction_status: z.string().optional(),
        payout_item_fee: moneySchema.or(z.object({ currency: z.string(), value: z.string() })).optional(),
        payout_item: z.object({ sender_item_id: z.string().optional() }).optional(),
        errors: z.object({ name: z.string().optional() }).optional(),
      }),
    )
    .default([]),
});
const errorSchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  debug_id: z.string().optional(),
  details: z.array(z.object({ issue: z.string().optional() })).optional(),
  links: z.array(linkSchema).optional(),
});

export class SandboxGateway implements PayPalGateway {
  readonly mode = "sandbox" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly base = SANDBOX_BASE,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await this.send(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = tokenSchema.parse(await res.json());
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch (err) {
      // Network failure or timeout: the request may or may not have reached PayPal.
      throw new PayPalError(`PayPal did not answer: ${(err as Error).name}`, 0, "NETWORK", true);
    }
    if (res.ok) return res;
    let parsed: z.infer<typeof errorSchema> = {};
    try {
      parsed = errorSchema.parse(await res.json());
    } catch {
      // Body was not JSON. Keep the status only.
    }
    const issue = parsed.details?.[0]?.issue;
    const name = issue ?? parsed.name ?? `HTTP_${res.status}`;
    throw new PayPalError(
      parsed.message ?? `PayPal returned ${res.status}`,
      res.status,
      name,
      res.status >= 500 || res.status === 429,
      parsed.debug_id ?? null,
      parsed.links ?? [],
    );
  }

  private async call(path: string, init: RequestInit & { requestId?: string } = {}): Promise<unknown> {
    const token = await this.accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
    const res = await this.send(`${this.base}${path}`, { ...init, headers });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: input.currency, value: input.amount },
          description: input.description.slice(0, 127),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Portion",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    };
    const order = orderSchema.parse(
      await this.call("/v2/checkout/orders", { method: "POST", body: JSON.stringify(body), requestId: input.requestId }),
    );
    const link = order.links.find((l) => l.rel === "payer-action") ?? order.links.find((l) => l.rel === "approve");
    if (!link) throw new PayPalError("PayPal gave no approval link", 0, "NO_APPROVE_LINK", false);
    return { orderId: order.id, approveUrl: link.href };
  }

  async captureOrder(orderId: string): Promise<CapturedPayment> {
    let raw: unknown;
    try {
      raw = await this.call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        requestId: `portion-capture-${orderId}`,
      });
    } catch (err) {
      // A second capture of the same order: read the order instead of failing.
      if (err instanceof PayPalError && err.name === "ORDER_ALREADY_CAPTURED") {
        raw = await this.call(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
      } else throw err;
    }
    const order = capturedOrderSchema.parse(raw);
    const capture = order.purchase_units[0]?.payments?.captures?.[0];
    if (!capture) throw new PayPalError("Order has no capture", 0, "NO_CAPTURE", false);
    const payer = order.payer ?? order.payment_source?.paypal;
    const name = [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(" ");
    return {
      orderId: order.id,
      captureId: capture.id,
      status: capture.status,
      amount: capture.amount.value,
      currency: capture.amount.currency_code,
      payerEmail: payer?.email_address ?? null,
      payerName: name || null,
      createTime: capture.create_time ?? null,
    };
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatedPayout> {
    const body = {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        recipient_type: "EMAIL",
        email_subject: input.emailSubject,
        email_message: input.emailMessage,
      },
      items: input.items.map((item) => ({
        recipient_type: "EMAIL",
        receiver: item.receiver,
        note: item.note.slice(0, 4000),
        sender_item_id: item.senderItemId,
        amount: { currency: item.currency, value: item.amount },
      })),
    };
    const created = payoutCreatedSchema.parse(
      await this.call("/v1/payments/payouts", { method: "POST", body: JSON.stringify(body), requestId: input.requestId }),
    );
    return { payoutBatchId: created.batch_header.payout_batch_id, batchStatus: created.batch_header.batch_status };
  }

  async getPayout(payoutBatchId: string): Promise<PayoutBatchState> {
    const batch = payoutBatchSchema.parse(
      await this.call(`/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=100`, { method: "GET" }),
    );
    return {
      payoutBatchId: batch.batch_header.payout_batch_id,
      batchStatus: batch.batch_header.batch_status,
      items: batch.items.map((item) => ({
        payoutItemId: item.payout_item_id ?? null,
        transactionId: item.transaction_id ?? null,
        transactionStatus: item.transaction_status ?? "PENDING",
        senderItemId: item.payout_item?.sender_item_id ?? null,
        feeValue: item.payout_item_fee?.value ?? null,
        errorName: item.errors?.name ?? null,
      })),
    };
  }
}
