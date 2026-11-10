import Link from "next/link";
import { checkNowAction } from "@/app/actions";
import { DivideStrip, PartActions, PaymentTag } from "@/components/ui";
import { monthPeriod, potPace, refreshNudges } from "@/lib/budget";
import { formatDate, monthTitle, potColor } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { currency } from "@/lib/paypal";
import { getActivePlan, getDestination, listPayments, partsForPayment, partsWaitingApproval } from "@/lib/repo";

export default async function Today({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const now = new Date();
  const cur = currency();
  const plan = getActivePlan();
  const nudges = await refreshNudges(now);
  const { period, pots } = potPace(now, plan);
  const monthStart = monthPeriod(now).start.toISOString();

  const payments = listPayments({ includeSeeded: false });
  const thisMonth = payments.filter((p) => p.receivedAt >= monthStart);
  const monthParts = thisMonth.flatMap((p) => partsForPayment(p.id));
  const received = thisMonth.reduce((s, p) => s + p.amountCents, 0);
  const kept = monthParts.filter((p) => p.status === "kept" || p.status === "declined").reduce((s, p) => s + p.cents, 0);
  const paidOut = monthParts.filter((p) => p.status === "paid").reduce((s, p) => s + p.cents, 0);
  const approvals = partsWaitingApproval();
  const waitingPayments = payments.filter((p) => p.status === "waiting_user" || p.status === "waiting_plan");
  const latest = payments.find((p) => !["waiting_user", "waiting_plan", "recorded"].includes(p.status));
  const latestParts = latest ? partsForPayment(latest.id) : [];
  const payoutPots = plan?.pots.filter((p) => p.destinationId !== null) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{monthTitle(now)}</h1>
          <p className="page-sub">
            {Math.round(period.elapsed * 100)}% of the month is gone, {period.daysLeft} days left.
            {plan ? " Every payment that arrives is divided by your approved plan." : " Nothing is divided until you approve a plan."}
          </p>
        </div>
        <form action={checkNowAction}>
          <button className="btn">Check PayPal now</button>
        </form>
      </div>

      {params.approved ? <div className="notice ok" style={{ marginBottom: 16 }}>Plan approved. New payments now divide by themselves.</div> : null}
      {params.spent ? <div className="notice ok" style={{ marginBottom: 16 }}>Payment from the pot sent to PayPal. Its status is on the overview.</div> : null}

      {nudges.length ? (
        <div className="stack" style={{ marginBottom: 16 }}>
          {nudges.map((n) => (
            <div key={n.id} className="card nudge">
              <span className="nudge-mark" aria-hidden />
              <div>
                <p>{n.message}</p>
                <p className="small muted" style={{ marginTop: 4 }}>
                  Code found this pot ahead of pace. {n.source === "ai" ? "The AI agent wrote the words." : "Written from a fixed template."}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Received this month</div>
          <div className="stat-value">{formatMoney(received, cur)}</div>
          <div className="stat-note">{thisMonth.length} payment{thisMonth.length === 1 ? "" : "s"} through Portion</div>
        </div>
        <div className="stat">
          <div className="stat-label">Kept in pots</div>
          <div className="stat-value">{formatMoney(kept, cur)}</div>
          <div className="stat-note">Stays in the account under each pot</div>
        </div>
        <div className="stat">
          <div className="stat-label">Paid out</div>
          <div className="stat-value">{formatMoney(paidOut, cur)}</div>
          <div className="stat-note">Confirmed by PayPal, part by part</div>
        </div>
        <div className="stat">
          <div className="stat-label">Waiting on you</div>
          <div className="stat-value">{approvals.length + waitingPayments.length}</div>
          <div className="stat-note">Approvals and unsure payments</div>
        </div>
      </div>

      <div className="grid cols-main">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Pots this month</h2>
            <span className="card-meta">The dark tick is where each pot should be today</span>
          </div>
          {!plan ? (
            <p className="empty">
              No approved plan yet. <Link href="/plan" style={{ color: "var(--accent-ink)" }}>Make one</Link> from your earnings and your own words.
            </p>
          ) : pots.length === 0 ? (
            <p className="empty">Every pot in your plan pays out on arrival, so there is nothing to pace.</p>
          ) : (
            <div className="pots">
              {pots.map((p) => {
                const used = Math.min(1, p.usedShare);
                const colorIndex = Math.max(0, plan.pots.findIndex((x) => x.key === p.key));
                return (
                  <div className="pot" key={p.key}>
                    <div>
                      <div className="pot-name">
                        <span className="dot" style={{ background: potColor(colorIndex) }} aria-hidden />
                        {p.name}
                      </div>
                      <div className="pot-purpose">{p.purpose}</div>
                    </div>
                    <div className="pot-figure">
                      {formatMoney(p.leftCents, cur)}
                      <small>left of {formatMoney(p.fundedCents, cur)}</small>
                    </div>
                    <div className="bar" aria-label={`${Math.round(used * 100)}% used`}>
                      <div className={`bar-fill${p.ahead ? " ahead" : ""}`} style={{ width: `${used * 100}%` }} />
                      <div className="bar-today" style={{ left: `calc(${period.elapsed * 100}% - 1px)` }} />
                    </div>
                    <div className="pot-foot">
                      <span>{p.fundedCents === 0 ? "Nothing in this pot yet this month" : `${Math.round(used * 100)}% used`}</span>
                      <span className={p.ahead ? "ahead" : ""}>
                        {p.ahead ? "Ahead of pace" : p.fundedCents ? `On pace, about ${formatMoney(p.expectedLeftCents, cur)} should be left today` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {payoutPots.length ? (
            <p className="small muted" style={{ marginTop: 16 }}>
              Paid out on arrival:{" "}
              {payoutPots.map((p) => `${p.name} to ${getDestination(p.destinationId!)?.label ?? "?"}`).join(", ")}.
            </p>
          ) : null}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Waiting for you</h2>
            </div>
            {approvals.length === 0 && waitingPayments.length === 0 ? (
              <p className="empty">Nothing waiting.</p>
            ) : (
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
                  <div className="list-row" key={`part-${part.id}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontWeight: 500 }}>
                        {formatMoney(part.cents, cur)} to {part.receiverEmail}
                      </span>
                      <span className="muted small">{part.potName}</span>
                    </div>
                    <p className="reason">{part.holdReason}</p>
                    <PartActions part={part} back="/" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {latest ? (
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">Latest payment</h2>
                <Link href={`/payments/${latest.id}`} className="card-meta">
                  {formatDate(latest.receivedAt)}
                </Link>
              </div>
              <p style={{ marginBottom: 12 }}>
                <span className="num" style={{ fontWeight: 500 }}>{formatMoney(latest.amountCents, latest.currency)}</span>
                <span className="soft"> from {latest.payerName ?? "a payer"}</span>
              </p>
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
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
