'use strict';
// Database schema, seed data and small query helpers (Node's built-in SQLite).

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { ROOT } = require('./lib/files');

const DB_FILE = path.resolve(process.env.DATABASE_FILE || path.join(ROOT, 'storage', 'adbazaar.db'));
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);

-- Advertisers ("clients"). They can only log in after the owner approves their KYC.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  business_name TEXT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, pincode TEXT NOT NULL,
  aadhaar_last4 TEXT NOT NULL,
  pan_number TEXT NOT NULL,
  aadhaar_file TEXT, aadhaar_back_file TEXT, pan_file TEXT, address_proof_file TEXT,
  photo_file TEXT,           -- passport-size photo uploaded by client
  live_photo_file TEXT,      -- latest live capture (selfie / video call / admin webcam)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | video_call | approved | rejected | suspended
  status_token TEXT NOT NULL UNIQUE,       -- secret link for checking status & joining the KYC video call
  video_call_at INTEGER,
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES admins(id),
  reviewed_at INTEGER,
  created_by_admin INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS kyc_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  source TEXT NOT NULL,      -- selfie | video_call | admin_webcam
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, icon TEXT DEFAULT '📦',
  sort INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
);

-- Paid run periods, e.g. 7 / 15 / 29 days. priority feeds the ranking algorithm.
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, days INTEGER NOT NULL,
  price_paise INTEGER NOT NULL,
  top_price_paise INTEGER NOT NULL DEFAULT 0,  -- extra charge to pin the ad in the TOP section
  priority INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  kind TEXT NOT NULL DEFAULT 'product',  -- product | service
  title TEXT NOT NULL, description TEXT NOT NULL,
  price_paise INTEGER, price_note TEXT,
  city TEXT NOT NULL, locality TEXT,
  contact_phone TEXT NOT NULL, whatsapp TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'awaiting_payment', -- awaiting_payment | payment_review | active | expired | blocked
  plan_id INTEGER REFERENCES plans(id),
  is_top INTEGER NOT NULL DEFAULT 0,
  paid_total_paise INTEGER NOT NULL DEFAULT 0,  -- amount paid for the current run
  starts_at INTEGER, expires_at INTEGER,
  admin_boost INTEGER NOT NULL DEFAULT 0,
  rank_score REAL NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  block_reason TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ads_listing ON ads(status, rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_ads_client ON ads(client_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  days INTEGER NOT NULL,
  with_top INTEGER NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL,
  method TEXT NOT NULL,             -- razorpay | upi_manual
  status TEXT NOT NULL,             -- created | pending | paid | rejected | failed
  razorpay_order_id TEXT UNIQUE, razorpay_payment_id TEXT,
  utr TEXT, screenshot_file TEXT,
  admin_note TEXT, confirmed_by INTEGER REFERENCES admins(id), confirmed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, details TEXT, reporter_ip TEXT,
  resolved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

-- TOP-ad time slots (8 × 3 hours, India time) and their price per day
CREATE TABLE IF NOT EXISTS top_slots (
  slot INTEGER PRIMARY KEY, price_per_day_paise INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
);

-- One-time verification codes (email / SMS) sent at registration
CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,          -- email | sms
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otps_client ON otps(client_id, channel);

-- Every email / SMS the app sends (or would send if not configured yet) — visible in Admin → Messages
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,          -- email | sms
  to_addr TEXT NOT NULL, subject TEXT, body TEXT,
  status TEXT NOT NULL,           -- sent | failed | not_configured
  error TEXT, created_at INTEGER NOT NULL
);

-- Messages shown inside the seller portal (bell icon): payment rejected/confirmed, approval, ad expired …
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  kind TEXT NOT NULL, tone TEXT NOT NULL DEFAULT 'info',   -- info | success | warn | error
  title TEXT NOT NULL, body TEXT, link TEXT, link_text TEXT,
  read_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_client ON inbox(client_id, read_at);
`);

// ---- Migrations for databases created by older versions ----
function addColumn(table, column, definition, after) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (cols.includes(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  if (after) db.exec(after);
}
addColumn('ads', 'top_slots', 'INTEGER NOT NULL DEFAULT 0', "UPDATE ads SET top_slots = 255 WHERE is_top = 1");
addColumn('ads', 'videos', "TEXT NOT NULL DEFAULT '[]'");
addColumn('payments', 'top_slots', 'INTEGER NOT NULL DEFAULT 0', 'UPDATE payments SET top_slots = 255 WHERE with_top = 1');
// Existing clients are treated as already verified.
addColumn('clients', 'email_verified_at', 'INTEGER', 'UPDATE clients SET email_verified_at = created_at');
addColumn('clients', 'phone_verified_at', 'INTEGER', 'UPDATE clients SET phone_verified_at = created_at');
addColumn('clients', 'submitted_at', 'INTEGER', 'UPDATE clients SET submitted_at = created_at');
addColumn('clients', 'auto_approved', 'INTEGER NOT NULL DEFAULT 0');
// Main category → sub-category (parent_id NULL = main category)
addColumn('categories', 'parent_id', 'INTEGER REFERENCES categories(id)');
// Account / ad deactivation (paid time is frozen while paused) and soft delete
addColumn('clients', 'deactivated_by', 'TEXT');          // client | admin
addColumn('clients', 'deactivated_at', 'INTEGER');
addColumn('clients', 'deleted_at', 'INTEGER');
addColumn('ads', 'paused_by', 'TEXT');                   // account | admin
addColumn('ads', 'paused_remaining_ms', 'INTEGER');
addColumn('ads', 'deleted_at', 'INTEGER');
addColumn('clients', 'dob', 'TEXT');
// One ID document (aadhaar | pan | passport) for age verification. Older accounts keep their Aadhaar as the ID.
addColumn('clients', 'id_type', 'TEXT', "UPDATE clients SET id_type = 'aadhaar' WHERE aadhaar_file IS NOT NULL OR aadhaar_last4 != ''");
addColumn('clients', 'id_number', 'TEXT', "UPDATE clients SET id_number = aadhaar_last4 WHERE id_type = 'aadhaar'");
addColumn('clients', 'id_file', 'TEXT', "UPDATE clients SET id_file = aadhaar_file WHERE id_type = 'aadhaar'");
addColumn('clients', 'id_back_file', 'TEXT', "UPDATE clients SET id_back_file = aadhaar_back_file WHERE id_type = 'aadhaar'");
addColumn('clients', 'call_ring_at', 'INTEGER');
addColumn('clients', 'terms_accepted_at', 'INTEGER');   // when the seller accepted the Terms, Privacy and Refund policy
addColumn('clients', 'terms_version', 'TEXT');
addColumn('payments', 'terms_accepted_at', 'INTEGER');  // seller accepted the payment terms for this payment

// Wallet: money left on deleted ads, top-ups and admin credits; can pay for any ad.
addColumn('clients', 'wallet_paise', 'INTEGER NOT NULL DEFAULT 0');
addColumn('clients', 'blocked_reason', 'TEXT');
addColumn('payments', 'wallet_paise', 'INTEGER NOT NULL DEFAULT 0');   // part of this payment paid from the wallet
addColumn('plans', 'discount_pct', 'INTEGER NOT NULL DEFAULT 0');      // e.g. 20 → 20% off plan + TOP slots
addColumn('plans', 'label', 'TEXT');                                   // e.g. "Monthly", "Yearly"
// Admin TOP: pin an ad in TOP until a date, in chosen 3-hour slots (on top of what the seller bought)
addColumn('ads', 'admin_top_until', 'INTEGER');
addColumn('ads', 'admin_top_slots', 'INTEGER NOT NULL DEFAULT 255');
// Free ads: posted without payment, shown after all paid ads (never in TOP unless the admin pins them).
addColumn('ads', 'is_free', 'INTEGER NOT NULL DEFAULT 0');
// A photo the admin uploads for a category tile (empty = a built-in photo is used).
addColumn('categories', 'image', 'TEXT');
// Staff roles: owner (everything, incl. site name and staff) | admin (runs the site) | payments (only confirms payments).
// The first admin account becomes the owner.
addColumn('admins', 'role', "TEXT NOT NULL DEFAULT 'admin'", "UPDATE admins SET role = 'owner' WHERE id = (SELECT MIN(id) FROM admins)");
addColumn('admins', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
if (!db.prepare("SELECT 1 FROM admins WHERE role = 'owner' LIMIT 1").get()) db.exec("UPDATE admins SET role = 'owner' WHERE id = (SELECT MIN(id) FROM admins)");
db.exec(`
CREATE TABLE IF NOT EXISTS wallet_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  amount_paise INTEGER NOT NULL,                 -- + credit, − spent
  kind TEXT NOT NULL,                            -- ad_deleted | topup | spent | refund | admin
  note TEXT, ad_id INTEGER, payment_id INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_client ON wallet_tx(client_id, id);
CREATE TABLE IF NOT EXISTS wallet_topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  amount_paise INTEGER NOT NULL, utr TEXT, screenshot_file TEXT,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid | rejected
  admin_note TEXT, confirmed_by INTEGER, confirmed_at INTEGER, created_at INTEGER NOT NULL
);
-- Third-party / sponsored ads shown between listings, under the ad page and on the home page
CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser TEXT NOT NULL, title TEXT NOT NULL, body TEXT, image TEXT, link TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'feed',        -- feed | ad_page | home
  starts_at INTEGER, ends_at INTEGER, is_active INTEGER NOT NULL DEFAULT 1,
  impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, company TEXT, email TEXT NOT NULL, phone TEXT, message TEXT NOT NULL,
  ip TEXT, handled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
