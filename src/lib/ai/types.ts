// What the AI is allowed to do. It reads, chooses and explains. It never sees
// emails, never calls PayPal and never produces money amounts that get paid.

export type AdvisorSource = "ai" | "preview";

export interface PaymentCheckInput {
  amount: string;
  currency: string;
  payer: string | null;
  /** Typed by the payer. Untrusted. Passed as data only. */
  note: string;
  potNames: string[];
}

export interface PaymentCheck {
  decision: "apply" | "ask";
  reason: string;
  source: AdvisorSource;
}

export interface EarningSummary {
  count: number;
  months: number;
  totalAmount: string;
  averageAmount: string;
  smallest: string;
  largest: string;
  /** Plain description computed by code, for example "very uneven". */
  unevenness: string;
  payments: { date: string; amount: string }[];
}

export interface PlanProposalInput {
  earnings: EarningSummary;
  userWords: string;
  /** Destinations by id and label. The AI never sees email addresses. */
  destinations: { id: number; label: string }[];
  currency: string;
}

export interface ProposedPot {
  name: string;
  purpose: string;
  percent: number;
  /** 0 keeps the money in the account. Any other value must be an id from the list given. */
  destinationId: number;
  reason: string;
}

export interface PlanProposal {
  summary: string;
  savingsNote: string;
  pots: ProposedPot[];
  source: AdvisorSource;
}

export interface NudgeFacts {
  potName: string;
  usedPercent: string;
  periodPercent: string;
  leftAmount: string;
  daysLeft: string;
}

export interface NudgeText {
  message: string;
  source: AdvisorSource;
}

export interface Advisor {
  readonly mode: "claude" | "preview";
  checkPayment(input: PaymentCheckInput): Promise<PaymentCheck>;
  proposePlan(input: PlanProposalInput): Promise<PlanProposal>;
  writeNudge(facts: NudgeFacts): Promise<NudgeText>;
}
