import { parseAmount } from "./money";
import { currency } from "./paypal";
import { recordPayment } from "./repo";

// Demo earning history. These rows exist only in Portion's own records, marked
// seeded, so the AI has an uneven income to read. They are not PayPal payments.
const SEED: { daysAgo: number; amount: string; note: string }[] = [
  { daysAgo: 118, amount: "1850.00", note: "Brand identity, first half" },
  { daysAgo: 104, amount: "420.00", note: "Poster edits" },
  { daysAgo: 87, amount: "2600.00", note: "Brand identity, second half" },
  { daysAgo: 71, amount: "310.00", note: "Social templates" },
  { daysAgo: 58, amount: "975.00", note: "Packaging mockups" },
  { daysAgo: 44, amount: "3200.00", note: "Website design" },
  { daysAgo: 37, amount: "150.00", note: "Icon fix" },
  { daysAgo: 23, amount: "1240.00", note: "Pitch deck" },
  { daysAgo: 12, amount: "680.00", note: "Illustrations" },
];

export function seedHistory(now = new Date()): number {
  let added = 0;
  SEED.forEach((row, i) => {
    const at = new Date(now.getTime() - row.daysAgo * 86_400_000);
    at.setUTCHours(10 + (i % 6), 0, 0, 0);
    const { isNew } = recordPayment({
      captureId: `SEEDED-${i + 1}`,
      orderId: null,
      amountCents: parseAmount(row.amount),
      currency: currency(),
      payerEmail: null,
      payerName: "Seeded client",
      note: row.note,
      receivedAt: at.toISOString(),
      seeded: true,
    });
    if (isNew) added += 1;
  });
  return added;
}
