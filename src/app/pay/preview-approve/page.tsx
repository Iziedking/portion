import { redirect } from "next/navigation";
import { approvePreviewOrderAction } from "@/app/actions";
import { getGateway } from "@/lib/paypal";

// Stands in for PayPal's approval screen when there are no keys. Never shown in sandbox mode.
export default async function PreviewApprove({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { token } = await searchParams;
  if (getGateway().mode !== "preview" || !token) redirect("/pay");
  return (
    <div className="pay-page">
      <div className="invoice">
        <div className="invoice-head">
          <p className="small muted" style={{ marginBottom: 8 }}>Preview mode</p>
          <h1 className="invoice-title">Approve as the buyer</h1>
          <p className="soft" style={{ marginTop: 4 }}>
            With sandbox keys set, this step is PayPal&apos;s own login and approval screen. In preview mode nothing leaves this computer.
          </p>
        </div>
        <form action={approvePreviewOrderAction} className="actions">
          <input type="hidden" name="token" value={token} />
          <button className="btn primary lg">Approve payment</button>
          <a className="btn quiet" href="/pay?cancelled=1">Cancel</a>
        </form>
        <p className="ids" style={{ marginTop: 16 }}>Order {token}</p>
      </div>
    </div>
  );
}
