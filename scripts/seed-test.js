'use strict';
/**
 * Test data for trying AdBazaar locally.
 *   npm run seed:test      → adds test clients, ads, payments and a report
 *   npm run seed:remove    → removes ONLY the test data (everything with a *.test@example.com client)
 *
 * All test sellers log in with password:  Test@1234
 * Safe to run more than once — existing test data is skipped.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) process.loadEnvFile(path.join(__dirname, '..', '.env'));
process.removeAllListeners('warning');

const { db, tx, parseImages, getSettings } = require('../src/db');
const { hashPassword, randomToken } = require('../src/lib/security');
const { saveUpload, removeFile } = require('../src/lib/files');
const { rescore } = require('../src/ranking');
const { topCost, ALL_SLOTS, slotLabels } = require('../src/slots');
const life = require('../src/lifecycle');

const PASSWORD = 'Test@1234';
const DAY = 86400_000;
const HOUR = 3600_000;
const now = Date.now();

// ---------- tiny PNG generator (gradient + shapes) so ads have pictures ----------
function png(w, h, c1, c2, shape) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const cx = w * 0.5, cy = h * 0.46, r = Math.min(w, h) * 0.22;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      let px = [0, 1, 2].map((i) => Math.round(c1[i] * (1 - t) + c2[i] * t));
      const dx = x - cx, dy = y - cy;
      const inside = shape === 'circle' ? dx * dx + dy * dy < r * r
        : shape === 'square' ? Math.abs(dx) < r && Math.abs(dy) < r * 0.8
          : Math.abs(dx) + Math.abs(dy) < r * 1.2;
      if (inside) px = px.map((v) => Math.round(v + (255 - v) * 0.55));
      if (y > h * 0.8 && y < h * 0.86 && x > w * 0.2 && x < w * 0.8) px = [255, 255, 255];
      raw.set(px, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const COLORS = [[232, 69, 44], [43, 108, 176], [31, 157, 85], [107, 63, 160], [214, 140, 30], [20, 140, 150], [200, 60, 120], [70, 80, 100]];
const img = (i, area = 'ads', shape = ['circle', 'square', 'diamond'][i % 3]) =>
  saveUpload({ filename: 'test.png', data: png(640, 480, COLORS[i % COLORS.length], COLORS[(i + 3) % COLORS.length], shape) }, area);

// Real photos for the test ads (public/photos — Unsplash License, see public/photos/CREDITS.md).
const Ph = require('../src/photos');
const photo = (name) => (Ph.exists(name) ? saveUpload({ filename: 'photo.jpg', data: fs.readFileSync(Ph.photoFile(name)) }, 'ads') : img(name.length));
const SEED_VERSION = '3';   // bump when the test ads change; "Update AdBazaar" then refreshes old test data once

// ---------- remove ----------
function removeTestData() {
  const clients = db.prepare("SELECT * FROM clients WHERE email LIKE '%.test@example.com'").all();
  for (const c of clients) {
    for (const ad of db.prepare('SELECT images, videos FROM ads WHERE client_id = ?').all(c.id)) {
      parseImages(ad).forEach((f) => removeFile('ads', f));
      try { JSON.parse(ad.videos || '[]').forEach((v) => removeFile('ads', v.file)); } catch { /* ignore */ }
    }
    for (const s of db.prepare('SELECT file FROM kyc_snapshots WHERE client_id = ?').all(c.id)) removeFile('kyc', s.file);
    ['aadhaar_file', 'aadhaar_back_file', 'pan_file', 'address_proof_file', 'photo_file', 'live_photo_file'].forEach((k) => removeFile('kyc', c[k]));
  }
  tx(() => {
    for (const c of clients) {
      db.prepare('DELETE FROM payments WHERE client_id = ?').run(c.id);
      db.prepare('DELETE FROM clients WHERE id = ?').run(c.id); // ads, reports, snapshots cascade
    }
  });
  console.log(`Removed ${clients.length} test client(s) and all their ads, payments and files.`);
}

