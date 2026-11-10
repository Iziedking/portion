import { approvePlanAction, proposePlanAction, saveDraftAction, seedAction } from "@/app/actions";
import { parseProblems, Problems } from "@/components/ui";
import { earningSummary, tryOnPastPayments } from "@/lib/budget";
import { formatDate, potColor } from "@/lib/format";
import { formatMoney, toAmount } from "@/lib/money";
import { currency } from "@/lib/paypal";
import { getActivePlan, getLatestDraft, listDestinations, listPayments, type Plan, type Pot } from "@/lib/repo";

const SOURCE_LABEL = { ai: "Proposed by the AI agent", preview: "Proposed by fixed preview rules, not AI", user: "Typed by you" } as const;

function shareText(p: Pot, cur: string) {
  return p.shareKind === "percent" ? `${(p.shareBps / 100).toFixed(p.shareBps % 100 ? 2 : 0)}%` : formatMoney(p.fixedCents, cur);
}

function Editor({ plan, destinations }: { plan: Plan | null; destinations: { id: number; label: string; email: string }[] }) {
  const rows = [...(plan?.pots ?? []), ...Array.from({ length: Math.max(2, 7 - (plan?.pots.length ?? 0)) }, () => null)].slice(0, 12);
  return (
    <form action={saveDraftAction}>
      <table className="pot-editor">
        <thead>
          <tr>
            <th style={{ width: "18%" }}>Pot</th>
            <th>Purpose</th>
            <th style={{ width: 110 }}>Share</th>
            <th style={{ width: 96 }}>Value</th>
            <th style={{ width: "20%" }}>Destination</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <FragmentRow key={i} i={i} p={p} destinations={destinations} />
          ))}
        </tbody>
      </table>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn">Save changes</button>
        <span className="small muted">Leave a name empty to drop that pot. Fixed amounts come out first, percents split the rest and must add up to 100.</span>
      </div>
    </form>
  );
}

