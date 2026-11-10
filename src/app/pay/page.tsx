import { startCheckoutAction } from "@/app/actions";
import { currency, getGateway } from "@/lib/paypal";

export default async function PayPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const mode = getGateway().mode;
  return (
    <div className="pay-page">
      <div className="pay-card card" style={{ padding: 32 }}>
        <div className="pay-head">
          <p className="small muted" style={{ marginBottom: 8 }}>
            {mode === "sandbox" ? "PayPal sandbox. No real money." : "Preview mode. No PayPal, no real money."}
          </p>
          <h1>Pay for your project</h1>
          <p className="soft" style={{ marginTop: 4 }}>This is the page a client opens to pay the freelancer.</p>
        </div>
        {params.error ? <div className="notice bad" style={{ marginBottom: 16 }}>{params.error}</div> : null}
        {params.cancelled ? <div className="notice" style={{ marginBottom: 16 }}>You cancelled at PayPal. Nothing was paid.</div> : null}
        <form action={startCheckoutAction} className="stack">
          <div className="field">
            <label htmlFor="amount">Amount ({currency()})</label>
            <input id="amount" className="input num" name="amount" inputMode="decimal" placeholder="1200.00" required />
          </div>
          <div className="field">
            <label htmlFor="payer">Your name</label>
            <input id="payer" className="input" name="payer" maxLength={60} placeholder="Northwind Studio" />
          </div>
          <div className="field">
            <label htmlFor="note">Note</label>
            <input id="note" className="input" name="note" maxLength={120} placeholder="Logo project, invoice 14" />
          </div>
          <button className="btn primary lg">Pay with PayPal</button>
        </form>
      </div>
    </div>
  );
}