if (process.argv.includes('--remove')) { removeTestData(); process.exit(0); }
// Used by "Update AdBazaar": if old test data is there, replace it once with the newest test data (real photos).
if (process.argv.includes('--upgrade')) {
  const has = db.prepare("SELECT 1 FROM clients WHERE email LIKE '%.test@example.com' LIMIT 1").get();
  const ver = (db.prepare("SELECT value FROM settings WHERE key = 'test_seed_version'").get() || {}).value;
  if (!has || ver === SEED_VERSION) process.exit(0);
  removeTestData();
}

// ---------- add ----------
(async () => {
if (db.prepare("SELECT 1 FROM clients WHERE email LIKE '%.test@example.com' LIMIT 1").get()) {
  console.log('Test data is already there. To start fresh: npm run seed:remove  then  npm run seed:test');
  process.exit(0);
}

const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY days').all();
if (plans.length < 3) { console.error('Need at least 3 active plans (Admin → Settings).'); process.exit(1); }
const near = (d) => plans.reduce((a, b) => (Math.abs(b.days - d) < Math.abs(a.days - d) ? b : a));
const [p7, p15, p29] = [near(7), near(15), near(29)];
const catId = (slug) => (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)
  || db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug.split('-')[0])
  || db.prepare('SELECT id FROM categories LIMIT 1').get()).id;
// TOP time slots (bit 0 = 12–3 AM … bit 7 = 9 PM–12 AM)
const DAYTIME = (1 << 3) | (1 << 4) | (1 << 5);   // 9 AM – 6 PM
const EVENING = (1 << 6) | (1 << 7);              // 6 PM – 12 AM
const pwHash = hashPassword(PASSWORD);

const CLIENTS = [
  // key, name, business, email, phone, city, state, pin, pan, status, note
  ['rahul', 'Rahul Sharma', 'Sharma Electronics', 'rahul.test@example.com', '9876500001', 'Pune', 'Maharashtra', '411001', 'ABCPS1234K', 'approved'],
  ['sneha', 'Sneha Kulkarni', 'Sneha Tutorials', 'sneha.test@example.com', '9876500002', 'Mumbai', 'Maharashtra', '400053', 'BCDPK2345L', 'approved'],
  ['amit', 'Amit Verma', 'Verma Motors', 'amit.test@example.com', '9876500003', 'Nagpur', 'Maharashtra', '440010', 'CDEPV3456M', 'approved'],
  ['fatima', 'Fatima Shaikh', 'Glow Beauty Studio', 'fatima.test@example.com', '9876500004', 'Nashik', 'Maharashtra', '422002', 'DEFPS4567N', 'approved'],
  ['vikram', 'Vikram Joshi', 'Joshi Furniture', 'vikram.test@example.com', '9876500005', 'Pune', 'Maharashtra', '411038', 'EFGPJ5678P', 'pending'],
  ['pooja', 'Pooja Desai', '', 'pooja.test@example.com', '9876500006', 'Ahmedabad', 'Gujarat', '380009', 'FGHPD6789Q', 'video_call'],
  ['ravi', 'Ravi Kumar', 'RK Mobiles', 'ravi.test@example.com', '9876500007', 'Delhi', 'Delhi', '110092', 'GHIPK7890R', 'rejected', 'PAN card photo is blurred and the name does not match Aadhaar. Please register again with clear documents.'],
  ['neha', 'Neha Patil', '', 'neha.test@example.com', '9876500008', 'Pune', 'Maharashtra', '411004', 'HIJPP8901S', 'unverified'],
  ['karan', 'Karan Mehta', 'Mehta Gadgets', 'karan.test@example.com', '9876500009', 'Surat', 'Gujarat', '395007', 'IJKPM9012T', 'approved'],
];

