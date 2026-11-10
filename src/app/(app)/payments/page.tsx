import Link from "next/link";
import { PaymentTag } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { listPayments } from "@/lib/repo";

export default function PaymentsPage() {
  const payments = listPayments();
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">Every payment Portion has recorded. Seeded rows are demo history in Portion's own records, not PayPal payments.</p>
        </div>
      </div>
      <section className="card">
        {payments.length === 0 ? (
          <p className="empty">No payments yet. Open the client pay page to make one in the sandbox.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Date</th><th>From</th><th>Note</th><th>Status</th><th className="amt">Amount</th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDate(p.receivedAt)}</td>
                  <td>{p.seeded ? <span className="muted">Seeded client</span> : <Link href={`/payments/${p.id}`} style={{ fontWeight: 500 }}>{p.payerName ?? p.payerEmail ?? "Payer"}</Link>}</td>
                  <td className="soft">{p.note} {p.seeded ? <span className="seeded">seeded</span> : null}</td>
                  <td><PaymentTag status={p.status} /></td>
                  <td className="amt">{formatMoney(p.amountCents, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