`);

// ---- Seed defaults ----
const now = Date.now();

if (!db.prepare('SELECT 1 FROM plans LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO plans (name, days, price_paise, top_price_paise, priority, sort) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('Basic — 7 days', 7, 19900, 29900, 1, 1);
  ins.run('Standard — 15 days', 15, 34900, 49900, 2, 2);
  ins.run('Premium — 29 days', 29, 59900, 79900, 3, 3);
}

// New plans (added once): 1 day, Monthly and Yearly subscriptions with a 20% discount. All editable in Admin → Settings → Plans.
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'plans_v2_seeded'").get()) {
  const has = (d) => db.prepare('SELECT 1 FROM plans WHERE days = ?').get(d);
  const ins2 = db.prepare('INSERT INTO plans (name, days, price_paise, top_price_paise, priority, sort, discount_pct, label) VALUES (?, ?, ?, 0, ?, ?, ?, ?)');
  if (!has(1)) ins2.run('Try it — 1 day', 1, 4900, 1, 0, 0, null);
  if (!has(30)) ins2.run('Monthly subscription — 30 days', 30, 69900, 4, 30, 20, 'Monthly');
  if (!has(365)) ins2.run('Yearly subscription — 365 days', 365, 699900, 5, 365, 20, 'Yearly');
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('plans_v2_seeded', '1')").run();
}

// Default categories are created only once. If you delete them in Admin → Categories they never come back.
const catsSeeded = db.prepare("SELECT 1 FROM settings WHERE key = 'cats_seeded'").get();
if (!catsSeeded && !db.prepare('SELECT 1 FROM categories LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO categories (name, slug, icon, sort) VALUES (?, ?, ?, ?)');
  [
    ['Mobiles & Electronics', 'electronics', '📱'], ['Vehicles', 'vehicles', '🚗'],
    ['Property & Rentals', 'property', '🏠'], ['Jobs', 'jobs', '💼'],
    ['Home Services', 'home-services', '🛠️'], ['Furniture & Home', 'furniture', '🛋️'],
    ['Fashion', 'fashion', '👕'], ['Education & Classes', 'education', '📚'],
    ['Business & Industrial', 'business', '🏭'], ['Health & Fitness', 'health-fitness', '💪'],
    ['Events & Catering', 'events', '🎉'], ['Pets', 'pets', '🐾'], ['Other', 'other', '📦'],
  ].forEach(([n, s, i], idx) => ins.run(n, s, i, idx));
}
if (!catsSeeded) db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('cats_seeded', '1')").run();

// Default sub-categories (added once; you can rename / delete / add more in Admin → Categories)
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'subcats_seeded'").get()) {
  const DEFAULT_SUBS = {
    electronics: ['Mobile phones', 'Laptops & computers', 'TV & audio', 'Cameras', 'Accessories'],
    vehicles: ['Cars', 'Bikes & scooters', 'Commercial vehicles', 'Spare parts'],
    property: ['For sale', 'For rent', 'PG & hostels', 'Shops & offices'],
    jobs: ['Full-time', 'Part-time', 'Work from home'],
    'home-services': ['Electricians', 'Plumbers', 'Cleaning', 'AC & appliance repair', 'Pest control', 'Painting'],
    furniture: ['Sofas & beds', 'Kitchen & dining', 'Home decor'],
    fashion: ['Men', 'Women', 'Kids', 'Watches & jewellery'],
    education: ['Tuition', 'Coaching classes', 'Music & dance', 'Computer courses'],
    business: ['Machinery', 'Wholesale', 'Office supplies'],
    'health-fitness': ['Gyms', 'Yoga', 'Clinics & doctors'],
    events: ['Catering', 'Photography', 'Decoration', 'Venues'],
    pets: ['Dogs', 'Cats', 'Pet food & accessories'],
  };
  const getMain = db.prepare('SELECT id, icon FROM categories WHERE slug = ? AND parent_id IS NULL');
  const ins = db.prepare('INSERT OR IGNORE INTO categories (name, slug, icon, sort, parent_id) VALUES (?, ?, ?, ?, ?)');
  for (const [slug, subs] of Object.entries(DEFAULT_SUBS)) {
    const main = getMain.get(slug);
    if (!main) continue;
    subs.forEach((name, i) => ins.run(name, `${slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, main.icon, i, main.id));
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('subcats_seeded', '1')").run();
}

