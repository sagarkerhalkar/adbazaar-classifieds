'use strict';
// Run with: npm test
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adb-test-'));
process.env.STORAGE_DIR = tmp;
process.env.DATABASE_FILE = path.join(tmp, 'test.db');
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'secret_for_tests';

const V = require('../src/validators');
const { computeScore } = require('../src/ranking');
const { html, raw } = require('../src/lib/html');
const { hashPassword, verifyPassword } = require('../src/lib/security');
const { parseMultipart } = require('../src/lib/body');
const P = require('../src/payments');

test('Aadhaar Verhoeff validation', () => {
  assert.equal(V.isValidAadhaar('2341 2341 2346'), true);
  assert.equal(V.isValidAadhaar('234123412347'), false);
  assert.equal(V.isValidAadhaar('123412341234'), false); // cannot start with 0/1
});

test('PAN, phone, PIN validation', () => {
  assert.ok(V.isValidPAN('ABCDE1234F'));
  assert.ok(!V.isValidPAN('ABCD1234F'));
  assert.ok(V.isValidPhone('+91 98765 43210'));
  assert.ok(!V.isValidPhone('12345'));
  assert.ok(V.isValidPincode('411001'));
  assert.ok(!V.isValidPincode('011001'));
});

test('ranking: longer / paid-more plan > fresher cheap plan; expired = -1', () => {
  const now = Date.now();
  const base = { status: 'active', starts_at: now, expires_at: now + 7 * 864e5, views: 0, admin_boost: 0 };
  const basic = computeScore({ ...base, paid_total_paise: 19900 }, 1, now);
  const premiumOld = computeScore({ ...base, starts_at: now - 10 * 864e5, expires_at: now + 19 * 864e5, paid_total_paise: 59900 }, 3, now);
  assert.ok(premiumOld > basic, `${premiumOld} > ${basic}`);
  assert.equal(computeScore({ ...base, expires_at: now - 1 }, 3, now), -1, 'expired ads score -1');
});

test('TOP time slots (India time, 3-hour slots)', () => {
  const S = require('../src/slots');
  const ist = (h, m = 0) => Date.UTC(2026, 10, 2, h, m) - 5.5 * 3600_000; // h:m India time
  assert.equal(S.currentSlot(ist(0, 5)), 0);    // 12–3 AM
  assert.equal(S.currentSlot(ist(9, 0)), 3);    // 9 AM–12 PM
  assert.equal(S.currentSlot(ist(14, 59)), 4);  // 12–3 PM
  assert.equal(S.currentSlot(ist(18, 30)), 6);  // 6–9 PM
  assert.equal(S.currentSlot(ist(23, 59)), 7);  // 9 PM–12 AM
  const mask = S.maskFrom(['3', '6', '9', 'x']);
  assert.equal(mask, (1 << 3) | (1 << 6));
  assert.ok(S.inSlot(mask, 6) && !S.inSlot(mask, 5));
  // default prices: 9–12 ₹20/day + 6–9 PM ₹30/day, for 15 days
  assert.equal(S.topCost(mask, 15), (2000 + 3000) * 15);
});

test('categories: main includes subs; ads need a sub-category when one exists', () => {
  const C = require('../src/categories');
  const el = C.bySlug('electronics');
  const ids = C.idsForSlug('electronics');
  assert.ok(ids.includes(el.id) && ids.length > 1);
  assert.match(C.checkForAd(el.id), /sub-category/);
  assert.equal(C.checkForAd(C.bySlug('electronics-mobile-phones').id), null);
  assert.equal(C.checkForAd(C.bySlug('other').id), null);
});

test('video length is read from the MP4 header', () => {
  const { videoDuration } = require('../src/lib/files');
  const box = (type, body) => { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length); b.write(type, 4, 'latin1'); return Buffer.concat([b, body]); };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(45_000, 16); // timescale 1000, 45 s
  const file = Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', box('mvhd', mvhd))]);
  assert.equal(videoDuration(file), 45);
});

