'use strict';
// Free ads: a seller may publish an ad without paying. Free ads are shown AFTER every paid ad (in random order
// among themselves), never in TOP, and run for a limited number of days. The admin can switch this off, set the
// number of days, the number of free ads per seller, and whether each free ad is checked before it goes live.
// Paying later (Upgrade) turns a free ad into a normal paid ad.

const { db, tx, getSettings } = require('./db');
const { rescore } = require('./ranking');

const DAY = 86400_000;

function config(s = getSettings()) {
  return {
    enabled: s.free_ads !== '0',
    days: Math.max(1, Math.min(365, parseInt(s.free_ad_days, 10) || 15)),
    perSeller: Math.max(1, Math.min(50, parseInt(s.free_ads_per_seller, 10) || 2)),
    review: s.free_ads_review !== '0',
  };
}

/** Free ads this seller has live or waiting right now. */
const inUse = (clientId) => db.prepare("SELECT COUNT(*) n FROM ads WHERE client_id = ? AND is_free = 1 AND status IN ('active','free_review')").get(clientId).n;

/** Can this ad be published free? Returns null if yes, or the reason why not. */
function whyNot(ad, cfg = config()) {
  if (!cfg.enabled) return 'Free ads are switched off at the moment.';
  if (!['awaiting_payment', 'expired'].includes(ad.status)) return 'Only an unpaid or expired ad can be published free.';
  const n = inUse(ad.client_id);
  if (n >= cfg.perSeller) return `You already have ${n} free ad${n === 1 ? '' : 's'} (the limit is ${cfg.perSeller}). Pay for this ad, or wait until a free ad ends.`;
  return null;
}

/** Publish free: goes live at once, or waits for the admin's check. Returns 'live' | 'review'. */
function publish(ad, cfg = config()) {
  return tx(() => {
    const now = Date.now();
    if (cfg.review) {
      db.prepare("UPDATE ads SET status = 'free_review', is_free = 1, plan_id = NULL, top_slots = 0, is_top = 0, paid_total_paise = 0, updated_at = ? WHERE id = ?").run(now, ad.id);
      return 'review';
    }
    goLive(ad.id, cfg, now);
    return 'live';
  });
}

function goLive(adId, cfg = config(), now = Date.now()) {
  db.prepare(`UPDATE ads SET status = 'active', is_free = 1, plan_id = NULL, top_slots = 0, is_top = 0, paid_total_paise = 0,
    starts_at = ?, expires_at = ?, updated_at = ? WHERE id = ?`).run(now, now + cfg.days * DAY, now, adId);
  rescore(adId);
}

/** Admin approves a free ad that was waiting. */
function approve(adId) {
  const ad = db.prepare("SELECT * FROM ads WHERE id = ? AND status = 'free_review'").get(adId);
  if (!ad) return null;
  goLive(ad.id);
  return ad;
}

/** Admin turns a free ad down: it goes back to "awaiting payment" (the seller can still pay, or fix it). */
function reject(adId) {
  const ad = db.prepare("SELECT * FROM ads WHERE id = ? AND status = 'free_review'").get(adId);
  if (!ad) return null;
  db.prepare("UPDATE ads SET status = 'awaiting_payment', is_free = 0, updated_at = ? WHERE id = ?").run(Date.now(), ad.id);
  return ad;
}

module.exports = { config, inUse, whyNot, publish, approve, reject, DAY };
