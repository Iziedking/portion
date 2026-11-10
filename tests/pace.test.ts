import { beforeEach, describe, expect, it } from "vitest";
import { acceptNudgeText, isAheadOfPace, monthPeriod, nudgeFacts, potPace, refreshNudges, spendFromPot, todaysNudges } from "@/lib/budget";
import { processPayment, refreshBatch } from "@/lib/engine";
import { addDestination, getActivePlan, markDestinationApproved, partsForSpend } from "@/lib/repo";
import { freshWorld, incoming, standardPlan, type ScriptedAdvisor } from "./helpers";
import { getDb } from "@/lib/db";

let advisor: ScriptedAdvisor;
beforeEach(() => {
  advisor = freshWorld();
});

describe("pace", () => {
  it("a pot with 70% spent at 40% of the period triggers a nudge; one on pace does not", () => {
    expect(isAheadOfPace(10_000, 7_000, 0.4)).toBe(true);
    expect(isAheadOfPace(10_000, 4_000, 0.4)).toBe(false);
    expect(isAheadOfPace(10_000, 5_000, 0.4)).toBe(false);
    expect(isAheadOfPace(0, 0, 0.4)).toBe(false);
  });

  it("works out how much of the month is gone", () => {
    const p = monthPeriod(new Date(Date.UTC(2026, 10, 13, 0, 0, 0)));
    expect(Math.round(p.elapsed * 100)).toBe(40);
    expect(p.daysLeft).toBe(18);
  });

  it("spending from a pot ahead of pace writes a nudge with the code's numbers", async () => {
    standardPlan();
    const shop = addDestination("Landlord", "landlord@example.com");
    markDestinationApproved(shop.id);
    const payment = incoming(100_000); // Bills gets 500.00
    await processPayment(payment.id);

    // Pretend the month is 40% gone by moving the payment to the 1st of this month.
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    getDb().prepare("UPDATE payments SET received_at = ? WHERE id = ?").run(start, payment.id);

    const spend = await spendFromPot({ potKey: "bills", cents: 45_000, destinationId: shop.id, note: "Rent" });
    expect(partsForSpend(spend.spendId)[0]!.status).toBe("sent");

    const plan = getActivePlan()!;
    const bills = potPace(now, plan).pots.find((p) => p.key === "bills")!;
    expect(bills.fundedCents).toBe(50_000);
    expect(bills.spentCents).toBe(45_000);

    advisor.nudge = "Bills is moving fast."; // missing the numbers, so the template is used
    const nudges = await refreshNudges(now);
    const elapsed = monthPeriod(now).elapsed;
    if (0.9 > elapsed + 0.15) {
      expect(nudges).toHaveLength(1);
      expect(nudges[0]!.source).toBe("template");
      expect(nudges[0]!.message).toContain("90% used");
    } else {
      expect(nudges).toHaveLength(0);
    }
    expect(todaysNudges(now).length).toBe(nudges.length);
  });

  it("refuses to spend more than is left in a pot", async () => {
    standardPlan();
    const shop = addDestination("Shop", "shop@example.com");
    const payment = incoming(10_000);
    await processPayment(payment.id);
    await expect(spendFromPot({ potKey: "bills", cents: 6_000, destinationId: shop.id, note: "" })).rejects.toThrow("left");
  });

  it("AI nudge text is used only when it repeats the numbers", () => {
    const facts = nudgeFacts(
      { key: "u", name: "Upkeep", purpose: "", reason: "", fundedCents: 100, spentCents: 70, leftCents: 30, usedShare: 0.7, expectedLeftCents: 60, ahead: true },
      { start: new Date(), end: new Date(), elapsed: 0.4, daysLeft: 18 },
    );
    expect(acceptNudgeText("Upkeep is 70% used and the month is 40% gone.", facts)).toBe(true);
    expect(acceptNudgeText("Upkeep is almost gone.", facts)).toBe(false);
    expect(acceptNudgeText("Upkeep is 70% used, 40% gone. Email help@x.com", facts)).toBe(false);
  });

  it("a failed spend goes back into the pot", async () => {
    standardPlan();
    const bad = addDestination("Closed", "closed@fail.example");
    markDestinationApproved(bad.id);
    const payment = incoming(100_000);
    await processPayment(payment.id);
    const spend = await spendFromPot({ potKey: "savings", cents: 10_000, destinationId: bad.id, note: "" });
    const part = partsForSpend(spend.spendId)[0]!;
    await refreshBatch(part.batchId!);
    expect(partsForSpend(spend.spendId)[0]!.status).toBe("failed");
    const savings = potPace(new Date()).pots.find((p) => p.key === "savings")!;
    expect(savings.spentCents).toBe(0);
  });
});
