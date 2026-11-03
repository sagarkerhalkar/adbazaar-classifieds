'use strict';
// Seller wallet: money kept for later.
//  + credit when a live ad is deleted (value of the unused paid days), a top-up is confirmed, or the admin adds money
//  − debit when the seller uses the balance to pay for an ad
// Every change is written to wallet_tx, so the history always adds up to the balance.

const { db, tx } = require('./db');

const DAY = 86400_000;
const balance = (clientId) => (db.prepare('SELECT wallet_paise FROM clients WHERE id = ?').get(clientId) || {}).wallet_paise || 0;

function credit(clientId, amount, kind, note, { adId = null, paymentId = null } = {}) {
  amount = Math.round(amount);
  if (!(amount > 0)) return 0;
  db.prepare('UPDATE clients SET wallet_paise = wallet_paise + ? WHERE id = ?').run(amount, clientId);
  db.prepare('INSERT INTO wallet_tx (client_id, amount_paise, kind, note, ad_id, payment_id, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(clientId, amount, kind, note || null, adId, paymentId, Date.now());
  return amount;
}

/** Take money from the wallet. Returns false (and changes nothing) if the balance is too low. */
function debit(clientId, amount, note, { adId = null, paymentId = null } = {}) {
  amount = Math.round(amount);
  if (!(amount > 0)) return true;
  const r = db.prepare('UPDATE clients SET wallet_paise = wallet_paise - ? WHERE id = ? AND wallet_paise >= ?').run(amount, clientId, amount);
  if (!r.changes) return false;
  db.prepare("INSERT INTO wallet_tx (client_id, amount_paise, kind, note, ad_id, payment_id, created_at) VALUES (?,?,'spent',?,?,?,?)")
    .run(clientId, -amount, note || null, adId, paymentId, Date.now());
  return true;
}

/** Value of the paid time an ad still has (pro-rata of what was paid for the current run). */
function unusedValue(ad, now = Date.now()) {
  if (!ad || !ad.paid_total_paise) return 0;
  let leftMs = 0;
  if (ad.status === 'active' && ad.expires_at > now) leftMs = ad.expires_at - now;
  else if (ad.status === 'paused') leftMs = Math.max(0, ad.paused_remaining_ms || 0);
  else return 0;
  const totalMs = Math.max(DAY, (ad.expires_at || now) - (ad.starts_at || now) + (ad.status === 'paused' ? leftMs : 0));
  return Math.max(0, Math.min(ad.paid_total_paise, Math.floor(ad.paid_total_paise * (leftMs / totalMs))));
}

/** Seller deletes an ad that still has paid time: the unused value goes to the wallet. */
function creditDeletedAd(ad) {
  const value = unusedValue(ad);
  if (!value) return 0;
  return tx(() => credit(ad.client_id, value, 'ad_deleted', `Unused days of "${ad.title}"`, { adId: ad.id }));
}

const history = (clientId, limit = 100) => db.prepare('SELECT * FROM wallet_tx WHERE client_id = ? ORDER BY id DESC LIMIT ?').all(clientId, limit);

module.exports = { balance, credit, debit, unusedValue, creditDeletedAd, history };