function FragmentRow({ i, p, destinations }: { i: number; p: Pot | null; destinations: { id: number; label: string; email: string }[] }) {
  return (
    <>
      <tr>
        <td><input className="input" name={`name_${i}`} defaultValue={p?.name ?? ""} placeholder="Name" maxLength={40} /></td>
        <td><input className="input" name={`purpose_${i}`} defaultValue={p?.purpose ?? ""} placeholder="What it is for" maxLength={140} /></td>
        <td>
          <select className="select" name={`kind_${i}`} defaultValue={p?.shareKind ?? "percent"}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </td>
        <td>
          <input
            className="input num"
            name={`value_${i}`}
            inputMode="decimal"
            defaultValue={p ? (p.shareKind === "percent" ? String(p.shareBps / 100) : toAmount(p.fixedCents)) : ""}
          />
        </td>
        <td>
          <select className="select" name={`dest_${i}`} defaultValue={p?.destinationId ? String(p.destinationId) : "keep"}>
            <option value="keep">Keep in account</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>Pay {d.label}</option>
            ))}
          </select>
        </td>
      </tr>
      <tr>
        <td />
        <td colSpan={4} className="reason-cell">
          <input className="input" name={`reason_${i}`} defaultValue={p?.reason ?? ""} placeholder="Reason, one line" maxLength={240} style={{ height: 32, fontSize: 13 }} />
        </td>
      </tr>
    </>
  );
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const cur = currency();
  const payments = listPayments().filter((p) => p.status !== "waiting_user");
  const summary = earningSummary(payments);
  const draft = getLatestDraft();
  const active = getActivePlan();
  const destinations = listDestinations();
  const problems = parseProblems(params.problems);
  const editing = draft ?? active;
  const trial = draft ? tryOnPastPayments(draft.pots, 6) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Plan</h1>
          <p className="page-sub">
            The AI agent reads how you earn and what you tell it, then proposes pots with a reason for each. Code checks the proposal.
            Nothing runs until you approve it. This is a budget you choose, not investment or tax advice.
          </p>
        </div>
      </div>

      <div className="stack-lg">
        {problems.length ? <Problems list={problems} /> : null}
        {params.error ? <div className="notice bad">{params.error}</div> : null}
        {params.fallback ? (
          <div className="notice">The AI agent was not available, so this draft comes from fixed preview rules. It is labelled that way below.</div>
        ) : null}
        {params.saved ? <div className="notice ok">Draft saved and checked.</div> : null}

        <div className="grid cols-main">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">How you earn</h2>
              <span className="card-meta">Payments recorded by Portion</span>
            </div>
            {summary.count === 0 ? (
              <div className="stack">
                <p className="empty">No payments yet. A new sandbox account has no history, so you can load a seeded demo history.</p>
                <form action={seedAction}>
                  <button className="btn">Load seeded demo history</button>
                </form>
              </div>
            ) : (
              <>
                <p className="soft" style={{ marginBottom: 16 }}>
                  {summary.count} payments over {summary.months} month{summary.months === 1 ? "" : "s"}, average{" "}
                  <span className="num">{cur} {summary.averageAmount}</span>. Smallest <span className="num">{summary.smallest}</span>,
                  largest <span className="num">{summary.largest}</span>. Pattern: {summary.unevenness}.
                </p>
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Note</th><th className="amt">Amount</th></tr>
                  </thead>
                  <tbody>
                    {payments.slice(0, 10).map((p) => (
                      <tr key={p.id}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDate(p.receivedAt)}</td>
                        <td>
                          {p.note || <span className="muted">No note</span>} {p.seeded ? <span className="seeded">seeded</span> : null}
                        </td>
                        <td className="amt">{formatMoney(p.amountCents, p.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Tell Portion what you need</h2>
            </div>
            <form action={proposePlanAction} className="stack">
              <textarea
                className="textarea"
                name="words"
                rows={7}
                maxLength={1500}
                defaultValue={draft?.userWords ?? active?.userWords ?? ""}
                placeholder="Rent is 900 a month, phone and power about 120. I want to keep 25% for tax, send Tunde his share when it is the logo work, and save for a laptop."
                required
              />
              <button className="btn primary">Propose a plan</button>
              <p className="small muted">
                The AI agent sees your amounts and dates, your words and the names of your destinations. It never sees their emails and cannot add one.
              </p>
            </form>
          </section>
        </div>

        {draft ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Draft plan</h2>
              <span className="card-meta">{SOURCE_LABEL[draft.source]}</span>
            </div>
            {draft.summary ? <p style={{ marginBottom: 8 }}>{draft.summary}</p> : null}
            {draft.savingsNote ? <p className="soft" style={{ marginBottom: 16 }}>{draft.savingsNote}</p> : null}
            <div className="list" style={{ marginBottom: 24 }}>
              {draft.pots.map((p, i) => (
                <div className="list-row" key={p.id} style={{ alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span className="dot" style={{ background: potColor(i), marginTop: 6 }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {p.name} <span className="soft num">{shareText(p, cur)}</span>
                      </div>
                      <p className="reason">{p.reason || p.purpose}</p>
                    </div>
                  </div>
                  <span className="small muted" style={{ whiteSpace: "nowrap" }}>
                    {p.destinationId ? `Pays ${destinations.find((d) => d.id === p.destinationId)?.label}` : "Kept in account"}
                  </span>
                </div>
              ))}
            </div>

            <h3 className="card-title" style={{ marginBottom: 8 }}>Try it on past payments</h3>
            <p className="small muted" style={{ marginBottom: 12 }}>What this draft would have done. Nothing is paid.</p>
            <table className="table" style={{ marginBottom: 24 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="amt">Payment</th>
                  {draft.pots.map((p) => <th key={p.id} className="amt">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {trial.map((t) => (
                  <tr key={t.paymentId}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{t.date} {t.seeded ? <span className="seeded">seeded</span> : null}</td>
                    <td className="amt">{formatMoney(t.amountCents, cur)}</td>
                    {t.parts
                      ? t.parts.map((x) => <td key={x.potName} className="amt">{formatMoney(x.cents, cur)}</td>)
                      : <td colSpan={draft.pots.length} className="muted">{t.problem}</td>}
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="card-title" style={{ marginBottom: 12 }}>Edit</h3>
            <Editor plan={draft} destinations={destinations} />
            <form action={approvePlanAction} style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }} className="actions">
              <input type="hidden" name="planId" value={draft.id} />
              <button className="btn primary lg">Approve this plan</button>
              <span className="small muted">
                After this, each new payment is divided with no clicks. New destinations and amounts over your limits still wait for you.
              </span>
            </form>
          </section>
        ) : null}

        {active ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Approved plan</h2>
              <span className="card-meta">
                {SOURCE_LABEL[active.source]}, approved {active.approvedAt ? formatDate(active.approvedAt) : ""}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Pot</th><th>Reason</th><th>Destination</th><th className="amt">Share</th></tr>
              </thead>
              <tbody>
                {active.pots.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="dot" style={{ background: potColor(i), marginRight: 8 }} />
                      {p.name}
                    </td>
                    <td className="reason">{p.reason || p.purpose}</td>
                    <td className="soft">{p.destinationId ? destinations.find((d) => d.id === p.destinationId)?.label : "Kept in account"}</td>
                    <td className="amt">{shareText(p, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {!draft ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">{active ? "Change the plan" : "Or write a plan by hand"}</h2>
              <span className="card-meta">Saving makes a draft. The approved plan keeps running until you approve the new one.</span>
            </div>
            <Editor plan={editing} destinations={destinations} />
          </section>
        ) : null}
      </div>
    </>
  );
}
