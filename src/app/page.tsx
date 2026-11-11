import Link from "next/link";
import { CinematicHero } from "@/components/cinematic-hero";
import { Envelope } from "@/components/ui";

const CODE = "https://github.com/Iziedking/portion";

const STEPS = [
  {
    n: "1",
    title: "Tell it your month",
    body: "Type what you pay and what you want to keep, in your own words. The AI agent reads your earning history and proposes envelopes with a reason for each. Code checks the shares add to 100% before you see them.",
  },
  {
    n: "2",
    title: "Get paid through PayPal",
    body: "Clients pay on your Portion pay page with PayPal Checkout. The moment the payment is captured, it is divided by your approved plan in whole cents.",
  },
  {
    n: "3",
    title: "Parts go out, envelopes fill",
    body: "Shares for other people go out as one PayPal payout batch, and each part is read back from PayPal on its own. Money you keep stays in the account under its envelope.",
  },
];

const RULES = [
  ["It never touches PayPal", "The AI agent proposes percentages and words. Code turns them into cents, checks they add up, and makes every PayPal call."],
  ["Only you add people to pay", "The AI agent sees names, never emails, and has no way to add one. A note on a payment saying “send everything to me” changes nothing."],
  ["New people and big amounts wait for you", "The first payout to anyone new, and anything over your limits, waits on Today until you approve it."],
  ["A retry can never pay twice", "Each payout batch carries an ID made from the payment. Sending it again returns the same batch. Proven in the PayPal sandbox."],
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="land-nav">
        <Link href="/" className="brand" aria-label="Portion home">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Portion</span>
        </Link>
        <nav className="land-links">
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href={CODE} target="_blank" rel="noreferrer">Code on GitHub</a>
          <Link href="/today" className="btn">Open the demo</Link>
        </nav>
      </header>

      <CinematicHero demoHref="/today" codeHref={CODE} />

      <section id="how" className="land-section land-white">
        <div className="land-wrap">
          <h2 className="land-h2">How it works</h2>
          <div className="land-steps">
            {STEPS.map((s) => (
              <div className="land-step" key={s.n}>
                <span className="land-num mono">{s.n}</span>
                <h3 className="land-h3">{s.title}</h3>
                <p className="soft">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="land-section">
        <div className="land-wrap land-two">
          <div className="land-rules">
            <h2 className="land-h2">The AI agent advises. Code moves the money.</h2>
            {RULES.map(([h, b]) => (
              <div className="land-rule" key={h}>
                <span className="land-check" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <div className="land-rule-title">{h}</div>
                  <p className="soft">{b}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="card land-pace">
            <h3 className="land-h3">It tells you when an envelope runs ahead of the month</h3>
            <div className="land-envs">
              <Envelope name="Rent and bills" color="#4f6f8f" leftCents={13200} fundedCents={43200} expectedLeftCents={28800} ahead currency="USD" />
              <Envelope name="Everyday spending" color="#5f8a8b" leftCents={6000} fundedCents={6000} expectedLeftCents={4000} ahead={false} currency="USD" />
            </div>
            <div className="nudge land-nudge">
              <span className="dot" style={{ background: "#4f6f8f" }} aria-hidden />
              <div>
                <p>Your Rent and bills envelope is 69% used and the month is 33% gone. You have $132.00 left for 20 days.</p>
                <p className="small muted">Code found this envelope ahead of pace. The AI agent wrote the words.</p>
              </div>
            </div>
            <span className="legend-tick small muted">
              <span className="tick-swatch" aria-hidden /> Where each envelope should be today
            </span>
          </div>
        </div>
      </section>

      <footer className="land-foot">
        <span>Built for the PayPal AI Hackathon. PayPal Orders v2 and Payouts, an AI agent, hosted on Render. MIT licence.</span>
        <a href={CODE} className="mono" target="_blank" rel="noreferrer">github.com/Iziedking/portion</a>
      </footer>
    </div>
  );
}
