import type { PartStatus, PaymentStatus } from "./repo";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export function monthTitle(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const PART_LABEL: Record<PartStatus, string> = {
  kept: "Kept in account",
  needs_approval: "Waiting for you",
  queued: "Queued",
  sent: "Sent, waiting for PayPal",
  paid: "Paid",
  unclaimed: "Waiting to be claimed",
  failed: "Failed",
  returned: "Returned",
  onhold: "On hold at PayPal",
  declined: "Kept back",
};

export const PART_TONE: Record<PartStatus, "ok" | "wait" | "bad" | "plain"> = {
  kept: "plain",
  needs_approval: "wait",
  queued: "wait",
  sent: "wait",
  paid: "ok",
  unclaimed: "wait",
  failed: "bad",
  returned: "bad",
  onhold: "wait",
  declined: "plain",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  history: "Seeded history",
  recorded: "Received",
  waiting_plan: "Waiting for a plan",
  waiting_user: "Waiting for you",
  paying: "In progress",
  done: "Done",
  needs_attention: "Needs attention",
  kept: "Done, all kept",
};

export const PAYMENT_TONE: Record<PaymentStatus, "ok" | "wait" | "bad" | "plain"> = {
  history: "plain",
  recorded: "wait",
  waiting_plan: "wait",
  waiting_user: "wait",
  paying: "wait",
  done: "ok",
  needs_attention: "bad",
  kept: "ok",
};

/** Pot colours for the divide strip. Muted, one per pot position. */
export const POT_COLORS = ["#3d7a5c", "#c08a3e", "#4f6f8f", "#a85d4a", "#7a6a9a", "#5f8a8b", "#8a7d55", "#6b6b6b"];
export function potColor(index: number): string {
  return POT_COLORS[index % POT_COLORS.length]!;
}
