'use strict';
/**
 * Ranking algorithm — decides the order of ads on every listing page.
 *
 *  TOP ads are handled separately: during the 3-hour time slot(s) a client paid for,
 *  the ad is listed in the "TOP ads" section above everything else (see src/slots.js).
 *
 *  score = plan priority × weight   (29-day > 15-day > 7-day)
 *        + log(amount paid) × weight (more money paid → higher)
 *        + freshness                 (decays with a half-life, so ads slowly move down over time)
 *        + engagement                (log of views, small effect)
 *        + admin boost               (manual nudge from the admin panel)
 *        − ending-soon penalty       (last 24 h of the paid period)
 *
 * When the paid period ends the ad is marked "expired" and disappears from the site
 * until the client pays again (renew). All weights can be tuned below.
 */

const { db } = require('./db');

const WEIGHTS = {
  PLAN_PRIORITY: 60,
  PAID_AMOUNT: 40,          // × log10(1 + rupees paid)
  FRESHNESS: 100,
  FRESHNESS_HALF_LIFE_H: 72,
  ENGAGEMENT: 6,            // × log10(1 + views)
  ADMIN_BOOST: 10,          // × admin_boost (-10 … +10)
  ENDING_SOON_H: 24,
  ENDING_SOON_PENALTY: 30,
};

function computeScore(ad, planPriority, now = Date.now()) {
  if (ad.status !== 'active' || !ad.expires_at || ad.expires_at <= now) return -1;
  const W = WEIGHTS;
  const ageH = Math.max(0, (now - (ad.starts_at || now)) / 3600_000);
  const leftH = (ad.expires_at - now) / 3600_000;
  let score = 0;
  score += (planPriority || 1) * W.PLAN_PRIORITY;
  score += Math.log10(1 + (ad.paid_total_paise || 0) / 100) * W.PAID_AMOUNT;
  score += W.FRESHNESS * Math.pow(0.5, ageH / W.FRESHNESS_HALF_LIFE_H);
  score += Math.log10(1 + (ad.views || 0)) * W.ENGAGEMENT;
  score += Math.max(-10, Math.min(10, ad.admin_boost || 0)) * W.ADMIN_BOOST;
  if (leftH < W.ENDING_SOON_H) score -= W.ENDING_SOON_PENALTY;
  return Math.round(score * 100) / 100;
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
  const expired = db.prepare("UPDATE ads SET status = 'expired', is_top = 0, top_slots = 0, rank_score = -1, updated_at = ? WHERE status = 'active' AND expires_at <= ?").run(now, now);
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

module.exports = { WEIGHTS, computeScore, rescore, runMaintenance, startScheduler };
