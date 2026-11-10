"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { approvePartAction, keepFailedPartAction, readBackAction } from "@/app/actions";

export type PartState = "kept" | "paid" | "sending" | "waiting" | "failed";

export interface PartRow {
  id: number;
  pot: string;
  detail: string;
  where: string;
  amount: string;
  state: PartState;
  label: string;
  canApprove: boolean;
  canKeep: boolean;
  ids: string[];
}

/** Eight dashes; one at a time is dark. CSS runs the cycle, so nothing re-renders. */
function Sending() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="spin-dashes" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={8 + 5.1 * Math.cos(a)}
            y1={8 + 5.1 * Math.sin(a)}
            x2={8 + 6.9 * Math.cos(a)}
            y2={8 + 6.9 * Math.sin(a)}
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        );
      })}
    </svg>
  );
}

function StateIcon({ state }: { state: PartState }) {
  switch (state) {
    case "paid":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="8" fill="var(--ok)" />
          <path d="M5 8.2l2.2 2.2L11 6.4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "waiting":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="7.25" fill="none" stroke="var(--wait)" strokeWidth="1.5" />
          <path d="M8 4.6v3.8l2.4 1.4" stroke="var(--wait)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "failed":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="8" fill="var(--bad)" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "sending":
      return <Sending />;
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <rect x="2.5" y="4" width="11" height="8" rx="2" fill="none" stroke="var(--text-3)" strokeWidth="1.5" />
          <path d="M2.5 6.5h11" stroke="var(--text-3)" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function PartStatusList({ paymentId, rows }: { paymentId: number; rows: PartRow[] }) {
  const router = useRouter();
  const busy = useRef(false);
  const anySending = rows.some((r) => r.state === "sending");

  // While a part is on its way, ask PayPal every 5 seconds and redraw. Stops once nothing is sending.
  useEffect(() => {
    if (!anySending) return;
    const timer = setInterval(async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        await readBackAction(paymentId);
        router.refresh();
      } finally {
        busy.current = false;
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [anySending, paymentId, router]);

  return (
    <ul className="status-list" aria-live="polite">
      {rows.map((r) => (
        <li key={r.id} className={`status-row is-${r.state}`}>
          <span className="status-icon" key={r.state}>
            <StateIcon state={r.state} />
          </span>
          <div className="status-main">
            <div className="status-title">
              <span className="status-pot">{r.pot}</span>
              <span className="status-where">{r.where}</span>
            </div>
            {r.detail ? <p className="status-detail">{r.detail}</p> : null}
            {r.ids.length ? <p className="ids">{r.ids.join(" · ")}</p> : null}
          </div>
          <div className="status-side">
            <span className="status-amount">{r.amount}</span>
            {r.canApprove ? (
              <form action={approvePartAction}>
                <input type="hidden" name="partId" value={r.id} />
                <input type="hidden" name="back" value={`/payments/${paymentId}`} />
                <button className="btn primary small">Approve and send</button>
              </form>
            ) : r.canKeep ? (
              <form action={keepFailedPartAction}>
                <input type="hidden" name="partId" value={r.id} />
                <input type="hidden" name="back" value={`/payments/${paymentId}`} />
                <button className="btn small">Keep in account</button>
              </form>
            ) : (
              <span className="status-label">{r.label}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
