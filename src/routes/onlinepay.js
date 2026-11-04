'use strict';
// Online payments (src/gateways.js): returning from PayPal / Stripe, Razorpay checks, online balance top-ups and webhooks.
// Everything paid online is confirmed automatically — no admin needed. Manual UPI still waits for the admin.

const { db } = require('../db');
const G = require('../gateways');
const V = require('../validators');
const notify = require('../notify');
const { rupees } = require('../lib/html');
const { requireClient } = require('./client');

/** This site's address as the buyer sees it (BASE_URL wins; otherwise the address of this request). */
function origin(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.secure ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

/** Start a PayPal order or Stripe Checkout session and return where to send the buyer. */
async function startRedirect(req, gw, { amountPaise, ref, description }) {
  const base = origin(req);
  if (gw === 'paypal') {
    return G.paypalOrder({ amountPaise, ref, description, brand: req.settings.site_name,
      returnUrl: `${base}/pay/paypal/return`, cancelUrl: `${base}/pay/paypal/cancel` });
  }
  return G.stripeSession({ amountPaise, ref, description, email: req.seller && req.seller.email,
    successUrl: `${base}/pay/stripe/return?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${base}/pay/stripe/cancel?ref=${encodeURIComponent(ref)}` });
}

const doneUrl = (found) => (found.kind === 'pay' ? '/client' : '/client/wallet');
const backUrl = (found) => (found.kind === 'pay' ? `/client/ads/${found.row.ad_id}/pay` : '/client/wallet');

function finish(found, { txn, charged }) {
  return found.kind === 'pay' ? G.finishAdPayment(found.row.id, { txn, charged }) : G.finishTopup(found.row.id, { txn, charged });
}
function successText(found) {
  return found.kind === 'pay' ? 'Payment successful — your ad is live!' : `Payment successful — ${rupees(found.row.amount_paise)} was added to your balance.`;
}

function register(app) {
  // ---------- PayPal: the buyer comes back with ?token=<order id> ----------
  app.get('/pay/paypal/return', async (req, res) => {
    const found = G.findByRef(V.str(req.query.token, 64));
    if (!found) { req.flash('error', 'Payment not found.'); res.redirect('/client'); return; }
    try {
      const cap = await G.paypalCapture(found.row.gateway_ref);
      if (!cap.completed) throw new Error('PayPal has not completed the payment');
      if (found.row.charged && cap.text && cap.text !== found.row.charged) throw new Error(`Amount mismatch (${cap.text})`);
      finish(found, { txn: cap.id, charged: cap.text });
      req.flash('success', successText(found));
      res.redirect(doneUrl(found));
    } catch (e) {
      console.error('[paypal] capture', e.message);
      G.markFailed(found, `PayPal: ${e.message}`.slice(0, 200));
      if (found.kind === 'pay') notify.paymentFailed(found.row.client_id, db.prepare('SELECT * FROM ads WHERE id = ?').get(found.row.ad_id), `The PayPal payment did not go through: ${e.message}.`);
      req.flash('error', `The PayPal payment did not go through: ${e.message}. Nothing was confirmed — please try again.`);
      res.redirect(backUrl(found));
    }
  });
  app.get('/pay/paypal/cancel', (req, res) => {
    const found = G.findByRef(V.str(req.query.token, 64));
    if (found) G.markFailed(found, 'Cancelled on PayPal');
    req.flash('info', 'Payment cancelled. Nothing was charged.');
    res.redirect(found ? backUrl(found) : '/client');
  });

  // ---------- Stripe: the buyer comes back with ?session_id=… ----------
  app.get('/pay/stripe/return', async (req, res) => {
    const found = G.findByRef(V.str(req.query.session_id, 120));
    if (!found) { req.flash('error', 'Payment not found.'); res.redirect('/client'); return; }
    try {
      const s = await G.stripeGet(found.row.gateway_ref);
      if (!s.paid) throw new Error('the card payment is not complete yet');
      if (found.row.charged && s.text !== found.row.charged) throw new Error(`Amount mismatch (${s.text})`);
      finish(found, { txn: s.id, charged: s.text });
      req.flash('success', successText(found));
      res.redirect(doneUrl(found));
    } catch (e) {
      console.error('[stripe] return', e.message);
      req.flash('error', `We could not confirm the card payment: ${e.message}. If money was taken, it is confirmed automatically within minutes.`);
      res.redirect(backUrl(found));
    }
  });
  app.get('/pay/stripe/cancel', (req, res) => {
    const ref = V.str(req.query.ref, 40);
    const m = /^(pay|top)_(\d+)$/.exec(ref);
    const row = m && db.prepare(`SELECT * FROM ${m[1] === 'pay' ? 'payments' : 'wallet_topups'} WHERE id = ?`).get(Number(m[2]));
    const found = row && row.gateway_ref ? G.findByRef(row.gateway_ref) : null;
    if (found) G.markFailed(found, 'Cancelled on the card page');
    req.flash('info', 'Payment cancelled. Nothing was charged.');
    res.redirect(found ? backUrl(found) : '/client');
  });

  // ---------- Razorpay (checkout window on our page) ----------
  app.post('/client/payments/razorpay/verify', requireClient, (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = req.body || {};
    const found = orderId && G.findByRef(String(orderId));
    if (!found || found.row.client_id !== req.seller.id || !G.razorpayCheckoutOk(String(orderId), String(paymentId || ''), String(sig || ''))) {
      res.status(400).json({ ok: false, error: 'Payment verification failed. If money was deducted, it is confirmed automatically within minutes, or contact support with your payment ID.' });
      return;
    }
    finish(found, { txn: String(paymentId), charged: `INR ${(found.row.amount_paise / 100).toFixed(2)}` });
    req.flash('success', successText(found));
    res.json({ ok: true, redirect: doneUrl(found) });
  });
  app.post('/client/payments/razorpay/failed', requireClient, (req, res) => {
    const found = G.findByRef(String((req.body || {}).order_id || ''));
    if (found && found.row.client_id === req.seller.id && found.row.status === 'created') {
      const why = V.str((req.body || {}).reason, 200) || 'Payment failed';
      G.markFailed(found, why);
      if (found.kind === 'pay') notify.paymentFailed(req.seller.id, db.prepare('SELECT * FROM ads WHERE id = ?').get(found.row.ad_id), `The online payment failed: ${why}.`);
    }
    res.json({ ok: true });
  });

  // ---------- Online balance top-ups (money added at once) ----------
  const readTopup = (req) => {
    const amount = Math.round(Number((req.body || {}).amount) * 100);
    if (!(amount >= 5000 && amount <= 10000000)) return { error: 'Enter an amount between ₹50 and ₹1,00,000.' };
    if ((req.body || {}).accept_terms !== '1') return { error: 'Please accept the payment terms.' };
    return { amount };
  };
  app.post('/client/wallet/topup/razorpay', requireClient, async (req, res) => {
    if (!G.enabled().razorpay) { res.status(400).json({ error: 'Online payments are not enabled.' }); return; }
    const t = readTopup(req); if (t.error) { res.status(400).json({ error: t.error }); return; }
    const id = Number(db.prepare("INSERT INTO wallet_topups (client_id, amount_paise, method, status, created_at) VALUES (?,?, 'razorpay', 'created', ?)").run(req.seller.id, t.amount, Date.now()).lastInsertRowid);
    try {
      const o = await G.razorpayOrder(t.amount, `top_${id}`, { topup_id: String(id) });
      db.prepare('UPDATE wallet_topups SET gateway_ref = ? WHERE id = ?').run(o.id, id);
      res.json({ key: G.conf().rzp.keyId, order_id: o.id, amount: t.amount, currency: 'INR', name: req.settings.site_name, description: 'Add money to balance',
        prefill: { name: req.seller.name, email: req.seller.email, contact: req.seller.phone } });
    } catch (e) {
      db.prepare("UPDATE wallet_topups SET status = 'rejected', admin_note = ? WHERE id = ?").run(String(e.message).slice(0, 200), id);
      res.status(502).json({ error: 'Could not start the payment. Please try again.' });
    }
  });
  for (const gw of ['paypal', 'stripe']) {
    app.post(`/client/wallet/topup/${gw}`, requireClient, async (req, res) => {
      if (!G.enabled()[gw]) { req.flash('error', 'This payment method is not available.'); res.redirect('/client/wallet'); return; }
      const t = readTopup(req); if (t.error) { req.flash('error', t.error); res.redirect('/client/wallet'); return; }
      const id = Number(db.prepare("INSERT INTO wallet_topups (client_id, amount_paise, method, status, created_at) VALUES (?,?,?, 'created', ?)").run(req.seller.id, t.amount, gw, Date.now()).lastInsertRowid);
      try {
        const o = await startRedirect(req, gw, { amountPaise: t.amount, ref: `top_${id}`, description: `${req.settings.site_name}: add ${rupees(t.amount)} to balance` });
        db.prepare('UPDATE wallet_topups SET gateway_ref = ?, charged = ? WHERE id = ?').run(o.id, o.charged, id);
        res.redirect(o.url);
      } catch (e) {
        console.error(`[${gw}] top-up start`, e.message);
        db.prepare("UPDATE wallet_topups SET status = 'rejected', admin_note = ? WHERE id = ?").run(String(e.message).slice(0, 200), id);
        req.flash('error', `Could not start the ${G.LABEL[gw]} payment: ${e.message}.`);
        res.redirect('/client/wallet');
      }
    });
  }

  // ---------- Webhooks: confirm even if the buyer closed the window before coming back ----------
  app.post('/webhooks/razorpay', (req, res) => {
    if (!G.razorpayWebhookOk(req.rawBody || Buffer.alloc(0), req.headers['x-razorpay-signature'])) { res.status(400).send('bad signature'); return; }
    const ev = req.body || {};
    const p = ev.payload?.payment?.entity;
    if ((ev.event === 'payment.captured' || ev.event === 'order.paid') && p?.order_id) {
      const found = G.findByRef(p.order_id);
      if (found && p.amount === found.row.amount_paise) finish(found, { txn: p.id, charged: `INR ${(p.amount / 100).toFixed(2)}` });
    }
    res.json({ ok: true });
  });
  app.post('/webhooks/stripe', (req, res) => {
    const ev = G.stripeWebhookEvent(req.rawBody || Buffer.alloc(0), req.headers['stripe-signature']);
    if (!ev) { res.status(400).send('bad signature'); return; }
    const sess = ev.data?.object;
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type) && sess?.payment_status === 'paid') {
      const found = G.findByRef(sess.id);
      const text = `${String(sess.currency || '').toUpperCase()} ${((sess.amount_total || 0) / 100).toFixed(2)}`;
      if (found && (!found.row.charged || found.row.charged === text)) finish(found, { txn: sess.payment_intent || sess.id, charged: text });
    }
    res.json({ received: true });
  });
}

module.exports = { register, startRedirect, origin };
