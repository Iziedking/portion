import type { Advisor, NudgeFacts, NudgeText, PaymentCheck, PaymentCheckInput, PlanProposal, PlanProposalInput } from "./types";

// Fixed rules used when no Claude key is set. The app labels this "preview, no AI".

const ASK_WORDS = /\b(refund|reimburs\w*|loan|deposit|mistake|wrong|return|chargeback|borrow\w*)\b/i;

export function nudgeTemplate(f: NudgeFacts): string {
  return `${f.potName} is ${f.usedPercent}% used and the month is ${f.periodPercent}% gone. ${f.leftAmount} is left for ${f.daysLeft} days.`;
}

export class PreviewAdvisor implements Advisor {
  readonly mode = "preview" as const;

  async checkPayment(input: PaymentCheckInput): Promise<PaymentCheck> {
    if (ASK_WORDS.test(input.note)) {
      return {
        decision: "ask",
        reason: "The note mentions a refund, loan or similar. That may not be income, so it waits for you.",
        source: "preview",
      };
    }
    return { decision: "apply", reason: "Looks like a normal client payment.", source: "preview" };
  }

  async proposePlan(input: PlanProposalInput): Promise<PlanProposal> {
    const uneven = /uneven/.test(input.earnings.unevenness);
    return {
      summary: "A starting plan from fixed rules. Edit the shares to match your life.",
      savingsNote: uneven
        ? "Your income is uneven, so a buffer pot keeps some of each large payment for thin months."
        : "Savings take a steady share of every payment.",
      source: "preview",
      pots: [
        { name: "Bills", purpose: "Rent, power and phone", percent: 45, destinationId: 0, reason: "Fixed costs come first." },
        { name: "Tax set-aside", purpose: "A share you chose to hold for tax", percent: 20, destinationId: 0, reason: "Kept apart so it is not spent. Not tax advice." },
        { name: "Buffer", purpose: "Tops up thin months", percent: uneven ? 15 : 10, destinationId: 0, reason: "Evens out uneven income." },
        { name: "Savings", purpose: "Money you do not touch", percent: uneven ? 10 : 15, destinationId: 0, reason: "A steady share builds up over time." },
        { name: "Spending", purpose: "Day to day", percent: 10, destinationId: 0, reason: "What is left to live on." },
      ],
    };
  }

  async writeNudge(facts: NudgeFacts): Promise<NudgeText> {
    return { message: nudgeTemplate(facts), source: "preview" };
  }
}
