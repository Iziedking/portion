import { useFreshDatabase } from "@/lib/db";
import { setAdvisor, type Advisor, type PaymentCheck, type PlanProposal } from "@/lib/ai";
import { setGateway } from "@/lib/paypal";
import { PreviewGateway, resetPreviewState } from "@/lib/paypal/preview";
import { addDestination, approvePlan, markDestinationApproved, recordPayment, saveDraft, setLimits } from "@/lib/repo";
import type { PotDraft } from "@/lib/plan";

export class ScriptedAdvisor implements Advisor {
  readonly mode = "claude" as const;
  check: PaymentCheck | Error = { decision: "apply", reason: "Client payment.", source: "ai" };
  proposal: PlanProposal | null = null;
  nudge = "";
  seenNotes: string[] = [];

  async checkPayment(input: { note: string }) {
    this.seenNotes.push(input.note);
    if (this.check instanceof Error) throw this.check;
    return this.check;
  }
  async proposePlan() {
    if (!this.proposal) throw new Error("no proposal scripted");
    return this.proposal;
  }
  async writeNudge() {
    return { message: this.nudge, source: "ai" as const };
  }
}

export function freshWorld() {
  useFreshDatabase();
  resetPreviewState();
  setGateway(new PreviewGateway("http://localhost:3000"));
  const advisor = new ScriptedAdvisor();
  setAdvisor(advisor);
  setLimits({ perPaymentLimitCents: 100_000, dailyLimitCents: 500_000 });
  return advisor;
}

export function pot(name: string, bps: number, destinationId: number | null = null): PotDraft {
  return { name, purpose: `${name} purpose`, shareKind: "percent", shareBps: bps, fixedCents: 0, destinationId, reason: "test" };
}

/** A plan with two kept pots and one pot paid out to a collaborator. */
export function standardPlan(opts: { approved?: boolean; email?: string } = {}) {
  const collaborator = addDestination("Tunde", opts.email ?? "tunde@example.com");
  if (opts.approved !== false) markDestinationApproved(collaborator.id);
  const draft = saveDraft({
    source: "user",
    pots: [pot("Bills", 5000), pot("Savings", 2000), pot("Collaborator", 3000, collaborator.id)],
  });
  approvePlan(draft.id);
  return { collaborator, planId: draft.id };
}

let captureSeq = 0;
export function incoming(amountCents: number, note = "Logo project, invoice 12", receivedAt = new Date().toISOString()) {
  captureSeq += 1;
  return recordPayment({
    captureId: `TEST-CAP-${captureSeq}`,
    orderId: null,
    amountCents,
    currency: "USD",
    payerEmail: "client@example.com",
    payerName: "Client",
    note,
    receivedAt,
  }).payment;
}
