import { addDestinationAction, saveLimitsAction } from "@/app/actions";
import { Tag } from "@/components/ui";
import { formatMoney, toAmount } from "@/lib/money";
import { currency } from "@/lib/paypal";
import { getLimits, listDestinations } from "@/lib/repo";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const cur = currency();
  const destinations = listDestinations();
  const limits = getLimits();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Destinations and limits</h1>
          <p className="page-sub">
            Only you can add a destination, here. The AI can name a destination you added but cannot add or change one.
            The first payout to a new destination always waits for your approval.
          </p>
        </div>
      </div>
      <div className="stack-lg">
        {params.error ? <div className="notice bad">{params.error}</div> : null}
        {params.saved ? <div className="notice ok">Saved.</div> : null}
        <div className="grid cols-main">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Destinations</h2>
              <span className="card-meta">PayPal emails that pots can pay</span>
            </div>
            {destinations.length === 0 ? (
              <p className="empty" style={{ marginBottom: 16 }}>None yet. Pots keep their money in the account until you add one.</p>
            ) : (
              <table className="table" style={{ marginBottom: 20 }}>
                <thead><tr><th>Name</th><th>PayPal email</th><th>Status</th></tr></thead>
                <tbody>
                  {destinations.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 500 }}>{d.label}</td>
                      <td className="mono small">{d.email}</td>
                      <td>{d.approved ? <Tag tone="ok">Approved</Tag> : <Tag tone="wait">New, first payout waits</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={addDestinationAction} className="form-row" style={{ gridTemplateColumns: "1fr 1.4fr auto", alignItems: "end" }}>
              <div className="field">
                <label htmlFor="label">Name</label>
                <input id="label" className="input" name="label" maxLength={40} placeholder="Tunde" required />
              </div>
              <div className="field">
                <label htmlFor="email">PayPal email</label>
                <input id="email" className="input" name="email" type="email" maxLength={127} placeholder="name@example.com" required />
              </div>
              <button className="btn">Add</button>
            </form>
          </section>

          <section className="card">
            <div className="card-head"><h2 className="card-title">Limits</h2></div>
            <form action={saveLimitsAction} className="stack">
              <div className="field">
                <label htmlFor="perPayment">Most for one payout ({cur})</label>
                <input id="perPayment" className="input num" name="perPayment" inputMode="decimal" defaultValue={toAmount(limits.perPaymentLimitCents)} required />
              </div>
              <div className="field">
                <label htmlFor="daily">Most paid out in one day ({cur})</label>
                <input id="daily" className="input num" name="daily" inputMode="decimal" defaultValue={toAmount(limits.dailyLimitCents)} required />
              </div>
              <button className="btn">Save limits</button>
              <p className="small muted">
                Now {formatMoney(limits.perPaymentLimitCents, cur)} per payout and {formatMoney(limits.dailyLimitCents, cur)} per day.
                Anything above waits for you. Checked in code on every payout.
              </p>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
