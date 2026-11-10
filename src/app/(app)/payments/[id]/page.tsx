import { notFound } from "next/navigation";
import { confirmPaymentAction, refreshPaymentAction } from "@/app/actions";
import { DivideStrip, PartActions, PartTag, PaymentTag } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { batchesForPayment, getPayment, getPlan, partsForPayment } from "@/lib/repo";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = getPayment(Number(id));
  if (!payment) notFound();
  const parts = partsForPayment(payment.id);
  const batches = batchesForPayment(payment.id);
  const plan = payment.planId ? getPlan(payment.planId) : null;
  const back = `/payments/${payment.id}`;

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
              {payment.checkSource === "ai" ? "Claude was not sure this is income, so nothing was divided or paid." : "Portion was not sure this is income, so nothing was divided or paid."}
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
            <table className="table">
              <thead>
                <tr><th>Pot</th><th>Reason</th><th>Where</th><th>Status</th><th className="amt">Amount</th></tr>
              </thead>
              <tbody>
                {parts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{p.potName}</td>
                    <td className="reason" style={{ maxWidth: 320 }}>
                      {p.reason || p.purpose}
                      {p.holdReason ? <p className="small" style={{ color: "var(--wait)", marginTop: 4 }}>{p.holdReason}</p> : null}
                      {p.error ? <p className="small" style={{ color: "var(--bad)", marginTop: 4 }}>PayPal: {p.error}</p> : null}
                    </td>
                    <td>
                      {p.kind === "keep" ? <span className="soft">Kept in account</span> : <span>{p.receiverEmail}</span>}
                      {p.payoutItemId ? <div className="ids">Item {p.payoutItemId}</div> : null}
                      {p.transactionId ? <div className="ids">Transaction {p.transactionId}</div> : null}
                      {p.feeCents !== null ? <div className="ids">Fee read from PayPal {formatMoney(p.feeCents, payment.currency)}</div> : null}
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 8 }}>
                        <PartTag part={p} />
                        <PartActions part={p} back={back} />
                      </div>
                    </td>
                    <td className="amt">{formatMoney(p.cents, payment.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
