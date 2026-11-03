'use strict';
/**
 * Ranking — decides the order of ads on every listing page (see SORTS in routes/public.js).
 *
 *  1. TOP ads first: ads in a 3-hour TOP slot the seller bought, or pinned by the admin (src/slots.js).
 *  2. Admin boost (−10 … +10), for the rare manual nudge.
 *  3. Money paid for the current run: more money → higher. A yearly or monthly subscription pays more than
 *     a 7-day plan, so it ranks higher; a 1-day plan ranks lowest.
 *  4. Ads that paid the SAME amount are shuffled on every new visit (a fresh random order per visitor and page load),
 *     so nobody is always last in their price group.
 *
 * rank_score = rupees paid for the current run (a renewal or extension adds to it). −1 = not live.
 * When the paid period ends the ad is marked "expired" and disappears until the seller pays again.
 */

const { db } = require('./db');

function computeScore(ad, _priority, now = Date.now()) {
  if (ad.status !== 'active' || !ad.expires_at || ad.expires_at <= now) return -1;
  return Math.round(ad.paid_total_paise || 0) / 100;
}

const selectActive = db.prepare(`
  SELECT a.id, a.status, a.is_top, a.paid_total_paise, a.starts_at, a.expires_at, a.views, a.admin_boost,
         COALESCE(p.priority, 1) AS priority
  FROM ads a LEFT JOIN plans p ON p.id = a.plan_id WHERE a.id = ? OR (? = 0 AND a.status = 'active')`);
const updateScore = db.prepare('UPDATE ads SET rank_score = ? WHERE id = ?');

function rescore(adId = 0) {
  const now = Date.now();
  for (const ad of selectActive.all(adId, adId)) updateScore.run(computeScore(ad, ad.priority, now), ad.id);
}

// Expire finished ads and refresh every active ad's score.
function runMaintenance() {
  const now = Date.now();
  const ending = db.prepare("SELECT id, client_id, title FROM ads WHERE status = 'active' AND expires_at <= ?").all(now);
  const expired = db.prepare("UPDATE ads SET status = 'expired', is_top = 0, top_slots = 0, rank_score = -1, updated_at = ? WHERE status = 'active' AND expires_at <= ?").run(now, now);
  if (ending.length) { const { adExpired } = require('./notify'); ending.forEach(adExpired); }
  rescore(0);
  return { expired: Number(expired.changes) };
}

function startScheduler(intervalMs = 5 * 60_000) {
  runMaintenance();
  const t = setInterval(() => {
    try {
      const r = runMaintenance();
      if (r.expired) console.log(`[scheduler] expired ${r.expired} ad(s)`);
    } catch (e) { console.error('[scheduler]', e); }
  }, intervalMs);
  t.unref();
}

module.exports = { computeScore, rescore, runMaintenance, startScheduler };
