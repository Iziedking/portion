"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, nowIso } from "@/lib/db";
import { parseAmount, toAmount } from "@/lib/money";
import { percentToBps, type PotDraft } from "@/lib/plan";
import { proposePlan, refreshNudges, spendFromPot } from "@/lib/budget";
import { approvePart, declinePart, keepFailedPart, processPayment, refreshBatch, tick } from "@/lib/engine";
import { appUrl, currency, getGateway, PayPalError } from "@/lib/paypal";
import { approvePreviewOrder } from "@/lib/paypal/preview";
import {
  addDestination,
  approvePlan,
  batchesForPayment,
  getLatestDraft,
  PlanInvalidError,
  saveDraft,
  setLimits,
} from "@/lib/repo";
import { seedHistory } from "@/lib/seed";

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function back(path: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${path}?${q}` : path);
}

// ---------- settings ----------

export async function addDestinationAction(form: FormData) {
  try {
    addDestination(text(form, "label"), text(form, "email"));
  } catch (err) {
    back("/settings", { error: (err as Error).message });
  }
  revalidatePath("/settings");
  back("/settings", { saved: "destination" });
}

export async function saveLimitsAction(form: FormData) {
  try {
    setLimits({
      perPaymentLimitCents: parseAmount(text(form, "perPayment")),
      dailyLimitCents: parseAmount(text(form, "daily")),
    });
  } catch (err) {
    back("/settings", { error: (err as Error).message });
  }
  back("/settings", { saved: "limits" });
}

// ---------- plan ----------

export async function seedAction() {
  seedHistory();
  revalidatePath("/plan");
  back("/plan", {});
}

export async function proposePlanAction(form: FormData) {
  const words = text(form, "words").trim();
  if (words.length < 10) back("/plan", { error: "Say a little more about what you must pay and what you want to save for." });
  const result = await proposePlan(words);
  if (!result.ok) back("/plan", { problems: JSON.stringify(result.problems.slice(0, 8)) });
  back("/plan", result.usedFallback ? { fallback: "1" } : {});
}

function readPots(form: FormData): PotDraft[] {
  const pots: PotDraft[] = [];
  for (let i = 0; i < 12; i++) {
    const name = text(form, `name_${i}`).trim();
    if (!name) continue;
    const kind = text(form, `kind_${i}`) === "fixed" ? "fixed" : "percent";
    const value = text(form, `value_${i}`).trim();
    const dest = text(form, `dest_${i}`);
    let shareBps = 0;
    let fixedCents = 0;
    if (kind === "percent") {
      const n = Number(value);
      shareBps = Number.isFinite(n) ? (percentToBps(n) ?? -1) : -1;
    } else {
      try {
        fixedCents = parseAmount(value);
      } catch {
        fixedCents = -1;
      }
    }
    pots.push({
      name,
      purpose: text(form, `purpose_${i}`),
      shareKind: kind,
      shareBps,
      fixedCents,
      destinationId: dest && dest !== "keep" ? Number(dest) : null,
      reason: text(form, `reason_${i}`),
    });
  }
  return pots;
}

export async function saveDraftAction(form: FormData) {
  const previous = getLatestDraft();
  try {
    saveDraft({
      source: previous?.source ?? "user",
      pots: readPots(form),
      userWords: previous?.userWords ?? null,
      summary: previous?.summary ?? null,
      savingsNote: previous?.savingsNote ?? null,
    });
  } catch (err) {
    if (err instanceof PlanInvalidError) back("/plan", { problems: JSON.stringify(err.problems.slice(0, 8)) });
    throw err;
  }
  back("/plan", { saved: "1" });
}

export async function approvePlanAction(form: FormData) {
  const id = Number(text(form, "planId"));
  try {
    approvePlan(id);
  } catch (err) {
    if (err instanceof PlanInvalidError) back("/plan", { problems: JSON.stringify(err.problems.slice(0, 8)) });
    back("/plan", { error: (err as Error).message });
  }
  // Payments that were waiting for a plan run now.
  await tick();
  revalidatePath("/today");
  back("/today", { approved: "1" });
}

// ---------- paying in ----------

export async function startCheckoutAction(form: FormData) {
  let cents: number;
  try {
    cents = parseAmount(text(form, "amount"));
    if (cents < 100) throw new Error("The smallest payment is 1.00.");
  } catch (err) {
    back("/pay", { error: (err as Error).message });
  }
  const note = text(form, "note").trim().slice(0, 120);
  const payer = text(form, "payer").trim().slice(0, 60) || "Client";
  let approveUrl: string;
  try {
    const order = await getGateway().createOrder({
      amount: toAmount(cents),
      currency: currency(),
      description: note || "Payment",
      returnUrl: `${appUrl()}/api/paypal/return`,
      cancelUrl: `${appUrl()}/pay?cancelled=1`,
      requestId: `portion-order-${crypto.randomUUID()}`,
    });
    getDb()
      .prepare("INSERT INTO pending_orders (order_id, amount_cents, currency, note, payer_label, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(order.orderId, cents, currency(), note, payer, nowIso());
    approveUrl = order.approveUrl;
  } catch (err) {
    const name = err instanceof PayPalError ? err.name : "ERROR";
    back("/pay", { error: `PayPal could not start the payment (${name}).` });
  }
  redirect(approveUrl);
}

export async function approvePreviewOrderAction(form: FormData) {
  const token = text(form, "token");
  if (!approvePreviewOrder(token)) back("/pay", { error: "That preview order does not exist. Start again." });
  redirect(`/api/paypal/return?token=${encodeURIComponent(token)}`);
}

// ---------- payments ----------

export async function confirmPaymentAction(form: FormData) {
  const id = Number(text(form, "paymentId"));
  await processPayment(id, { userConfirmed: true });
  back(`/payments/${id}`, {});
}

export async function refreshPaymentAction(form: FormData) {
  const id = Number(text(form, "paymentId"));
  for (const b of batchesForPayment(id)) {
    try {
      await refreshBatch(b.id);
    } catch {
      // Shown as unchanged. The timer tries again.
    }
  }
  await processPayment(id);
  back(`/payments/${id}`, {});
}

/** Called by the part list while parts are on their way. Reads each batch back, no redirect. */
export async function readBackAction(paymentId: number): Promise<void> {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return;
  for (const b of batchesForPayment(paymentId)) {
    if (b.state !== "posted") continue;
    try {
      await refreshBatch(b.id);
    } catch {
      // The next poll or the 20-second timer tries again.
    }
  }
}

export async function approvePartAction(form: FormData) {
  await approvePart(Number(text(form, "partId")));
  back(text(form, "back") || "/today", {});
}

export async function declinePartAction(form: FormData) {
  declinePart(Number(text(form, "partId")));
  back(text(form, "back") || "/today", {});
}

export async function keepFailedPartAction(form: FormData) {
  keepFailedPart(Number(text(form, "partId")));
  back(text(form, "back") || "/today", {});
}

// ---------- spending ----------

export async function spendAction(form: FormData) {
  try {
    await spendFromPot({
      potKey: text(form, "pot"),
      cents: parseAmount(text(form, "amount")),
      destinationId: Number(text(form, "destination")),
      note: text(form, "note"),
    });
  } catch (err) {
    back("/spend", { error: (err as Error).message });
  }
  await refreshNudges();
  back("/today", { spent: "1" });
}

export async function checkNowAction() {
  await tick();
  await refreshNudges();
  back("/today", {});
}
