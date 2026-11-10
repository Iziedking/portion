import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { parseAmount } from "@/lib/money";
import { processPayment } from "@/lib/engine";
import { appUrl, getGateway, PayPalError } from "@/lib/paypal";
import { recordPayment } from "@/lib/repo";

export const dynamic = "force-dynamic";

// PayPal sends the payer back here with the order ID in "token" after they approve.
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("token");
  if (!orderId || !/^[A-Za-z0-9-]{5,64}$/.test(orderId)) {
    return NextResponse.redirect(`${appUrl()}/pay?error=${encodeURIComponent("Missing order.")}`);
  }
  const pending = getDb().prepare("SELECT * FROM pending_orders WHERE order_id = ?").get(orderId) as
    | { note: string; payer_label: string }
    | undefined;
  if (!pending) {
    return NextResponse.redirect(`${appUrl()}/pay?error=${encodeURIComponent("Portion did not start this order.")}`);
  }

  try {
    const capture = await getGateway().captureOrder(orderId);
    if (capture.status !== "COMPLETED" && capture.status !== "PENDING") {
      return NextResponse.redirect(`${appUrl()}/pay?error=${encodeURIComponent(`PayPal says the payment is ${capture.status}.`)}`);
    }
    // The amount recorded is what PayPal captured, not what the form asked for.
    const { payment } = recordPayment({
      captureId: capture.captureId,
      orderId,
      amountCents: parseAmount(capture.amount),
      currency: capture.currency,
      payerEmail: capture.payerEmail,
      payerName: capture.payerName ?? pending.payer_label,
      note: pending.note,
      receivedAt: capture.createTime ?? new Date().toISOString(),
    });
    await processPayment(payment.id);
    return NextResponse.redirect(`${appUrl()}/pay/thanks?payment=${payment.id}`);
  } catch (err) {
    const name = err instanceof PayPalError ? err.name : "ERROR";
    return NextResponse.redirect(`${appUrl()}/pay?error=${encodeURIComponent(`The payment did not complete (${name}).`)}`);
  }
}