// "Spa & Wellness" main category (added once; rename or delete it in Admin → Categories). Wellness only — no adult services.
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'wellness_seeded'").get()) {
  if (!db.prepare("SELECT 1 FROM categories WHERE slug = 'wellness'").get()) {
    const r = db.prepare("INSERT INTO categories (name, slug, icon, sort) VALUES ('Spa & Wellness', 'wellness', '', 10)").run();
    const ins = db.prepare('INSERT OR IGNORE INTO categories (name, slug, icon, sort, parent_id) VALUES (?, ?, ?, ?, ?)');
    [['Massage & spa', 'wellness-massage-spa'], ['Beauty & salon', 'wellness-beauty-salon'], ['Yoga & meditation', 'wellness-yoga-meditation']]
      .forEach(([n, s], i) => ins.run(n, s, '', i, Number(r.lastInsertRowid)));
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('wellness_seeded', '1')").run();
}

if (!db.prepare('SELECT 1 FROM top_slots LIMIT 1').get()) {
  // Default TOP price per day for each 3-hour slot (₹): night is cheap, evening is prime time.
  const prices = [5, 5, 10, 20, 20, 20, 30, 25];
  const ins = db.prepare('INSERT INTO top_slots (slot, price_per_day_paise, is_active) VALUES (?, ?, 1)');
  prices.forEach((p, i) => ins.run(i, p * 100));
}