const ADS = [
  // client, category, kind, title, description, price ₹, note, city, locality, plan, top, startedDaysAgo, state, [photos], free ad?
  ['rahul', 'electronics-mobile-phones', 'product', 'OnePlus 11 5G, 128 GB, with wireless charger', 'Bought in 2025, battery health 94%. Box, bill and the wireless charging stand included. No scratches, always used with a cover.', 34500, 'Negotiable', 'Pune', 'Kothrud', p29, ALL_SLOTS, 1, 'active', ['phone-charger', 'laptop-phone']],
  ['rahul', 'electronics-tv-audio', 'product', 'Portable Bluetooth speaker, 30 W, red', 'Deep bass, 12-hour battery, water resistant. Used for 3 months, works perfectly. Charging cable included.', 4999, null, 'Pune', 'Baner', p15, 0, 3, 'active', ['speaker-1', 'speaker-2']],
  ['rahul', 'home-services-ac-appliance-repair', 'service', 'Laptop & computer repair — doorstep pickup', 'Screen, battery, keyboard, charging port and software issues. All brands. 30-day warranty on repairs.', 299, 'starting', 'Pune', 'Shivaji Nagar', p7, 0, 0, 'active', ['repair-board', 'repair-laptop']],
  ['rahul', 'electronics-accessories', 'product', 'Wireless noise-cancelling headphones', '40-hour battery, with carry case. 3 months old, selling because I got a gift.', 9500, null, 'Pune', 'Aundh', p7, 0, 0, 'payment_review', ['headphones-1', 'headphones-2']],
  ['rahul', 'jobs-full-time', 'service', 'Hiring: sales executive for electronics store', 'Full-time job in Pune. Freshers welcome, training given. Salary plus incentive, Sunday off.', 22000, 'per month', 'Pune', 'Camp', p15, 0, 2, 'active', ['people-team-handshake', 'office-room']],
  ['sneha', 'education-tuition', 'service', 'Maths & Science tuition, Class 8–12 (CBSE/State)', 'Experienced teacher, 10+ years. Small batches of 5. Weekend doubt sessions. First class free.', 3000, 'per month', 'Mumbai', 'Andheri West', p29, DAYTIME, 4, 'active', ['people-whiteboard', 'whiteboard-plan']],
  ['sneha', 'education-coaching-classes', 'service', 'Spoken English classes — online & offline', 'Speak with confidence in 60 days. Interview practice included. Morning and evening batches.', 2500, 'per month', 'Mumbai', 'Goregaon', p15, 0, 6, 'active', ['people-meeting', 'people-women-laptop']],
  ['sneha', 'education-music-dance', 'service', 'Pottery & craft weekend classes', 'For beginners. Clay and tools provided. 4 weekends, small groups.', 4000, 'full course', 'Mumbai', 'Malad', p7, 0, 8, 'expired', ['pottery-class', 'pottery-hands']],
  ['sneha', 'furniture-home-decor', 'product', 'Work-from-home desk with monitor and chair', 'Complete desk setup, 1 year old. Pickup from Andheri.', 6500, null, 'Mumbai', 'Andheri East', null, 0, 1, 'active', ['desk-setup', 'laptop-wood'], true],
  ['amit', 'vehicles-bikes-scooters', 'product', 'Electric bicycle 2024 — 60 km range', 'Single owner, 1,200 km. Removable battery, bill and warranty card. Helmet free.', 38000, null, 'Nagpur', 'Dharampeth', p15, 0, 2, 'active', ['ebike-1', 'ebike-2']],
  ['amit', 'vehicles-bikes-scooters', 'product', 'City bicycle with basket — like new', 'Comfortable seat, 7 gears, front basket. Used only on weekends.', 7900, 'Slightly negotiable', 'Nagpur', 'Sadar', p29, 0, 5, 'active', ['citybike', 'roadbike']],
  ['amit', 'vehicles-spare-parts', 'service', 'Bicycle service & repair at your home — ₹349', 'Brake and gear tuning, chain cleaning, puncture repair. Book a slot on WhatsApp.', 349, null, 'Nagpur', 'Civil Lines', p7, 0, 6.6, 'active', ['bike-repair', 'helmet']], // ends within a day
  ['amit', 'property-for-rent', 'product', '2 BHK flat for rent, semi-furnished', 'Near metro station, lift and parking. Family preferred. 2 months deposit.', 18000, 'per month', 'Nagpur', 'Wardha Road', p29, 0, 3, 'active', ['property-apartment', 'living-room']],
  ['amit', 'fashion-men', 'product', 'Leather travel bag & card wallet', 'Genuine leather, hardly used. The bag fits a weekend of clothes.', 3200, 'for both', 'Nagpur', 'Ramdaspeth', null, 0, 0.5, 'active', ['leather-bag', 'wallet-hands'], true],
  ['fatima', 'wellness-beauty-salon', 'service', 'Facial, hair spa & bridal packages', 'Trained beauticians, branded products. Bridal trial available. Women only.', 1499, 'starting', 'Nashik', 'College Road', p29, EVENING, 0.2, 'active', ['salon-facial', 'salon-hair']],
  ['fatima', 'wellness-beauty-salon', 'service', 'Nail art & manicure studio', 'Gel nails, extensions and manicure. Hygienic tools, appointments on WhatsApp.', 499, 'starting', 'Nashik', 'Gangapur Road', p15, 0, 1.5, 'active', ['salon-nails', 'spa-candles']],
  ['fatima', 'wellness-massage-spa', 'service', 'Ayurvedic massage & spa — certified therapists', 'Full-body oil massage, foot reflexology and hot-stone therapy at a licensed spa. Women therapists for women guests.', 1200, 'per hour', 'Nashik', 'Indira Nagar', p15, 0, 1, 'active', ['spa-stones', 'spa-foot']],
  ['fatima', 'events-catering', 'service', 'Wedding & party catering — 50 to 500 guests', 'Veg and non-veg menus, live counters, decoration on request. Taste session before booking.', 450, 'per plate', 'Nashik', 'Panchavati', p15, 0, 2, 'active', ['event-table', 'event-food']],
  ['fatima', 'furniture-sofas-beds', 'product', 'Leather armchair with floor lamp', 'Comfortable armchair, 2 years old, very good condition. Self pickup.', 7500, null, 'Nashik', 'Indira Nagar', null, 0, 0, 'awaiting_payment', ['armchair', 'sofa-cushion']],
  ['karan', 'electronics-laptops-computers', 'product', 'Laptop 14", i5 12th gen, 16 GB RAM', 'Used 1 year, 512 GB SSD, charger included. Good for office and college.', 38000, null, 'Surat', 'Adajan', p15, 0, 2, 'active', ['laptop-open', 'laptop-dark']],
];

