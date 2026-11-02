'use strict';
const crypto = require('node:crypto');

// ---- Password hashing (scrypt) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ---- Security headers ----
function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://checkout.razorpay.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.razorpay.com",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.razorpay.com",
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '));
  if (process.env.COOKIE_SECURE === '1' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
}

// ---- CSRF (synchronizer token stored in session) ----
const CSRF_EXEMPT = new Set(['/webhooks/razorpay']);

function csrfProtect(req, res) {
  if (!req.session.csrf) req.session.csrf = randomToken(24);
  req.csrfToken = req.session.csrf;
  if (req.method !== 'POST' || CSRF_EXEMPT.has(req.path)) return;
  const sent = req.body?._csrf || req.headers['x-csrf-token'];
  if (!safeEqual(sent, req.session.csrf)) {
    const e = new Error('Your form session expired. Please go back, refresh the page and try again.');
    e.status = 403;
    throw e;
  }
}

// ---- Simple in-memory rate limiter ----
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

module.exports = { hashPassword, verifyPassword, randomToken, safeEqual, securityHeaders, csrfProtect, rateLimit };
