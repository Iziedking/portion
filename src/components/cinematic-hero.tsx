"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** 0 before `a`, 1 after `b`, eased in between. */
const ease = (p: number, a: number, b: number) => {
  const t = clamp((p - a) / (b - a));
  return 1 - Math.pow(1 - t, 3);
};

const POTS = [
  { name: "Tax", left: "$300.00", fill: 1, color: "#3d7a5c" },
  { name: "Rent and bills", left: "$132.00", fill: 0.31, color: "#4f6f8f", ahead: true },
  { name: "Buffer", left: "$168.00", fill: 1, color: "#a85d4a" },
  { name: "Laptop", left: "$120.00", fill: 1, color: "#7a6a9a" },
];

function PhoneToday({ fill }: { fill: number }) {
  return (
    <div className="phone" aria-label="Portion's Today screen on a phone">
      <div className="phone-island" aria-hidden />
      <div className="phone-screen">
        <div className="ph-title">November 2026</div>
        <div className="ph-line">
          <span className="ph-track"><span className="ph-gone" /><span className="ph-tick" /></span>
          <span className="mono">Day 11 of 30</span>
        </div>
        <div className="ph-card">
          <div className="ph-label">Left in your envelopes</div>
          <div className="ph-big">$780.00</div>
          <div className="ph-grid">
            {POTS.map((p) => (
              <div className="ph-env" key={p.name}>
                <div className="ph-body">
                  <span className="ph-ink" style={{ height: `${p.fill * 100 * fill}%`, background: p.color }} />
                  <svg className="ph-flap" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
                    <polyline points="0,0 50,30 100,0" />
                  </svg>
                  <span className="ph-pace" />
                </div>
                <div className="ph-name">{p.name}</div>
                <div className={`ph-left${p.ahead ? " ahead" : ""}`}>{p.left}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ph-nudge">Rent and bills is 69% used and the month is 33% gone.</div>
      </div>
    </div>
  );
}

function Badge({ title, sub, className }: { title: string; sub: string; className: string }) {
  return (
    <div className={`cine-badge ${className}`}>
      <span className="cine-badge-icon" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span>
        <span className="cine-badge-title">{title}</span>
        <span className="cine-badge-sub">{sub}</span>
      </span>
    </div>
  );
}

/**
 * Landing hero in four scroll stages: the headline, an ink card rising, the product on a phone,
 * then the call to action. Transform and opacity only. Reduced motion shows the product stage still.
 */
export function CinematicHero({ demoHref, codeHref }: { demoHref: string; codeHref: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-still");
      return;
    }
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s);
    const head = q(".cine-head"), card = q(".cine-card"), inner = q(".cine-inner"), phone = q(".cine-phone"), cta = q(".cine-cta");
    const badges = Array.from(el.querySelectorAll<HTMLElement>(".cine-badge"));
    const inks = Array.from(el.querySelectorAll<HTMLElement>(".ph-ink"));
    const heights = inks.map((i) => i.style.height);
    let frame = 0;
    const draw = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      const p = clamp(-rect.top / Math.max(1, span));
      const rise = ease(p, 0.02, 0.3);
      const grow = ease(p, 0.28, 0.44);
      const show = ease(p, 0.4, 0.56);
      const fillIn = ease(p, 0.46, 0.62);
      const badge1 = ease(p, 0.52, 0.62);
      const badge2 = ease(p, 0.56, 0.66);
      const leave = ease(p, 0.78, 0.94);
      if (head) {
        head.style.opacity = String((1 - 0.85 * rise) * (1 - leave));
        head.style.transform = `scale(${1 + 0.1 * rise})`;
      }
      if (card) {
        const vh = window.innerHeight;
        const y = (1 - rise) * (vh * 0.92) - leave * (vh * 1.15);
        const s = 0.86 + 0.14 * grow;
        card.style.transform = `translate3d(0, ${y}px, 0) scale(${s})`;
        card.style.borderRadius = `${Math.round(36 * (1 - grow))}px`;
      }
      if (inner) inner.style.opacity = String(show);
      if (phone) phone.style.transform = `translate3d(0, ${(1 - show) * 80}px, 0)`;
      inks.forEach((ink, i) => {
        const full = parseFloat(heights[i] ?? "0") || 0;
        ink.style.height = `${full * fillIn}%`;
      });
      badges[0] && Object.assign(badges[0].style, { opacity: String(badge1), transform: `translate3d(0, ${(1 - badge1) * 24}px, 0)` });
      badges[1] && Object.assign(badges[1].style, { opacity: String(badge2), transform: `translate3d(0, ${(1 - badge2) * 24}px, 0)` });
      if (cta) {
        cta.style.opacity = String(leave);
        cta.style.transform = `translate3d(0, ${(1 - leave) * 24}px, 0)`;
        cta.style.pointerEvents = leave > 0.5 ? "auto" : "none";
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="cine">
      <div className="cine-sticky">
        <div className="cine-head">
          <h1 className="cine-title">
            Every payment,
            <span className="cine-title-2">already split.</span>
          </h1>
          <p className="cine-sub">A budget holder for freelancers paid through PayPal</p>
          <span className="cine-hint">Scroll to watch a payment</span>
        </div>

        <div className="cine-cta">
          <h2 className="cine-cta-title">Try it with sandbox money</h2>
          <p className="cine-cta-sub">Load the demo history, let the AI agent propose a plan, and pay yourself through PayPal sandbox checkout.</p>
          <div className="cine-cta-actions">
            <Link href={demoHref} className="btn primary lg">Open the live demo</Link>
            <a href={codeHref} className="btn lg" target="_blank" rel="noreferrer">Read the code</a>
          </div>
          <p className="small muted">PayPal sandbox only. No real money moves.</p>
        </div>

        <div className="cine-card">
          <div className="cine-inner">
            <div className="cine-left">
              <h2 className="cine-left-title">Your budget, held for you</h2>
              <p className="cine-left-text">
                An AI agent reads how you earn and proposes envelopes with a reason for each. You approve them once. From then on
                every PayPal payment is divided to the cent, and shares for other people go out as a PayPal payout.
              </p>
            </div>
            <div className="cine-center">
              <div className="cine-phone">
                <PhoneToday fill={1} />
              </div>
              <Badge className="b1" title="Plan approved" sub="6 envelopes, shares add to 100%" />
              <Badge className="b2" title="Payout confirmed by PayPal" sub="Lawful, $120.00" />
            </div>
            <div className="cine-right">
              <div className="cine-brand">Portion</div>
              <div className="cine-brand-sub">PayPal in, envelopes out</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
