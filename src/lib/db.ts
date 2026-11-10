import type { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// node:sqlite is loaded at runtime so the bundler never tries to resolve it.
function openDatabase(path: string): DatabaseSync {
  const sqlite = process.getBuiltinModule("node:sqlite");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new sqlite.DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS destinations (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','retired')),
  source TEXT NOT NULL CHECK (source IN ('user','ai','preview')),
  user_words TEXT,
  summary TEXT,
  savings_note TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS pots (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  pot_key TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  share_kind TEXT NOT NULL CHECK (share_kind IN ('percent','fixed')),
  share_bps INTEGER NOT NULL DEFAULT 0,
  fixed_cents INTEGER NOT NULL DEFAULT 0,
  destination_id INTEGER REFERENCES destinations(id),
  reason TEXT NOT NULL DEFAULT '',
  UNIQUE (plan_id, pot_key)
);

CREATE TABLE IF NOT EXISTS pending_orders (
  order_id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  note TEXT NOT NULL,
  payer_label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  capture_id TEXT NOT NULL UNIQUE,
  order_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  payer_email TEXT,
  payer_name TEXT,
  note TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  seeded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  status_reason TEXT,
  plan_id INTEGER REFERENCES plans(id),
  check_source TEXT,
  check_reason TEXT
);

CREATE TABLE IF NOT EXISTS spends (
  id INTEGER PRIMARY KEY,
  pot_key TEXT NOT NULL,
  pot_name TEXT NOT NULL,
  cents INTEGER NOT NULL CHECK (cents > 0),
  destination_id INTEGER NOT NULL REFERENCES destinations(id),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  payment_id INTEGER REFERENCES payments(id),
  spend_id INTEGER REFERENCES spends(id),
  payout_batch_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('created','posted','unknown','rejected')),
  batch_status TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER REFERENCES payments(id),
  spend_id INTEGER REFERENCES spends(id),
  pot_key TEXT NOT NULL,
  pot_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  cents INTEGER NOT NULL CHECK (cents >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('keep','payout')),
  destination_id INTEGER REFERENCES destinations(id),
  receiver_email TEXT,
  status TEXT NOT NULL,
  hold_reason TEXT,
  batch_id INTEGER REFERENCES batches(id),
  payout_item_id TEXT,
  transaction_id TEXT,
  transaction_status TEXT,
  fee_cents INTEGER,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((payment_id IS NULL) <> (spend_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS parts_payment_pot ON parts(payment_id, pot_key) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS parts_status ON parts(status);

CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY,
  pot_key TEXT NOT NULL,
  day TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai','template')),
  facts TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (pot_key, day)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL
);
`;

function migrate(db: DatabaseSync) {
  db.exec(SCHEMA);
}

const g = globalThis as unknown as { __portionDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__portionDb) {
    const path = process.env.DATABASE_PATH?.trim() || "data/portion.sqlite";
    g.__portionDb = openDatabase(path === ":memory:" ? path : resolve(/*turbopackIgnore: true*/ process.cwd(), path));
  }
  return g.__portionDb;
}

/** Tests get a fresh in-memory database. */
export function useFreshDatabase(): DatabaseSync {
  g.__portionDb?.close();
  g.__portionDb = openDatabase(":memory:");
  return g.__portionDb;
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
