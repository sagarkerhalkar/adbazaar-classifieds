'use strict';
// Payment logic: pricing, Razorpay integration, and activating an ad once payment is confirmed.

const crypto = require('node:crypto');
const { db, tx } = require('./db');
const { rescore } = require('./ranking');
const { safeEqual } = require('./lib/security');
const { topCost } = require('./slots');

const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const razorpayEnabled = () => Boolean(RZP_KEY_ID && RZP_KEY_SECRET);

// Total = plan price + (price per day of each chosen TOP slot × plan days), minus the plan's discount (e.g. 20% on subscriptions).
function listPrice(plan, topMask) {
  return plan.price_paise + topCost(topMask || 0, plan.days);
}
function quote(plan, topMask) {
  const list = listPrice(plan, topMask);
  const d = Math.max(0, Math.min(90, plan.discount_pct || 0));
  return d ? Math.round((list * (100 - d)) / 10000) * 100 : list;   // discounted prices are rounded to whole rupees
}

async function createRazorpayOrder(amountPaise, receipt, notes) {
  const auth = Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.description || `Razorpay error ${r.status}`);
  return body;
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', RZP_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

function verifyWebhookSignature(rawBody, signature) {
  if (!RZP_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac('sha256', RZP_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/**
 * Mark a payment as paid and put the ad live (or extend it if it's already live).
 * Idempotent: calling it twice for the same payment does nothing the second time.
 */
function confirmPayment(paymentId, { adminId = null, razorpayPaymentId = null, note = null } = {}) {
  return tx(() => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!pay) throw new Error('Payment not found');
    if (pay.status === 'paid') return { already: true, pay };
    const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(pay.ad_id);
    if (!ad) throw new Error('Ad not found');
    const now = Date.now();
    const dayMs = 86400_000;

    let startsAt, expiresAt, paidTotal, topSlots;
    if (ad.status === 'active' && ad.expires_at > now) {
      // Extension of a running ad: add days on top of the current expiry.
      startsAt = ad.starts_at;
      expiresAt = ad.expires_at + pay.days * dayMs;
      paidTotal = ad.paid_total_paise + pay.amount_paise;
      topSlots = (ad.top_slots || 0) | (pay.top_slots || 0);   // keep old TOP slots, add new ones
    } else {
      startsAt = now;
      expiresAt = now + pay.days * dayMs;
      paidTotal = pay.amount_paise;
      topSlots = pay.top_slots || 0;
    }

    db.prepare(`UPDATE payments SET status = 'paid', confirmed_by = ?, confirmed_at = ?,
                razorpay_payment_id = COALESCE(?, razorpay_payment_id), admin_note = COALESCE(?, admin_note) WHERE id = ?`)
      .run(adminId, now, razorpayPaymentId, note, pay.id);

    // Never re-activate an ad the admin has blocked; keep the payment recorded.
    if (ad.status !== 'blocked') {
      db.prepare(`UPDATE ads SET status = 'active', plan_id = ?, is_top = ?, top_slots = ?, paid_total_paise = ?,
                  starts_at = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
        .run(pay.plan_id, topSlots ? 1 : 0, topSlots, paidTotal, startsAt, expiresAt, now, ad.id);
      rescore(ad.id);
    }
    return { already: false, pay };
  });
}

function rejectPayment(paymentId, adminId, note) {
  return tx(() => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!pay || pay.status !== 'pending') return false;
    db.prepare("UPDATE payments SET status = 'rejected', confirmed_by = ?, confirmed_at = ?, admin_note = ? WHERE id = ?")
      .run(adminId, Date.now(), note || null, pay.id);
    // Money the seller put in from the wallet goes back to the wallet.
    if (pay.wallet_paise > 0) require('./wallet').credit(pay.client_id, pay.wallet_paise, 'refund', `Payment #${pay.id} was rejected — balance returned`, { adId: pay.ad_id, paymentId: pay.id });
    // Put the ad back to awaiting payment if no other payment is pending for it.
    const other = db.prepare("SELECT 1 FROM payments WHERE ad_id = ? AND status = 'pending' LIMIT 1").get(pay.ad_id);
    if (!other) db.prepare("UPDATE ads SET status = 'awaiting_payment', updated_at = ? WHERE id = ? AND status = 'payment_review'").run(Date.now(), pay.ad_id);
    return true;
  });
}

module.exports = {
  RZP_KEY_ID, razorpayEnabled, quote, listPrice, createRazorpayOrder,
  verifyCheckoutSignature, verifyWebhookSignature, confirmPayment, rejectPayment,
};