tx(() => {
  const ids = {};
  CLIENTS.forEach(([key, name, biz, email, phone, city, state, pin, pan, status, note], i) => {
    const docs = { a: img(i, 'kyc', 'square'), p: img(i + 1, 'kyc', 'square'), ph: img(i + 2, 'kyc', 'circle'), live: img(i + 4, 'kyc', 'circle') };
    const created = now - (status === 'approved' ? 15 : 1) * DAY + i * HOUR;
    const verified = status === 'unverified' ? null : created + 60_000;
    const r = db.prepare(`INSERT INTO clients (name, business_name, email, phone, password_hash, address, city, state, pincode, aadhaar_last4, pan_number,
      aadhaar_file, pan_file, photo_file, live_photo_file, status, status_token, video_call_at, admin_note, reviewed_at, created_at,
      email_verified_at, phone_verified_at, submitted_at, dob, id_type, id_number, id_file)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(name, biz, email, phone, pwHash, `${10 + i}, Test Street, Near Main Market`, city, state, pin, String(1000 + i * 1111).slice(-4), pan,
        docs.a, docs.p, docs.ph, docs.live, status, randomToken(24), status === 'video_call' ? now + 2 * HOUR : null, note || null,
        status === 'pending' || status === 'unverified' ? null : created + DAY, created,
        verified, verified, status === 'unverified' ? null : created + 2 * 60_000, `${1975 + i * 3}-0${(i % 9) + 1}-1${i % 9}`,
        ['aadhaar', 'pan', 'passport'][i % 3], [String(1000 + i * 1111).slice(-4), pan, `K${String(1234567 + i)}`][i % 3], docs.a);
    ids[key] = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO kyc_snapshots (client_id, file, source, created_at) VALUES (?, ?, 'selfie', ?)").run(ids[key], docs.live, created);
  });

  const freeDays = Number(getSettings().free_ad_days) || 15;
  ADS.forEach(([key, cat, kind, title, desc, price, note, city, loc, plan, top, ago, state, pics, free], i) => {
    const images = pics.map(photo);
    const start = now - ago * DAY;
    const isLive = state === 'active';
    const paid = plan ? plan.price_paise + topCost(top, plan.days) : 0;
    const expires = free ? start + freeDays * DAY : plan && state !== 'awaiting_payment' && state !== 'payment_review' ? start + plan.days * DAY : null;
    const r = db.prepare(`INSERT INTO ads (client_id, category_id, kind, title, description, price_paise, price_note, city, locality, contact_phone, whatsapp, images,
      status, plan_id, is_top, top_slots, paid_total_paise, starts_at, expires_at, views, created_at, updated_at, is_free)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ids[key], catId(cat), kind, title, desc, price * 100, note, city, loc, CLIENTS.find((c) => c[0] === key)[4], CLIENTS.find((c) => c[0] === key)[4],
        JSON.stringify(images), state, plan && (isLive || state === 'expired') ? plan.id : null, isLive && top ? 1 : 0, isLive ? top : 0, plan && (isLive || state === 'expired') ? paid : 0,
        isLive || state === 'expired' ? start : null, expires, isLive ? Math.floor(Math.random() * 180) : 0, start - HOUR, start, free ? 1 : 0);
    const adId = Number(r.lastInsertRowid);

    if (plan && (isLive || state === 'expired')) {
      // A paid payment record → shows in revenue
      const online = i % 2 === 0;
      db.prepare(`INSERT INTO payments (client_id, ad_id, plan_id, days, with_top, top_slots, amount_paise, method, status, razorpay_order_id, razorpay_payment_id, utr, confirmed_at, created_at)
        VALUES (?,?,?,?,?,?,?,?, 'paid', ?, ?, ?, ?, ?)`)
        .run(ids[key], adId, plan.id, plan.days, top ? 1 : 0, top, paid, online ? 'razorpay' : 'upi_manual',
          online ? `order_TEST${adId}` : null, online ? `pay_TEST${adId}` : null, online ? null : `4120000000${String(adId).padStart(2, '0')}`, start, start - 10 * 60_000);
    }
    if (state === 'payment_review') {
      // A UPI payment waiting for YOU to confirm in Admin → Payments
      db.prepare(`INSERT INTO payments (client_id, ad_id, plan_id, days, with_top, amount_paise, method, status, utr, created_at)
        VALUES (?,?,?,?,0,?, 'upi_manual', 'pending', '512345678901', ?)`).run(ids[key], adId, p7.id, p7.days, p7.price_paise, now - 20 * 60_000);
    }
    if (title.startsWith('Portable Bluetooth')) {
      db.prepare('INSERT INTO reports (ad_id, reason, details, reporter_ip, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(adId, 'Wrong category', 'Test report — try "Dismiss" or "Block ad" in Admin → Reports.', '127.0.0.1', now - 3 * HOUR);
    }
  });
  return ids;
});
db.prepare("INSERT INTO settings (key, value) VALUES ('test_seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(SEED_VERSION);
rescore(0);
// Karan deactivated his own account: his live ad is hidden with its remaining days saved.
const karan = db.prepare("SELECT id FROM clients WHERE email = 'karan.test@example.com'").get();
if (karan) life.deactivateClient(karan.id, 'client');

console.log(`
Test data added.

  Test seller logins (password for all: ${PASSWORD})
    rahul.test@example.com   approved  - 4 live ads (incl. a job), 1 payment waiting for you
    sneha.test@example.com   approved  - TOP ad, 1 expired ad (try Renew), 1 FREE ad
    amit.test@example.com    approved  - bicycles, a flat for rent, 1 FREE ad, one ad ends within a day
    fatima.test@example.com  approved  - salon, spa, catering, TOP ad, 1 unpaid ad (try Pay)
    vikram.test@example.com  PENDING   - review & approve him in Admin → Clients
    pooja.test@example.com   VIDEO CALL requested
    ravi.test@example.com    REJECTED
    neha.test@example.com    OTP NOT DONE - registered but did not confirm email/phone yet
    karan.test@example.com   DEACTIVATED himself - log in as him to see "Reactivate"

  TOP ads by time slot (India time):
    OnePlus phone (Rahul)    ${slotLabels(ALL_SLOTS).join(', ')}
    Maths tuition (Sneha)    ${slotLabels(DAYTIME).join(', ')}
    Facial & hair (Fatima)   ${slotLabels(EVENING).join(', ')}

  Remove all test data later with:  npm run seed:remove
`);
})();
