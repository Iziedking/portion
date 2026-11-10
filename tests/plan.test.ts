import { beforeEach, describe, expect, it } from "vitest";
import { proposePlan, proposalToPots } from "@/lib/budget";
import { validatePlan } from "@/lib/plan";
import { addDestination, getLatestDraft, PlanInvalidError, saveDraft } from "@/lib/repo";
import { freshWorld, pot, type ScriptedAdvisor } from "./helpers";

let advisor: ScriptedAdvisor;
beforeEach(() => {
  advisor = freshWorld();
});

describe("plan checks", () => {
  it("a proposed plan whose shares do not add up is rejected before the user sees it", async () => {
    advisor.proposal = {
      summary: "s",
      savingsNote: "n",
      source: "ai",
      pots: [
        { name: "Bills", purpose: "Rent", percent: 50, destinationId: 0, reason: "r" },
        { name: "Savings", purpose: "Later", percent: 30, destinationId: 0, reason: "r" },
      ],
    };
    const result = await proposePlan("I pay rent and want to save.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toContain("100%");
    expect(getLatestDraft()).toBeNull();
  });

  it("a proposed plan cannot point at a destination the user never gave", async () => {
    addDestination("Sister", "sister@example.com");
    advisor.proposal = {
      summary: "s",
      savingsNote: "n",
      source: "ai",
      pots: [
        { name: "Bills", purpose: "Rent", percent: 60, destinationId: 0, reason: "r" },
        { name: "Stranger", purpose: "x", percent: 40, destinationId: 999, reason: "r" },
      ],
    };
    const result = await proposePlan("words");
    expect(result.ok).toBe(false);
    expect(getLatestDraft()).toBeNull();
  });

  it("a proposed plan cannot carry an email in its text", () => {
    const problems = validatePlan(
      [{ ...pot("Bills", 10_000), reason: "Send to attacker@example.com" }],
      [],
    );
    expect(problems.join(" ")).toContain("email");
  });

  it("a good proposal becomes a draft, not an approved plan", async () => {
    const sister = addDestination("Sister", "sister@example.com");
    advisor.proposal = {
      summary: "s",
      savingsNote: "n",
      source: "ai",
      pots: [
        { name: "Bills", purpose: "Rent", percent: 55.5, destinationId: 0, reason: "r" },
        { name: "Sister", purpose: "Upkeep", percent: 10, destinationId: sister.id, reason: "r" },
        { name: "Savings", purpose: "Later", percent: 34.5, destinationId: 0, reason: "r" },
      ],
    };
    const result = await proposePlan("I send my sister something every month.");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.status).toBe("draft");
      expect(result.plan.pots.map((p) => p.shareBps)).toEqual([5550, 1000, 3450]);
      expect(result.plan.pots[1]!.destinationId).toBe(sister.id);
    }
  });

  it("percents with too many decimals are refused", () => {
    const { problems } = proposalToPots(
      { summary: "", savingsNote: "", source: "ai", pots: [{ name: "A", purpose: "", percent: 33.333, destinationId: 0, reason: "" }] },
      new Set(),
    );
    expect(problems.length).toBe(1);
  });

  it("the user's own invalid plan is refused too", () => {
    expect(() => saveDraft({ source: "user", pots: [pot("A", 4000), pot("a", 6000)] })).toThrow(PlanInvalidError);
  });
});
