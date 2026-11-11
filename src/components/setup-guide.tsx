import Link from "next/link";
import { proposePlanAction } from "@/app/actions";
import { CopyLink } from "./copy-link";

export interface SetupState {
  destinations: string[];
  hasPlan: boolean;
  hasDraft: boolean;
  hasPayment: boolean;
  historyCount: number;
  payLink: string;
}

function Mark({ state, n }: { state: "done" | "current" | "todo"; n: number }) {
  return (
    <span className={`setup-mark is-${state}`} aria-hidden>
      {state === "done" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

/** First-run guide on Today: who you pay, the plan, the pay link. Each step ticks off from real data. */
export function SetupGuide({ s }: { s: SetupState }) {
  const step1 = s.destinations.length > 0;
  const step2 = s.hasPlan;
  const step3 = s.hasPayment;
  const done = [step1, step2, step3].filter(Boolean).length;
  const state = (ok: boolean, prev: boolean) => (ok ? "done" : prev ? "current" : "todo");
  const st1 = step1 ? "done" : "current";
  const st2 = state(step2, step1);
  const st3 = state(step3, step1 && step2);

  return (
    <section className="card setup" aria-label="Get Portion ready">
      <div className="setup-head">
        <div>
          <h2 className="setup-title">Get Portion ready</h2>
          <p className="soft">Three steps, then every PayPal payment divides by itself</p>
        </div>
        <div className="setup-progress" aria-label={`${done} of 3 done`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < done ? "on" : ""} />
          ))}
          <span className="mono small muted">{done} of 3 done</span>
        </div>
      </div>

      <div className={`setup-step is-${st1}`}>
        <Mark state={st1} n={1} />
        <div className="setup-body">
          <div className="setup-step-title">Add who you pay</div>
          <p className="soft">
            {step1
              ? `${s.destinations.join(" and ")} ${s.destinations.length === 1 ? "is" : "are"} added. Only you can add people; the AI agent sees their names, never their emails.`
              : "Add the PayPal emails your envelopes can pay, like a collaborator or your landlord. Only you can add people."}
          </p>
          {!step1 ? (
            <div className="actions">
              <Link href="/settings" className="btn primary">Add someone to pay</Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`setup-step is-${st2}`}>
        <Mark state={st2} n={2} />
        <div className="setup-body">
          <div className="setup-step-title">Tell the AI agent about your month</div>
          {step2 ? (
            <p className="soft">Plan approved. <Link href="/plan" className="link">See your envelopes</Link></p>
          ) : s.hasDraft ? (
            <>
              <p className="soft">The AI agent has proposed a plan. Read it, change anything, then approve it.</p>
              <div className="actions"><Link href="/plan" className="btn primary">Review the plan</Link></div>
            </>
          ) : (
            <>
              <p className="soft">
                Write it the way you would say it.{" "}
                {s.historyCount ? `The AI agent reads your ${s.historyCount} past payments too, then proposes envelopes with a reason for each.` : "Load the demo history on the Plan page so the AI agent can see how you earn."}
              </p>
              {st2 === "current" ? (
                <form action={proposePlanAction} className="setup-form">
                  <textarea
                    className="textarea"
                    name="words"
                    rows={3}
                    maxLength={1500}
                    required
                    placeholder="Rent is 900 a month and bills about 120. I keep a quarter of every payment for tax. I want a laptop and a buffer for slow months."
                  />
                  <div className="actions">
                    <button className="btn primary">Propose my plan</button>
                    <span className="small muted">Nothing runs until you approve it</span>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className={`setup-step is-${st3}`}>
        <Mark state={st3} n={3} />
        <div className="setup-body">
          <div className="setup-step-title">Share your pay link</div>
          <p className="soft">
            {step3
              ? "A client has paid. Its money trail is on the Payments page."
              : "Send clients this link. They pay with PayPal, and Portion divides the payment the moment it is captured."}
          </p>
          {!step3 ? <CopyLink url={s.payLink} /> : null}
        </div>
      </div>
    </section>
  );
}
