"use client";

import { useMemo, useState } from "react";
import { spendAction } from "@/app/actions";

export interface SpendPot {
  key: string;
  name: string;
  color: string;
  leftCents: number;
  fundedCents: number;
  expectedLeftCents: number;
}

export interface SpendDestination {
  id: number;
  label: string;
  email: string;
  approved: boolean;
}

const money = (cents: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(cents / 100);

function toCents(text: string): number | null {
  const m = /^\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(text.replace(/,/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

function MiniEnvelope({ color, fill, pace }: { color: string; fill: number; pace: number }) {
  return (
    <span className="mini-env" aria-hidden>
      <span className="mini-env-ink" style={{ height: `${Math.max(0, Math.min(1, fill)) * 100}%`, background: color }} />
      <svg className="mini-env-flap" viewBox="0 0 100 30" preserveAspectRatio="none">
        <polyline points="0,0 50,30 100,0" />
      </svg>
      <span className="mini-env-tick" style={{ bottom: `${Math.max(0, Math.min(1, pace)) * 100}%` }} />
    </span>
  );
}

export function SpendForm({ pots, destinations, initialPot, currency }: { pots: SpendPot[]; destinations: SpendDestination[]; initialPot?: string; currency: string }) {
  const [potKey, setPotKey] = useState(pots.find((p) => p.key === initialPot)?.key ?? pots[0]?.key ?? "");
  const [destId, setDestId] = useState(destinations[0]?.id ?? 0);
  const [amount, setAmount] = useState("");
  const pot = pots.find((p) => p.key === potKey);
  const dest = destinations.find((d) => d.id === destId);
  const cents = toCents(amount);

  const preview = useMemo(() => {
    if (!pot || cents === null || cents <= 0) return null;
    if (cents > pot.leftCents) return { tone: "bad", title: `Only ${money(pot.leftCents, currency)} left in ${pot.name}`, text: "Portion will not pay more than an envelope holds." };
    const after = pot.leftCents - cents;
    const behind = after < pot.expectedLeftCents;
    return {
      tone: behind ? "wait" : "ok",
      title: `After this, ${money(after, currency)} left`,
      text: behind
        ? "That is below today’s pace mark, so Portion will nudge you."
        : "Still on pace for the month.",
      fill: pot.fundedCents ? after / pot.fundedCents : 0,
    };
  }, [pot, cents, currency]);

  return (
    <form action={spendAction} className="spend">
      <input type="hidden" name="pot" value={potKey} />
      <input type="hidden" name="destination" value={destId} />

      <fieldset className="spend-group">
        <legend className="label">From envelope</legend>
        <div className="spend-envs">
          {pots.map((p) => (
            <button
              type="button"
              key={p.key}
              className={`spend-env${p.key === potKey ? " is-on" : ""}`}
              aria-pressed={p.key === potKey}
              onClick={() => setPotKey(p.key)}
            >
              <MiniEnvelope color={p.color} fill={p.fundedCents ? p.leftCents / p.fundedCents : 0} pace={p.fundedCents ? p.expectedLeftCents / p.fundedCents : 0} />
              <span className="spend-env-name">{p.name}</span>
              <span className="spend-env-left num">{money(p.leftCents, currency)} left</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="spend-group">
        <legend className="label">Pay to</legend>
        <div className="spend-dests">
          {destinations.map((d) => (
            <label key={d.id} className={`spend-dest${d.id === destId ? " is-on" : ""}`}>
              <input type="radio" name="destPick" checked={d.id === destId} onChange={() => setDestId(d.id)} />
              <span className="spend-dest-text">
                <span className="spend-dest-name">{d.label}</span>
                <span className="mono small muted">{d.email}</span>
              </span>
              {!d.approved ? <span className="tag wait">New</span> : null}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="spend-row">
        <div className="field">
          <label htmlFor="amount" className="label">Amount</label>
          <div className="amount-box">
            <span className="mono muted">{currency}</span>
            <input id="amount" name="amount" inputMode="decimal" placeholder="0.00" autoComplete="off" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="note" className="label">What for</label>
          <input id="note" className="input" name="note" maxLength={140} placeholder="November rent" />
        </div>
      </div>

      {preview ? (
        <div className={`spend-preview is-${preview.tone}`}>
          {pot && preview.fill !== undefined ? <MiniEnvelope color={pot.color} fill={preview.fill} pace={pot.fundedCents ? pot.expectedLeftCents / pot.fundedCents : 0} /> : null}
          <div>
            <div className="strong">{preview.title}</div>
            <div className="soft small">{preview.text}</div>
          </div>
        </div>
      ) : null}

      {dest && !dest.approved ? (
        <p className="notice">{dest.label} is new, so this payout waits on Today until you approve it once.</p>
      ) : null}

      <div className="actions spend-actions">
        <button className="btn primary lg" disabled={!pot || !dest || preview?.tone === "bad"}>Send payout</button>
        <span className="small muted">Limits are checked in code. Anything over them waits on Today.</span>
      </div>
    </form>
  );
}