test('OTP: right code once, wrong code counted', () => {
  const { db } = require('../src/db');
  const N = require('../src/notify');
  const r = db.prepare("INSERT INTO clients (name, email, phone, password_hash, address, city, state, pincode, aadhaar_last4, pan_number, status, status_token, created_at) VALUES ('T','otp@test.in','9999999999','x','a','c','s','411001','1234','ABCDE1234F','unverified','tok-otp-test-000000000000',1)").run();
  const id = Number(r.lastInsertRowid);
  const { code } = N.issueOtp(id, 'email');
  assert.equal(N.checkOtp(id, 'email', '000000' === code ? '111111' : '000000'), 'wrong');
  assert.equal(N.checkOtp(id, 'email', code), 'ok');
  assert.equal(N.checkOtp(id, 'email', code), 'expired', 'a code works only once');
});

test('deactivate freezes paid time; reactivate gives it back', () => {
  const { db } = require('../src/db');
  const life = require('../src/lifecycle');
  const r = db.prepare("INSERT INTO clients (name, email, phone, password_hash, address, city, state, pincode, aadhaar_last4, pan_number, status, status_token, created_at) VALUES ('L','life@test.in','9999999998','x','a','c','s','411001','1234','ABCDE1234F','approved','tok-life-test-00000000000',1)").run();
  const cid = Number(r.lastInsertRowid);
  const cat = db.prepare('SELECT id FROM categories LIMIT 1').get().id;
  const left = 5 * 864e5;
  const a = db.prepare("INSERT INTO ads (client_id, category_id, title, description, city, contact_phone, status, starts_at, expires_at, created_at, updated_at) VALUES (?, ?, 'Ad', 'Desc', 'Pune', '9999999998', 'active', ?, ?, 1, 1)")
    .run(cid, cat, Date.now(), Date.now() + left);
  const aid = Number(a.lastInsertRowid);
  life.deactivateClient(cid, 'client');
  assert.equal(db.prepare('SELECT status FROM ads WHERE id = ?').get(aid).status, 'paused');
  life.reactivateClient(cid);
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(aid);
  assert.equal(ad.status, 'active');
  assert.ok(Math.abs(ad.expires_at - Date.now() - left) < 5000, 'remaining days restored');
  life.deleteAd(aid);
  assert.equal(db.prepare('SELECT status FROM ads WHERE id = ?').get(aid).status, 'deleted');
});

test('html escapes by default', () => {
  assert.equal(String(html`<p>${'<script>'}</p>`), '<p>&lt;script&gt;</p>');
  assert.equal(String(html`<p>${raw('<b>ok</b>')}</p>`), '<p><b>ok</b></p>');
});

test('password hashing', () => {
  const h = hashPassword('correct horse');
  assert.ok(verifyPassword('correct horse', h));
  assert.ok(!verifyPassword('wrong', h));
});

test('multipart parsing', () => {
  const b = 'XyZ';
  const body = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="title"\r\n\r\nHello\r\n--${b}\r\nContent-Disposition: form-data; name="images[]"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\nDATA\r\n--${b}--\r\n`);
  const { fields, files } = parseMultipart(body, b);
  assert.equal(fields.title, 'Hello');
  assert.equal(files.images[0].data.toString(), 'DATA');
});

test('Razorpay checkout signature verification', () => {
  const sig = crypto.createHmac('sha256', 'secret_for_tests').update('order_1|pay_1').digest('hex');
  assert.ok(P.verifyCheckoutSignature('order_1', 'pay_1', sig));
  assert.ok(!P.verifyCheckoutSignature('order_1', 'pay_2', sig));
});

test('age check: only 18+ (birthday counted in India time)', () => {
  assert.equal(V.ageFromDob('2008-11-02', '2026-11-02'), 18, '18 on the birthday');
  assert.equal(V.ageFromDob('2008-11-03', '2026-11-02'), 17, 'one day short');
  assert.equal(V.ageFromDob('2007-02-29', '2026-01-01'), null, 'invalid date');
  assert.equal(V.ageFromDob('1990-05-15', '2026-11-02'), 36);
  assert.equal(V.checkDob(''), 'Enter your date of birth.');
  assert.match(V.checkDob('2015-01-01'), /18 years or older/);
  assert.equal(V.checkDob('1990-05-15'), null);
});
