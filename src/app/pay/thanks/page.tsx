import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { getPayment } from "@/lib/repo";

export default async function Thanks({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { payment: id } = await searchParams;
  const payment = id ? getPayment(Number(id)) : null;
  return (
    <div className="pay-page">
      <div className="invoice">
        <div className="invoice-head">
          <h1 className="invoice-title">Payment received</h1>
          <p className="soft" style={{ marginTop: 4 }}>
            {payment ? `${formatMoney(payment.amountCents, payment.currency)} was captured.` : "The payment was captured."} You can close this page.
          </p>
        </div>
        {payment ? (
          <p className="small muted">
            For the demo: <Link href={`/payments/${payment.id}`} style={{ color: "var(--accent-ink)" }}>see how Portion divided it</Link>.
          </p>
        ) : null}
        {payment ? <p className="ids" style={{ marginTop: 12 }}>Capture {payment.captureId}</p> : null}
      </div>
    </div>
  );
}
