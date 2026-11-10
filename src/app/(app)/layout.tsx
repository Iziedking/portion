import { getAdvisor } from "@/lib/ai";
import { getGateway } from "@/lib/paypal";
import { listPayments, partsWaitingApproval } from "@/lib/repo";
import { Nav } from "./nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const waiting = partsWaitingApproval().length + listPayments().filter((p) => p.status === "waiting_user").length;
  const paypal = getGateway().mode;
  const ai = getAdvisor().mode;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Portion</span>
        </div>
        <Nav waiting={waiting} />
        <div className="side-foot">
          <div className="mode">
            <span>PayPal</span>
            <b>{paypal === "sandbox" ? "Sandbox" : "Preview, no PayPal"}</b>
          </div>
          <div className="mode">
            <span>AI</span>
            <b>{ai === "claude" ? "Claude" : "Preview, fixed rules"}</b>
          </div>
          <p className="side-note">No real money. Portion only sees payments that pass through it.</p>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
