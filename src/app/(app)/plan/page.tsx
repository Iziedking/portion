import { approvePlanAction, proposePlanAction, saveDraftAction, seedAction } from "@/app/actions";
import { parseProblems, Problems } from "@/components/ui";
import { earningSummary, tryOnPastPayments } from "@/lib/budget";
import { formatDate, potColor } from "@/lib/format";
import { formatMoney, toAmount } from "@/lib/money";
import { currency } from "@/lib/paypal";
import { getActivePlan, getLatestDraft, listDestinations, listPayments, type Plan, type Pot } from "@/lib/repo";

const SOURCE_LABEL = { ai: "Proposed by the AI agent", preview: "Fixed preview rules, not AI", user: "Typed by you" } as const;

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

function PotCards({ plan, destinations, cur }: { plan: Plan; destinations: { id: number; label: string }[]; cur: string }) {
  return (
    <div className="pot-cards">
      {plan.pots.map((p, i) => (
        <div className="pot-card" key={p.id}>
          <div className="pot-card-top">
            <span className="pot-name">
              <span className="dot" style={{ background: potColor(i) }} aria-hidden />
              {p.name}
            </span>
            <span className="pot-share mono">{shareText(p, cur)}</span>
          </div>
          <p className="reason">{p.reason || p.purpose}</p>
          <span className={`small ${p.destinationId ? "pays" : "muted"}`}>
            {p.destinationId ? `Pays ${destinations.find((d) => d.id === p.destinationId)?.label ?? "someone"}` : "Kept in account"}
          </span>
        </div>
      ))}
    </div>
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
  const words = draft?.userWords ?? active?.userWords ?? "";
  const recent = payments.slice(0, 9).reverse();
  const top = Math.max(1, ...recent.map((p) => p.amountCents));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Plan</h1>
          <p className="page-sub">The AI agent proposes. Code checks. You approve. This is a budget you choose, not investment or tax advice.</p>
        </div>
      </div>

      <div className="stack">
        {problems.length ? <Problems list={problems} /> : null}
        {params.error ? <div className="notice bad">{params.error}</div> : null}
        {params.fallback ? <div className="notice">The AI agent was not available, so this draft comes from fixed preview rules. It is labelled that way below.</div> : null}
        {params.saved ? <div className="notice ok">Draft saved and checked.</div> : null}

        <div className="plan-grid">
          <div className="stack">
            <section className="card said">
              {words && !params.rewrite ? (
                <>
                  <span className="small muted">You said</span>
                  <p className="said-words">{words}</p>
                  <a href="/plan?rewrite=1" className="btn quiet small said-edit">Change my words</a>
                </>
              ) : (
                <form action={proposePlanAction} className="stack">
                  <label htmlFor="words" className="strong">Tell the AI agent about your month</label>
                  <textarea
                    id="words"
                    className="textarea"
                    name="words"
                    rows={6}
                    maxLength={1500}
                    defaultValue={words}
                    placeholder="Rent is 900 a month, phone and power about 120. I want to keep 25% for tax, send Tunde his share when it is the logo work, and save for a laptop."
                    required
                  />
                  <button className="btn primary">Propose a plan</button>
                  <p className="small muted">The AI agent sees your amounts and dates, your words and the names of the people you pay. It never sees their emails and cannot add one.</p>
                </form>
              )}
            </section>

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
                  <div className="earn-bars" role="img" aria-label="Your recent payments by size">
                    {recent.map((p, i) => (
                      <span key={p.id} className={i === recent.length - 1 ? "on" : ""} style={{ height: `${Math.max(4, (p.amountCents / top) * 100)}%` }} title={`${formatDate(p.receivedAt)} ${formatMoney(p.amountCents, p.currency)}`} />
                    ))}
                  </div>
                  <p className="soft small" style={{ marginTop: 12 }}>
                    {summary.count} payments over {summary.months} month{summary.months === 1 ? "" : "s"}, from <span className="num">{cur} {summary.smallest}</span> to{" "}
                    <span className="num">{cur} {summary.largest}</span>. Pattern: {summary.unevenness}.
                  </p>
                  <details className="fold">
                    <summary>Show the {Math.min(10, payments.length)} latest payments</summary>
                    <table className="table">
                      <tbody>
                        {payments.slice(0, 10).map((p) => (
                          <tr key={p.id}>
                            <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDate(p.receivedAt)}</td>
                            <td>{p.note || <span className="muted">No note</span>} {p.seeded ? <span className="seeded">seeded</span> : null}</td>
                            <td className="amt">{formatMoney(p.amountCents, p.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </section>
          </div>

          <div className="stack">
            {draft ? (
              <section className="card proposal">
                <div className="card-head">
                  <h2 className="card-title proposal-title">
                    <span className="ai-mark mono" aria-hidden>AI</span>
                    {draft.source === "user" ? "Your draft plan" : `The AI agent proposes ${draft.pots.length} envelopes`}
                  </h2>
                  <span className="tag">{SOURCE_LABEL[draft.source]}</span>
                </div>
                {draft.summary ? <p className="soft">{draft.summary}</p> : null}
                {draft.savingsNote ? <p className="soft small" style={{ marginTop: 8 }}>{draft.savingsNote}</p> : null}
                <div style={{ marginTop: 20 }}>
                  <PotCards plan={draft} destinations={destinations} cur={cur} />
                </div>

                <div className="tried">
                  <div className="strong">Tried on your last payments</div>
                  <p className="small muted">What this draft would have done. Nothing is paid.</p>
                  {trial.map((t) => (
                    <div className="tried-row" key={t.paymentId}>
                      <span className="mono small muted">{t.date.slice(5)}</span>
                      <span className="num strong small">{formatMoney(t.amountCents, cur)}</span>
                      {t.parts ? (
                        <span className="tried-strip">
                          {t.parts.map((x, i) => (
                            <span key={x.potName} style={{ flexGrow: x.cents, background: potColor(i) }} title={`${x.potName} ${formatMoney(x.cents, cur)}`} />
                          ))}
                        </span>
                      ) : (
                        <span className="small muted">{t.problem}</span>
                      )}
                    </div>
                  ))}
                </div>

                <form action={approvePlanAction} className="approve-bar">
                  <input type="hidden" name="planId" value={draft.id} />
                  <div className="checks">
                    {["Shares add to 100%", "Only people you added", "No emails in the text"].map((c) => (
                      <span key={c} className="check small">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {c}
                      </span>
                    ))}
                  </div>
                  <button className="btn primary lg">Approve this plan</button>
                </form>
              </section>
            ) : active ? (
              <section className="card proposal">
                <div className="card-head">
                  <h2 className="card-title">Approved plan</h2>
                  <span className="card-meta">
                    {SOURCE_LABEL[active.source]}, approved {active.approvedAt ? formatDate(active.approvedAt) : ""}
                  </span>
                </div>
                <PotCards plan={active} destinations={destinations} cur={cur} />
                <p className="small muted" style={{ marginTop: 16 }}>Each new payment divides by this plan with no clicks. New people and amounts over your limits still wait for you.</p>
              </section>
            ) : (
              <section className="card proposal empty-proposal">
                <h2 className="card-title">The AI agent’s proposal appears here</h2>
                <p className="soft">Write what you need on the left. The AI agent proposes envelopes with a reason for each, code checks them, and you approve.</p>
              </section>
            )}

            {editing ? (
              <details className="card fold-card">
                <summary className="strong">{draft ? "Edit shares by hand" : "Change the plan by hand"}</summary>
                <p className="small muted" style={{ margin: "8px 0 16px" }}>Saving makes a draft. The approved plan keeps running until you approve the new one.</p>
                <Editor plan={editing} destinations={destinations} />
              </details>
            ) : (
              <details className="card fold-card">
                <summary className="strong">Or write a plan by hand</summary>
                <div style={{ marginTop: 16 }}>
                  <Editor plan={null} destinations={destinations} />
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