const DEFAULT_SETTINGS = {
  site_name: process.env.SITE_NAME || 'AdBazaar',
  tagline: 'Buy, sell & find local services from verified sellers',
  upi_id: process.env.UPI_ID || '',
  upi_payee_name: process.env.UPI_PAYEE_NAME || '',
  support_phone: '', support_email: '',
  upi_qr_file: '',
  auto_approve_minutes: '1',
  complaint_block_threshold: '500',  // block a seller when one ad gets complaints from this many different people (0 = off)
  sponsor_every: '8',                 // show a sponsored card after every N ads in listings
  free_ads: '1',                      // sellers may post ads without paying (shown after paid ads)
  free_ad_days: '15',                 // how long a free ad stays live
  free_ads_per_seller: '2',           // free ads one seller may have live or waiting at the same time
  free_ads_review: '1',               // admin checks each free ad before it goes live (1) or it goes live at once (0)
  require_mobile_otp: '1',            // mobile must be verified by SMS code when SMS is set up
  notify_email: process.env.ADMIN_EMAIL || '',
  // Business & legal details (Admin → Settings → Business & legal) — shown on receipts, Terms, Contact page
  legal_name: '', legal_address: '', gstin: '',
  grievance_name: '', grievance_email: '', grievance_phone: '',
  jurisdiction_city: '',
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);
// One-time change: the old default auto-approve time (5 minutes) becomes 1 minute.
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'approve_1min_migrated'").get()) {
  db.prepare("UPDATE settings SET value = '1' WHERE key = 'auto_approve_minutes' AND value = '5'").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('approve_1min_migrated', '1')").run();
}
// Payments are confirmed only by an admin (an older version had an auto-confirm option).
db.prepare("DELETE FROM settings WHERE key = 'auto_confirm_payment_minutes'").run();

function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// Run fn inside a transaction.
// Transaction helper. Nested calls join the outer transaction (so helpers can use tx() freely).
let txDepth = 0;
function tx(fn) {
  if (txDepth > 0) { txDepth += 1; try { return fn(); } finally { txDepth -= 1; } }
  db.exec('BEGIN IMMEDIATE');
  txDepth = 1;
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { txDepth = 0; }
}

const parseImages = (ad) => { try { return JSON.parse(ad.images || '[]'); } catch { return []; } };
const parseVideos = (ad) => { try { return JSON.parse(ad.videos || '[]'); } catch { return []; } };

module.exports = { db, tx, getSettings, setSetting, parseImages, parseVideos, DB_FILE, now };
