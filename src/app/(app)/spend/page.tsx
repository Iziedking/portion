import Link from "next/link";
import { spendAction } from "@/app/actions";
import { potPace } from "@/lib/budget";
import { formatMoney } from "@/lib/money";
import { currency } from "@/lib/paypal";
import { getActivePlan, listDestinations } from "@/lib/repo";

export default async function SpendPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const cur = currency();
  const plan = getActivePlan();
  const { pots } = potPace(new Date(), plan);
  const destinations = listDestinations();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Pay from a pot</h1>
          <p className="page-sub">
            Sends a PayPal payout from money a pot is holding, and counts it against that pot&apos;s pace for the month.
          </p>
        </div>
      </div>
      <div className="grid cols-main">
        <section className="card">
          {params.error ? <div className="notice bad" style={{ marginBottom: 16 }}>{params.error}</div> : null}
          {!plan || pots.length === 0 ? (
            <p className="empty">You need an approved plan with at least one pot that keeps its money. <Link href="/plan" style={{ color: "var(--accent-ink)" }}>Go to the plan</Link>.</p>
          ) : destinations.length === 0 ? (
            <p className="empty">Add who you pay first. <Link href="/settings" style={{ color: "var(--accent-ink)" }}>Add a destination</Link>.</p>
          ) : (
            <form action={spendAction} className="stack">
              <div className="field">
                <label htmlFor="pot">From pot</label>
                <select id="pot" className="select" name="pot" required>
                  {pots.map((p) => (
                    <option key={p.key} value={p.key}>{p.name}, {formatMoney(p.leftCents, cur)} left</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="destination">To</label>
                <select id="destination" className="select" name="destination" required>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}, {d.email}{d.approved ? "" : " (new, will wait for approval)"}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ gridTemplateColumns: "160px 1fr" }}>
                <div className="field">
                  <label htmlFor="amount">Amount ({cur})</label>
                  <input id="amount" className="input num" name="amount" inputMode="decimal" placeholder="0.00" required />
                </div>
                <div className="field">
                  <label htmlFor="note">What for</label>
                  <input id="note" className="input" name="note" maxLength={140} placeholder="November rent" />
                </div>
              </div>
              <div className="actions">
                <button className="btn primary">Send payout</button>
                <span className="small muted">Over your limits or to a new destination, it waits for your approval on Today.</span>
              </div>
            </form>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2 className="card-title">Left this month</h2></div>
          <div className="list">
            {pots.map((p) => (
              <div className="list-row" key={p.key}>
                <span>{p.name}</span>
                <span className="num">{formatMoney(p.leftCents, cur)}</span>
              </div>
            ))}
            {pots.length === 0 ? <p className="empty">No pots to show.</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}
