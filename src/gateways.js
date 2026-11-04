'use strict';
// Online payment gateways. A payment made through any of them is confirmed AUTOMATICALLY once the gateway
// confirms it (signature / capture / webhook check). Only manual UPI (UTR) payments wait for the admin.
//
//  • Razorpay — India: credit and debit cards (Visa, Mastercard, RuPay, Amex), UPI, netbanking, wallets, EMI,
//               and international cards if enabled in the Razorpay account. Charged in rupees.
//  • PayPal   — buyers abroad (PayPal balance, or cards on PayPal's page). PayPal cannot take rupees from
//               India, so it charges in the foreign currency set by the owner (USD by default) at the owner's rate.
//  • Stripe   — international cards (Stripe is invite-only for Indian businesses). Same currency and rate.
//
// Keys: Admin → Settings → Online payments (owner only). Environment variables in .env override them.

const crypto = require('node:crypto');
const { db, getSettings } = require('./db');
const { safeEqual } = require('./lib/security');

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
// API addresses (the *_API_BASE variables exist only for automatic tests against a stand-in server).
const RZP_API = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com';
const STRIPE_API = () => process.env.STRIPE_API_BASE || 'https://api.stripe.com';

function conf(s = getSettings()) {
  const e = process.env;
  const currency = CURRENCIES.includes(s.intl_currency) ? s.intl_currency : 'USD';
  return {
    rzp: { keyId: e.RAZORPAY_KEY_ID || s.rzp_key_id || '', secret: e.RAZORPAY_KEY_SECRET || s.rzp_key_secret || '', webhook: e.RAZORPAY_WEBHOOK_SECRET || s.rzp_webhook_secret || '' },
    paypal: { id: e.PAYPAL_CLIENT_ID || s.paypal_client_id || '', secret: e.PAYPAL_SECRET || s.paypal_secret || '', live: (e.PAYPAL_MODE || s.paypal_mode) === 'live' },
    stripe: { secret: e.STRIPE_SECRET_KEY || s.stripe_secret || '', webhook: e.STRIPE_WEBHOOK_SECRET || s.stripe_webhook_secret || '' },
    currency,
    rate: Math.max(0.0001, Number(s.intl_rate) || 88),   // ₹ for 1 unit of the currency
  };
}
function enabled(c = conf()) {
  return { razorpay: !!(c.rzp.keyId && c.rzp.secret), paypal: !!(c.paypal.id && c.paypal.secret), stripe: !!c.stripe.secret };
}
const anyOnline = () => Object.values(enabled()).some(Boolean);

/** Rupees (in paise) → the foreign amount PayPal / Stripe will charge. */
function intlAmount(paise, c = conf()) {
  const minor = Math.max(50, Math.ceil(paise / c.rate));      // cents; rounded up so the owner never gets less
  return { currency: c.currency, minor, value: (minor / 100).toFixed(2), text: `${c.currency} ${(minor / 100).toFixed(2)}` };
}

