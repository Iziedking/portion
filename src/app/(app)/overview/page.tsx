import Link from "next/link";
import { MiniTrail, PartTag } from "@/components/ui";
import { overviewByPot } from "@/lib/budget";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { currency } from "@/lib/paypal";
import { allParts, getBatch } from "@/lib/repo";
import { partTrail } from "@/lib/trail";

export default function OverviewPage() {
  const cur = currency();
  const rows = overviewByPot();
  const parts = allParts();
  const total = rows.reduce((s, r) => s + r.keptCents + r.paidCents + r.pendingCents + r.problemCents, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Where it went</h1>
          <p className="page-sub">
            Every cent Portion divided, by envelope and purpose, with the PayPal IDs. Portion only sees money that passes through it.
            Cash and bank spending are not here.
          </p>
        </div>
      </div>
      <div className="stack-lg">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">By envelope</h2>
            <span className="card-meta">{formatMoney(total, cur)} divided in total</span>
          </div>
          {rows.length === 0 ? (
            <p className="empty">Nothing divided yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Envelope</th><th>Purpose</th>
                  <th className="amt">Kept</th><th className="amt">Paid out</th><th className="amt">Spent from envelope</th>
                  <th className="amt">Waiting</th><th className="amt">Did not arrive</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.potName}>
                    <td style={{ fontWeight: 500 }}>{r.potName}</td>
                    <td className="soft">{r.purpose}</td>
                    <td className="amt">{formatMoney(r.keptCents, cur)}</td>
                    <td className="amt">{formatMoney(r.paidCents, cur)}</td>
                    <td className="amt">{formatMoney(r.spentCents, cur)}</td>
                    <td className="amt">{formatMoney(r.pendingCents, cur)}</td>
                    <td className="amt" style={r.problemCents ? { color: "var(--bad)" } : undefined}>{formatMoney(r.problemCents, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Every part</h2>
            <span className="card-meta">Dots: received, checked, split, sent, confirmed</span>
          </div>
          {parts.length === 0 ? (
            <p className="empty">No parts yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Envelope</th><th>From</th><th>To</th><th>PayPal IDs</th><th>Trail</th><th>Status</th><th className="amt">Amount</th></tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const batch = p.batchId ? getBatch(p.batchId) : null;
                  return (
                    <tr key={p.id}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDate(p.createdAt)}</td>
                      <td style={{ fontWeight: 500 }}>{p.potName}</td>
                      <td>
                        {p.paymentId ? <Link href={`/payments/${p.paymentId}`} className="soft">Payment {p.paymentId}</Link> : <span className="soft">Spend from envelope</span>}
                      </td>
                      <td>{p.kind === "keep" ? <span className="soft">Kept in account</span> : p.receiverEmail}</td>
                      <td className="ids">
                        {batch?.payoutBatchId ? <div>Batch {batch.payoutBatchId}</div> : null}
                        {p.payoutItemId ? <div>Item {p.payoutItemId}</div> : null}
                        {!batch && !p.payoutItemId ? "None, not sent" : null}
                      </td>
                      <td style={{ minWidth: 120 }}><MiniTrail states={partTrail(p)} /></td>
                      <td><PartTag part={p} /></td>
                      <td className="amt">{formatMoney(p.cents, cur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
