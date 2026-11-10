import { PreviewGateway } from "./preview";
import { SandboxGateway } from "./sandbox";
import type { PayPalGateway } from "./types";

export * from "./types";

const g = globalThis as unknown as { __portionGateway?: PayPalGateway };

export function appUrl(): string {
  return (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

export function currency(): string {
  return process.env.CURRENCY?.trim() || "USD";
}

export function getGateway(): PayPalGateway {
  if (!g.__portionGateway) {
    const id = process.env.PAYPAL_CLIENT_ID?.trim();
    const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
    g.__portionGateway = id && secret ? new SandboxGateway(id, secret) : new PreviewGateway(appUrl());
  }
  return g.__portionGateway;
}

/** Tests swap in their own gateway. */
export function setGateway(gateway: PayPalGateway | undefined) {
  g.__portionGateway = gateway;
}
