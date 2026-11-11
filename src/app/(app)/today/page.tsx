import Link from "next/link";
import { checkNowAction } from "@/app/actions";
import { DivideStrip, Envelope, MiniTrail, MonthLine, PartActions, PaymentTag } from "@/components/ui";
import { SetupGuide } from "@/components/setup-guide";
import { paymentTrail } from "@/lib/trail";
import { monthPeriod, potPace, refreshNudges } from "@/lib/budget";
import { formatDate, monthTitle, potColor } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { appUrl, currency } from "@/lib/paypal";
import { batchesForPayment, getActivePlan, getDestination, getLatestDraft, listDestinations, listPayments, partsForPayment, partsWaitingApproval } from "@/lib/repo";

const DAY = 86_400_000;

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const now = new Date();
  const cur = currency();
  const plan = getActivePlan();
  const nudges = await refreshNudges(now);
  const { period, pots } = potPace(now, plan);
  const monthStart = monthPeriod(now).start.toISOString();
  const days = Math.round((period.end.getTime() - period.start.getTime()) / DAY);
  const day = Math.min(days, days - period.daysLeft + 1);

  const payments = listPayments({ includeSeeded: false });
  const thisMonth = payments.filter((p) => p.receivedAt >= monthStart);
  const monthParts = thisMonth.flatMap((p) => partsForPayment(p.id));
  const received = thisMonth.reduce((s, p) => s + p.amountCents, 0);
  const paidOut = monthParts.filter((p) => p.status === "paid").reduce((s, p) => s + p.cents, 0);
  const heldLeft = pots.reduce((s, p) => s + p.leftCents, 0);
  const heldFunded = pots.reduce((s, p) => s + p.fundedCents, 0);
  const spent = pots.reduce((s, p) => s + p.spentCents, 0);
  const approvals = partsWaitingApproval();
  const waitingPayments = payments.filter((p) => p.status === "waiting_user" || p.status === "waiting_plan");
  const waitingCount = approvals.length + waitingPayments.length;
  const latest = payments.find((p) => !["waiting_user", "waiting_plan", "recorded"].includes(p.status));
  const latestParts = latest ? partsForPayment(latest.id) : [];
  const payoutPots = plan?.pots.filter((p) => p.destinationId !== null) ?? [];
  const colorOf = (key: string) => potColor(Math.max(0, plan?.pots.findIndex((x) => x.key === key) ?? 0));
  const destinations = listDestinations();
  const setup = {
    destinations: destinations.map((d) => d.label),
    hasPlan: !!plan,
    hasDraft: !!getLatestDraft(),
    hasPayment: payments.length > 0,
    historyCount: listPayments().filter((p) => p.seeded).length,
    payLink: `${appUrl()}/pay`,
  };
  const setupDone = setup.destinations.length > 0 && setup.hasPlan && setup.hasPayment;
  const latestTrail = latest ? paymentTrail(latest, latestParts, batchesForPayment(latest.id)) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{monthTitle(now)}</h1>
          <MonthLine elapsed={period.elapsed} day={day} days={days} />
        </div>
        <div className="actions">
          <form action={checkNowAction}>
            <button className="btn quiet">Check PayPal now</button>
          </form>
          {plan && pots.length ? <Link href="/spend" className="btn">Pay from an envelope</Link> : null}
        </div>
      </div>

      <div className="stack">
        {params.approved ? <div className="notice ok">Plan approved. New payments now divide by themselves.</div> : null}
        {params.spent ? <div className="notice ok">Payout sent to PayPal. Follow it on Where it went.</div> : null}

        {!setupDone ? <SetupGuide s={setup} /> : null}

        {plan ? (
        <section className="card month">
          {(
            <>
              <div className="month-head">
                <div>
                  <div className="label">Left in your envelopes</div>
                  <div className="hero-figure num">{formatMoney(heldLeft, cur)}</div>
                  <div className="soft">of {formatMoney(heldFunded, cur)} kept this month</div>
                </div>
                <dl className="figures">
                  <div>
                    <dt>Received</dt>
                    <dd className="num">{formatMoney(received, cur)}</dd>
                  </div>
                  <div>
                    <dt>Paid out on arrival</dt>
                    <dd className="num">{formatMoney(paidOut, cur)}</dd>
                  </div>
                  <div>
                    <dt>Spent from envelopes</dt>
                    <dd className="num">{formatMoney(spent, cur)}</dd>
                  </div>
                </dl>
              </div>

              {pots.length === 0 ? (
                <p className="empty">Every pot in your plan pays out on arrival, so there is nothing to hold.</p>
              ) : (
                <div className="envelopes">
                  {pots.map((p) => (
                    <Envelope
                      href={`/spend?pot=${encodeURIComponent(p.key)}`}
                      key={p.key}
                      name={p.name}
                      color={colorOf(p.key)}
                      leftCents={p.leftCents}
                      fundedCents={p.fundedCents}
                      expectedLeftCents={p.expectedLeftCents}
                      ahead={p.ahead}
                      currency={cur}
                    />
                  ))}
                </div>
              )}

              <div className="month-foot">
                <span className="legend-tick">
                  <span className="tick-swatch" aria-hidden /> Where each envelope should be today
                </span>
                {payoutPots.length ? (
                  <span>
                    Paid out on arrival: {payoutPots.map((p) => `${p.name} to ${getDestination(p.destinationId!)?.label ?? "?"}`).join(", ")}
                  </span>
                ) : null}
              </div>

              {nudges.map((n) => (
                <div key={n.id} className="nudge">
                  <span className="dot" style={{ background: colorOf(n.potKey) }} aria-hidden />
                  <div>
                    <p>{n.message}</p>
                    <p className="small muted">
                      Code found this envelope ahead of pace. {n.source === "ai" ? "The AI agent wrote the words." : "Written from a fixed template."}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
        ) : null}

        {waitingCount ? (
          <section className="card attention">
            <div className="card-head">
              <h2 className="card-title">Waiting for you</h2>
              <span className="card-meta num">{waitingCount}</span>
            </div>
            <div className="list">
              {waitingPayments.map((p) => (
                <div className="list-row" key={`pay-${p.id}`} style={{ alignItems: "flex-start" }}>
                  <div>
                    <Link href={`/payments/${p.id}`} style={{ fontWeight: 500 }}>
                      {formatMoney(p.amountCents, p.currency)} from {p.payerName ?? "a payer"}
                    </Link>
                    <p className="reason">{p.statusReason}</p>
                  </div>
                  <PaymentTag status={p.status} />
                </div>
              ))}
              {approvals.map((part) => (
                <div className="list-row wait-row" key={`part-${part.id}`}>
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      <span className="num">{formatMoney(part.cents, cur)}</span> from {part.potName} to {part.receiverEmail}
                    </div>
                    <p className="reason">{part.holdReason}</p>
                  </div>
                  <PartActions part={part} back="/today" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid cols-main">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Envelopes this month</h2>
              <span className="card-meta">Kept, spent and what is left</span>
            </div>
            {pots.length === 0 ? (
              <p className="empty">No envelopes that keep money yet.</p>
            ) : (
              <table className="table ledger">
                <thead>
                  <tr>
                    <th>Envelope</th>
                    <th className="amt">Kept</th>
                    <th className="amt">Spent</th>
                    <th className="amt">Left</th>
                    <th className="amt">Should be left today</th>
                  </tr>
                </thead>
                <tbody>
                  {pots.map((p) => (
                    <tr key={p.key}>
                      <td>
                        <div className="pot-name">
                          <span className="dot" style={{ background: colorOf(p.key) }} aria-hidden />
                          {p.name}
                        </div>
                        <div className="pot-purpose">{p.purpose}</div>
                      </td>
                      <td className="amt">{formatMoney(p.fundedCents, cur)}</td>
                      <td className="amt">{p.spentCents ? formatMoney(p.spentCents, cur) : <span className="muted">None</span>}</td>
                      <td className="amt strong">{formatMoney(p.leftCents, cur)}</td>
                      <td className={`amt ${p.ahead ? "ahead" : "muted"}`}>
                        {p.fundedCents ? formatMoney(p.expectedLeftCents, cur) : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Latest payment</h2>
              {latest ? (
                <Link href={`/payments/${latest.id}`} className="card-meta link">
                  {formatDate(latest.receivedAt)}
                </Link>
              ) : null}
            </div>
            {latest ? (
              <>
                <p style={{ marginBottom: 12 }}>
                  <span className="num" style={{ fontWeight: 500 }}>{formatMoney(latest.amountCents, latest.currency)}</span>
                  <span className="soft"> from {latest.payerName ?? "a payer"}</span>
                </p>
                <div style={{ marginBottom: 16 }}>
                  <MiniTrail labels states={latestTrail.map((t) => t.state)} />
                </div>
                {latestParts.length ? (
                  <DivideStrip
                    total={latest.amountCents}
                    currency={latest.currency}
                    parts={latestParts.map((p) => ({
                      name: p.potName,
                      cents: p.cents,
                      index: Math.max(0, plan?.pots.findIndex((x) => x.key === p.potKey) ?? 0),
                    }))}
                  />
                ) : null}
              </>
            ) : (
              <p className="empty">
                No payments yet. Open the <Link href="/pay" className="link">client pay page</Link> to send one through the sandbox.
              </p>
            )}
            {!waitingCount ? <p className="small muted" style={{ marginTop: 16 }}>Nothing is waiting for you</p> : null}
          </section>
        </div>
      </div>
    </>
  );
}
