// Sandbox proof that a repeated payout request pays nothing new.
// Reads the first posted batch from Portion's database, sends the exact same
// POST /v1/payments/payouts again with the same PayPal-Request-Id and
// sender_batch_id, then reads the original batch back.
// Run on a machine that has .env with sandbox keys: node scripts/check-idempotency.mjs
// It prints IDs and statuses only, never keys or tokens.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const base = "https://api-m.sandbox.paypal.com";
const dbPath = process.env.DATABASE_PATH || env.DATABASE_PATH || "data/portion.sqlite";
const db = new DatabaseSync(dbPath);

const batch = db.prepare("SELECT * FROM batches WHERE state = 'posted' AND payout_batch_id IS NOT NULL ORDER BY id LIMIT 1").get();
if (!batch) {
  console.log("No posted batch in", dbPath);
  process.exit(1);
}
const parts = db.prepare("SELECT * FROM parts WHERE batch_id = ? ORDER BY id").all(batch.id);
const payment = batch.payment_id ? db.prepare("SELECT currency FROM payments WHERE id = ?").get(batch.payment_id) : null;
const currency = payment?.currency ?? env.CURRENCY ?? "USD";

const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const { access_token: token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const toAmount = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const body = {
  sender_batch_header: {
    sender_batch_id: batch.request_id,
    recipient_type: "EMAIL",
    email_subject: "You have a payment",
    email_message: "This payment was sent with Portion from a PayPal sandbox account. No real money.",
  },
  items: parts.map((p) => ({
    recipient_type: "EMAIL",
    receiver: p.receiver_email,
    note: `${p.pot_name}: ${p.purpose}`,
    sender_item_id: `part-${p.id}`,
    amount: { currency, value: toAmount(p.cents) },
  })),
};

console.log(`Original batch ${batch.payout_batch_id}, request ${batch.request_id}, ${parts.length} item(s)`);
const repeat = await fetch(`${base}/v1/payments/payouts`, {
  method: "POST",
  headers: { ...auth, "PayPal-Request-Id": batch.request_id },
  body: JSON.stringify(body),
});
const repeatBody = await repeat.json();
const repeatId = repeatBody?.batch_header?.payout_batch_id ?? null;
console.log(`Repeat POST: HTTP ${repeat.status}, batch ${repeatId ?? "none"}, ${repeatBody?.name ?? ""}`);
if (repeat.status >= 400) {
  console.log(`  message: ${repeatBody?.message ?? ""}`);
  console.log(`  issues: ${(repeatBody?.details ?? []).map((d) => `${d.field ?? ""} ${d.issue ?? ""}`.trim()).join("; ")}`);
  console.log(`  links: ${(repeatBody?.links ?? []).map((l) => `${l.rel} ${l.href}`).join("; ")}`);
}

const after = await (await fetch(`${base}/v1/payments/payouts/${batch.payout_batch_id}`, { headers: auth })).json();
console.log(`Original batch now: ${after.batch_header.batch_status}, ${after.items.length} item(s)`);

const sameBatch = repeatId === batch.payout_batch_id;
const rejectedDuplicate = repeat.status >= 400 && !repeatId;
const pass = (sameBatch || rejectedDuplicate) && after.items.length === parts.length;
console.log(pass ? "PASS: the repeat created no new payout" : "FAIL: check the batches above");
process.exit(pass ? 0 : 1);
