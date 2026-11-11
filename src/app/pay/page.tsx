import { startCheckoutAction } from "@/app/actions";
import { currency, getGateway } from "@/lib/paypal";

export default async function PayPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const mode = getGateway().mode;
  const cur = currency();
  return (
    <div className="pay-page">
      <div className="invoice">
        <div className="invoice-top">
          <div>
            <p className="label">Payment request</p>
            <h1 className="invoice-title">Pay for your project</h1>
          </div>
          <span className="stamp">{mode === "sandbox" ? "PayPal sandbox" : "Preview"}</span>
        </div>
        <p className="soft invoice-sub">
          This is the page a client opens to pay the freelancer. {mode === "sandbox" ? "Sandbox only, no real money." : "No PayPal and no real money in preview mode."}
        </p>

        {params.error ? <div className="notice bad">{params.error}</div> : null}
        {params.cancelled ? <div className="notice">You cancelled at PayPal. Nothing was paid.</div> : null}

        <form action={startCheckoutAction}>
          <div className="invoice-amount">
            <label htmlFor="amount" className="label">Amount</label>
            <div className="amount-field">
              <span className="amount-cur">{cur}</span>
              <input id="amount" className="amount-input num" name="amount" inputMode="decimal" placeholder="1200.00" autoComplete="off" required />
            </div>
          </div>
          <div className="ledger-lines">
            <div className="ledger-line">
              <label htmlFor="payer">From</label>
              <input id="payer" name="payer" maxLength={60} placeholder="Northwind Studio" />
            </div>
            <div className="ledger-line">
              <label htmlFor="note">For</label>
              <input id="note" name="note" maxLength={120} placeholder="Logo project, invoice 14" />
            </div>
          </div>
          <button className="btn paypal">
            Pay with <span className="paypal-word">PayPal</span>
          </button>
          <p className="small muted invoice-foot">You sign in and approve on PayPal. Portion never sees your card or your PayPal login.</p>
        </form>
      </div>
    </div>
  );
}
