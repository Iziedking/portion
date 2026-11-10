import { notFound } from "next/navigation";
import { confirmPaymentAction, refreshPaymentAction } from "@/app/actions";
import { DivideStrip, PaymentTag } from "@/components/ui";
import { PartStatusList, type PartState } from "@/components/part-status-list";
import { formatDateTime, PART_LABEL } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { batchesForPayment, getPayment, getPlan, partsForPayment, type PartStatus } from "@/lib/repo";

const PART_STATE: Record<PartStatus, PartState> = {
  kept: "kept",
  declined: "kept",
  paid: "paid",
  queued: "sending",
  sent: "sending",
  needs_approval: "waiting",
  unclaimed: "waiting",
  onhold: "waiting",
  failed: "failed",
  returned: "failed",
};

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = getPayment(Number(id));
  if (!payment) notFound();
  const parts = partsForPayment(payment.id);
  const batches = batchesForPayment(payment.id);
  const plan = payment.planId ? getPlan(payment.planId) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small" style={{ marginBottom: 4 }}>{formatDateTime(payment.receivedAt)}</p>
          <h1 className="page-title">
            <span className="num">{formatMoney(payment.amountCents, payment.currency)}</span>{" "}
            <span className="soft" style={{ fontWeight: 400 }}>from {payment.payerName ?? payment.payerEmail ?? "a payer"}</span>
          </h1>
          <p className="page-sub">{payment.note ? `Note from the payer: "${payment.note}"` : "No note from the payer."}</p>
        </div>
        <div className="actions">
          <PaymentTag status={payment.status} />
          {batches.length ? (
            <form action={refreshPaymentAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <button className="btn">Read back from PayPal</button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="stack-lg">
        {payment.statusReason ? (
          <div className={`notice ${payment.status === "needs_attention" ? "bad" : ""}`}>{payment.statusReason}</div>
        ) : null}

        {payment.status === "waiting_user" ? (
          <section className="card">
            <div className="card-head"><h2 className="card-title">Should this payment follow your plan</h2></div>
            <p className="soft" style={{ marginBottom: 16 }}>
              {payment.checkSource === "ai" ? "The AI agent was not sure this is income, so nothing was divided or paid." : "Portion was not sure this is income, so nothing was divided or paid."}
              {" "}If it is income, divide it now. If not, leave it and it stays in the account untouched.
            </p>
            <form action={confirmPaymentAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <button className="btn primary">Yes, divide it by my plan</button>
            </form>
          </section>
        ) : null}

        {parts.length ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">How it was divided</h2>
              <span className="card-meta">Whole cents, checked to add up to the payment</span>
            </div>
            <DivideStrip
              total={payment.amountCents}
              currency={payment.currency}
              parts={parts.map((p) => ({ name: p.potName, cents: p.cents, index: Math.max(0, plan?.pots.findIndex((x) => x.key === p.potKey) ?? 0) }))}
            />
          </section>
        ) : null}

        {parts.length ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Each part</h2>
              <span className="card-meta">A PayPal batch can partly fail, so each part is read back on its own</span>
            </div>
            <PartStatusList
              paymentId={payment.id}
              rows={parts.map((p) => ({
                id: p.id,
                pot: p.potName,
                where: p.kind === "keep" ? "kept in account" : `to ${p.receiverEmail}`,
                detail: [p.reason || p.purpose, p.holdReason, p.error ? `PayPal: ${p.error}` : null].filter(Boolean).join(" "),
                amount: formatMoney(p.cents, payment.currency),
                state: PART_STATE[p.status],
                label: PART_LABEL[p.status],
                canApprove: p.status === "needs_approval",
                canKeep: p.status === "failed" || p.status === "returned",
                ids: [
                  p.payoutItemId ? `Item ${p.payoutItemId}` : null,
                  p.transactionId ? `Transaction ${p.transactionId}` : null,
                  p.feeCents !== null ? `Fee read from PayPal ${formatMoney(p.feeCents, payment.currency)}` : null,
                ].filter((x): x is string => x !== null),
              }))}
            />
          </section>
        ) : null}

        <section className="card">
          <div className="card-head"><h2 className="card-title">PayPal record</h2></div>
          <div className="ids" style={{ display: "grid", gap: 4 }}>
            <div>Capture {payment.captureId}</div>
            {payment.orderId ? <div>Order {payment.orderId}</div> : null}
            {batches.map((b) => (
              <div key={b.id}>
                Payout batch {b.payoutBatchId ?? "not created yet"} · request {b.requestId} · {b.state}
                {b.batchStatus ? ` · ${b.batchStatus}` : ""}
                {b.error ? ` · ${b.error}` : ""}
                {b.lastCheckedAt ? ` · read ${formatDateTime(b.lastCheckedAt)}` : ""}
              </div>
            ))}
            {payment.checkReason ? <div>Payment check ({payment.checkSource}): {payment.checkReason}</div> : null}
          </div>
        </section>
      </div>
    </>
  );
}
