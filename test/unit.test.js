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

test('ranking: TOP > longer/paid-more plan > fresher', () => {
  const now = Date.now();
  const base = { status: 'active', starts_at: now, expires_at: now + 7 * 864e5, views: 0, admin_boost: 0, is_top: 0 };
  const basic = computeScore({ ...base, paid_total_paise: 19900 }, 1, now);
  const premiumOld = computeScore({ ...base, starts_at: now - 10 * 864e5, expires_at: now + 19 * 864e5, paid_total_paise: 59900 }, 3, now);
  const top = computeScore({ ...base, is_top: 1, paid_total_paise: 49800 }, 1, now);
  assert.ok(top > premiumOld && premiumOld > basic, `${top} > ${premiumOld} > ${basic}`);
  assert.equal(computeScore({ ...base, expires_at: now - 1 }, 3, now), -1, 'expired ads score -1');
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
