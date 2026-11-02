'use strict';
// Adds a demo approved seller and a few live ads so you can see the site populated.
//   npm run seed:demo        (login: demo.seller@example.com / demo12345)
const fs = require('node:fs');
const path = require('node:path');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) process.loadEnvFile(path.join(__dirname, '..', '.env'));

const { db } = require('../src/db');
const { hashPassword, randomToken } = require('../src/lib/security');
const { rescore } = require('../src/ranking');

const email = 'demo.seller@example.com';
let seller = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
if (!seller) {
  const r = db.prepare(`INSERT INTO clients (name, business_name, email, phone, password_hash, address, city, state, pincode, aadhaar_last4, pan_number, status, status_token, created_by_admin, created_at)
    VALUES ('Demo Seller', 'Demo Traders', ?, '9876500000', ?, '1 Demo Street, Shivaji Nagar', 'Pune', 'Maharashtra', '411005', '0000', 'ABCDE1234F', 'approved', ?, 1, ?)`)
    .run(email, hashPassword('demo12345'), randomToken(24), Date.now());
  seller = { id: Number(r.lastInsertRowid) };
}
const plans = db.prepare('SELECT * FROM plans ORDER BY days').all();
const cat = (slug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
const day = 86400_000;
const now = Date.now();
const demo = [
  ['electronics', 'product', 'OnePlus 11R 5G, 256GB — like new', 'Used for 6 months, no scratches. Box, charger and bill included.', 2799900, 'Negotiable', 'Pune', 'Kothrud', 2, 1],
  ['home-services', 'service', 'AC repair & gas refilling — same day service', 'All brands serviced. Split & window AC. 30-day service warranty.', 49900, 'starting', 'Pune', 'Baner', 1, 0],
  ['education', 'service', 'Maths & Science home tuition (Class 8–12)', 'Experienced teacher, CBSE/State board. Weekend batches available.', 300000, 'per month', 'Mumbai', 'Andheri', 1, 0],
  ['vehicles', 'product', 'Honda Activa 6G 2022 — single owner', '9,800 km driven, all papers clear, insurance valid till 2027.', 6500000, null, 'Nagpur', 'Dharampeth', 0, 0],
];
for (const [slug, kind, title, desc, price, note, city, loc, planIdx, top] of demo) {
  if (db.prepare('SELECT 1 FROM ads WHERE title = ?').get(title)) continue;
  const p = plans[planIdx];
  const paid = p.price_paise + (top ? p.top_price_paise : 0);
  const r = db.prepare(`INSERT INTO ads (client_id, category_id, kind, title, description, price_paise, price_note, city, locality, contact_phone, whatsapp, status, plan_id, is_top, paid_total_paise, starts_at, expires_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?, '9876500000', '9876500000', 'active', ?, ?, ?, ?, ?, ?, ?)`)
    .run(seller.id, cat(slug), kind, title, desc, price, note, city, loc, p.id, top, paid, now, now + p.days * day, now, now);
  rescore(Number(r.lastInsertRowid));
}
console.log('Demo data ready. Seller login: demo.seller@example.com / demo12345');