// ---------- Razorpay ----------
async function razorpayOrder(amountPaise, receipt, notes) {
  const c = conf().rzp;
  const r = await fetch(`${RZP_API()}/v1/orders`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${c.keyId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.description || `Razorpay error ${r.status}`);
  return body;
}
const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const razorpayCheckoutOk = (orderId, paymentId, sig) => { const s = conf().rzp.secret; return !!s && safeEqual(hmacHex(s, `${orderId}|${paymentId}`), String(sig || '')); };
const razorpayWebhookOk = (raw, sig) => { const s = conf().rzp.webhook; return !!s && safeEqual(hmacHex(s, raw), String(sig || '')); };

// ---------- PayPal (Orders v2) ----------
const ppBase = (c = conf()) => process.env.PAYPAL_API_BASE || (c.paypal.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
let ppToken = { value: '', until: 0, key: '' };
async function paypalToken() {
  const c = conf();
  const key = `${c.paypal.id}:${c.paypal.live}`;
  if (ppToken.value && ppToken.key === key && ppToken.until > Date.now() + 60_000) return ppToken.value;
  const r = await fetch(`${ppBase(c)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${c.paypal.id}:${c.paypal.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.access_token) throw new Error(b.error_description || `PayPal login failed (${r.status})`);
  ppToken = { value: b.access_token, until: Date.now() + (Number(b.expires_in) || 3000) * 1000, key };
  return ppToken.value;
}
async function paypalOrder({ amountPaise, ref, description, returnUrl, cancelUrl, brand }) {
  const amt = intlAmount(amountPaise);
  const r = await fetch(`${ppBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await paypalToken()}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `${ref}-${Date.now()}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: ref, custom_id: ref, description: String(description).slice(0, 120), amount: { currency_code: amt.currency, value: amt.value } }],
      payment_source: { paypal: { experience_context: { brand_name: String(brand || '').slice(0, 120) || undefined, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', return_url: returnUrl, cancel_url: cancelUrl } } },
    }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.message || b.details?.[0]?.description || `PayPal error ${r.status}`);
  const link = (b.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  if (!b.id || !link) throw new Error('PayPal did not return a payment page');
  return { id: b.id, url: link.href, charged: amt.text };
}
async function paypalCapture(orderId) {
  const r = await fetch(`${ppBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST', headers: { Authorization: `Bearer ${await paypalToken()}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  const b = await r.json().catch(() => ({}));
  // A capture that was already done returns ORDER_ALREADY_CAPTURED; read the order instead.
  let order = b;
  if (!r.ok && (b.details || []).some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
    const g = await fetch(`${ppBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${await paypalToken()}` } });
    order = await g.json().catch(() => ({}));
  } else if (!r.ok) throw new Error(b.message || b.details?.[0]?.description || `PayPal error ${r.status}`);
  const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
  return { completed: order.status === 'COMPLETED' && cap?.status === 'COMPLETED', id: cap?.id || '', text: cap ? `${cap.amount.currency_code} ${cap.amount.value}` : '' };
}

// ---------- Stripe (Checkout Sessions) ----------
function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join('&');
}
async function stripeCall(method, path, body) {
  const r = await fetch(`${STRIPE_API()}/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${conf().stripe.secret}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: body ? form(body) : undefined,
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error?.message || `Stripe error ${r.status}`);
  return b;
}
async function stripeSession({ amountPaise, ref, description, successUrl, cancelUrl, email }) {
  const amt = intlAmount(amountPaise);
  const s = await stripeCall('POST', 'checkout/sessions', {
    mode: 'payment', success_url: successUrl, cancel_url: cancelUrl, client_reference_id: ref, customer_email: email || undefined,
    metadata: { ref },
    line_items: { 0: { quantity: 1, price_data: { currency: amt.currency.toLowerCase(), unit_amount: amt.minor, product_data: { name: String(description).slice(0, 120) } } } },
  });
  return { id: s.id, url: s.url, charged: amt.text };
}
async function stripeGet(id) {
  const s = await stripeCall('GET', `checkout/sessions/${encodeURIComponent(id)}`);
  return { paid: s.payment_status === 'paid', id: s.payment_intent || s.id, text: `${String(s.currency || '').toUpperCase()} ${((s.amount_total || 0) / 100).toFixed(2)}`, ref: s.client_reference_id };
}
/** Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.body"; rejected if older than 5 minutes. */
function stripeWebhookEvent(raw, header) {
  const secret = conf().stripe.webhook;
  if (!secret || !header) return null;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header).split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return null;
  const expected = hmacHex(secret, `${t}.${raw.toString('utf8')}`);
  if (!sigs.some((s) => safeEqual(expected, s))) return null;
  try { return JSON.parse(raw.toString('utf8')); } catch { return null; }
}

// ---------- finishing a paid order (the same for every gateway) ----------
const LABEL = { razorpay: 'Razorpay', paypal: 'PayPal', stripe: 'Card (Stripe)', upi_manual: 'UPI', upi: 'UPI', wallet: 'Balance' };

/** An ad payment was paid online: confirm it and put the ad live. Safe to call twice. */
function finishAdPayment(payId, { txn = '', charged = '' } = {}) {
  const P = require('./payments');
  const notify = require('./notify');
  if (txn || charged) db.prepare('UPDATE payments SET gateway_txn = COALESCE(NULLIF(?, \'\'), gateway_txn), charged = COALESCE(NULLIF(?, \'\'), charged) WHERE id = ?').run(txn, charged, payId);
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(payId);
  if (!pay || !['created', 'pending', 'failed'].includes(pay.status) && pay.status !== 'paid') return null;
  const done = P.confirmPayment(payId, { razorpayPaymentId: pay.method === 'razorpay' ? txn || null : null, note: `Paid online (${LABEL[pay.method] || pay.method}) — confirmed automatically` });
  if (!done.already) {
    try { notify.paymentConfirmed(payId); } catch (e) { console.error('[pay] notify', e.message); }
    try { notify.adminAlert('payment', `💳 Online payment ${(pay.amount_paise / 100).toLocaleString('en-IN')} ₹ via ${LABEL[pay.method]} — ad #${pay.ad_id} is live (confirmed automatically)`); } catch { /* ignore */ }
  }
  return done;
}

/** A balance top-up was paid online: add the money. Safe to call twice. */
function finishTopup(topupId, { txn = '', charged = '' } = {}) {
  const W = require('./wallet');
  const notify = require('./notify');
  const t = db.prepare('SELECT * FROM wallet_topups WHERE id = ?').get(topupId);
  if (!t) return null;
  const r = db.prepare("UPDATE wallet_topups SET status = 'paid', confirmed_at = ?, gateway_txn = ?, charged = COALESCE(NULLIF(?, ''), charged), admin_note = 'Paid online — added automatically' WHERE id = ? AND (status = 'created' OR (status = 'rejected' AND method != 'upi'))")
    .run(Date.now(), txn || null, charged, t.id);
  if (!r.changes) return { already: true };
  W.credit(t.client_id, t.amount_paise, 'topup', `Online top-up (${LABEL[t.method] || t.method})${txn ? ` · ${txn}` : ''}`);
  const rs = `₹${(t.amount_paise / 100).toLocaleString('en-IN')}`;
  try { notify.inbox(t.client_id, { kind: 'topup', tone: 'success', title: `${rs} added to your balance`, body: `Your online payment was successful. Use the balance for ads or showcase bids.`, link: '/client/showcase', linkText: 'Bid for the showcase' }); } catch { /* ignore */ }
  try { notify.adminAlert('payment', `💰 Online top-up ${rs} via ${LABEL[t.method]} (added automatically)`); } catch { /* ignore */ }
  return { already: false };
}

/** Find what an online reference belongs to: an ad payment or a top-up. */
function findByRef(ref) {
  const pay = db.prepare('SELECT * FROM payments WHERE gateway_ref = ? OR razorpay_order_id = ?').get(ref, ref);
  if (pay) return { kind: 'pay', row: pay };
  const top = db.prepare('SELECT * FROM wallet_topups WHERE gateway_ref = ?').get(ref);
  return top ? { kind: 'topup', row: top } : null;
}

function markFailed(found, why) {
  if (!found) return;
  if (found.kind === 'pay') db.prepare("UPDATE payments SET status = 'failed', admin_note = ? WHERE id = ? AND status = 'created'").run(why, found.row.id);
  else db.prepare("UPDATE wallet_topups SET status = 'rejected', admin_note = ? WHERE id = ? AND status = 'created'").run(why, found.row.id);
}

module.exports = {
  CURRENCIES, LABEL, conf, enabled, anyOnline, intlAmount,
  razorpayOrder, razorpayCheckoutOk, razorpayWebhookOk,
  paypalOrder, paypalCapture, stripeSession, stripeGet, stripeWebhookEvent,
  finishAdPayment, finishTopup, findByRef, markFailed,
};
