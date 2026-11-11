import Link from "next/link";
import { SpendForm } from "@/components/spend-form";
import { potPace } from "@/lib/budget";
import { potColor } from "@/lib/format";
import { currency } from "@/lib/paypal";
import { getActivePlan, listDestinations } from "@/lib/repo";

export default async function SpendPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const cur = currency();
  const plan = getActivePlan();
  const { pots } = potPace(new Date(), plan);
  const destinations = listDestinations();
  const colorOf = (key: string) => potColor(Math.max(0, plan?.pots.findIndex((x) => x.key === key) ?? 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Pay from an envelope</h1>
          <p className="page-sub">Sends a PayPal payout from money an envelope is holding, and counts it against that envelope’s pace for the month.</p>
        </div>
      </div>
      <section className="card spend-card">
        {params.error ? <div className="notice bad" style={{ marginBottom: 20 }}>{params.error}</div> : null}
        {!plan || pots.length === 0 ? (
          <p className="empty">
            You need an approved plan with at least one envelope that keeps its money. <Link href="/plan" className="link">Go to the plan</Link>
          </p>
        ) : destinations.length === 0 ? (
          <p className="empty">
            Add who you pay first. <Link href="/settings" className="link">Add someone to pay</Link>
          </p>
        ) : (
          <SpendForm
            currency={cur}
            initialPot={params.pot}
            pots={pots.map((p) => ({
              key: p.key,
              name: p.name,
              color: colorOf(p.key),
              leftCents: p.leftCents,
              fundedCents: p.fundedCents,
              expectedLeftCents: p.expectedLeftCents,
            }))}
            destinations={destinations.map((d) => ({ id: d.id, label: d.label, email: d.email, approved: d.approved }))}
          />
        )}
      </section>
    </>
  );
}
