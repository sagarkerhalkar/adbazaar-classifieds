'use strict';
// Showcase bidding: the 3D ring at the top of the home page has a fixed number of places (25 by default)
// in every 3-hour time slot (India time, see src/slots.js).
//  • A seller bids for a day + slot with money from their balance. The money is held (not taken) while the bid is open.
//  • Bids can be raised, lowered (not below the minimum) or cancelled until the slot starts.
//  • When the slot starts, the highest bids win automatically (an earlier bid wins a tie). Winners pay what they bid;
//    everyone else keeps their money. Both get a message.
//  • The owner sets the number of places, the minimum bid per slot and how many days ahead people can bid,
//    and can remove any bid (a winning bid removed is refunded to the balance).

const { db, tx, getSettings } = require('./db');
const { SLOTS } = require('./slots');
const W = require('./wallet');
const { rupees } = require('./lib/html');

const SLOT_MS = 3 * 3600_000;
const IST = 5.5 * 3600_000;
const DAY = 86400_000;

function cfg(s = getSettings()) {
  let mins = [];
  try { mins = JSON.parse(s.showcase_min_paise || '[]'); } catch { mins = []; }
  return {
    on: s.showcase_on !== '0',
    places: Math.max(1, Math.min(60, parseInt(s.showcase_places, 10) || 25)),
    mins: SLOTS.map((x, i) => Math.max(100, parseInt(mins[i], 10) || 9900)),
    daysAhead: Math.max(1, Math.min(30, parseInt(s.showcase_days_ahead, 10) || 7)),
    fill: s.showcase_fill !== '0',
  };
}

// India date "YYYY-MM-DD" for a time, and the start time of a day + slot.
const istDay = (t = Date.now()) => new Date(t + IST).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(`${day}T00:00:00Z`) - IST;
const slotStart = (day, slot) => dayStart(day) + slot * SLOT_MS;
const roundAt = (t = Date.now()) => { const day = istDay(t); return { day, slot: Math.floor((t - dayStart(day)) / SLOT_MS) }; };
const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && Number.isFinite(dayStart(d));

/** Days a seller can bid for: today (only slots that have not started) and the next days. */
function biddableDays(now = Date.now(), c = cfg()) {
  const out = [];
  for (let i = 0; i <= c.daysAhead; i += 1) {
    const day = istDay(now + i * DAY);
    if (SLOTS.some((x) => slotStart(day, x.slot) > now)) out.push(day);
  }
  return [...new Set(out)];
}

/** Can this ad take part? (live, paid, not hidden, still running when the slot starts) */
function adProblem(ad, start) {
  if (!ad) return 'Ad not found';
  if (ad.is_free) return 'Free ads cannot bid. Upgrade the ad to a paid plan first.';
  if (ad.status !== 'active') return 'Only live ads can bid.';
  if (ad.flagged) return 'This ad is hidden from buyers.';
  if (start && !(ad.expires_at > start)) return 'The ad ends before this time slot. Extend it first.';
  return '';
}

/** Open bids for one round, best first. */
const openBids = (day, slot) => db.prepare(`SELECT * FROM showcase_bids WHERE day = ? AND slot = ? AND status = 'open'
  ORDER BY amount_paise DESC, amount_at ASC, id ASC`).all(day, slot);

/** The board for one day: for every slot, the minimum, how many bid, and what it takes to get in right now. */
function board(day, { clientId = 0, now = Date.now() } = {}) {
  const c = cfg();
  const rounds = new Map(db.prepare('SELECT * FROM showcase_rounds WHERE day = ?').all(day).map((r) => [r.slot, r]));
  return SLOTS.map((x) => {
    const start = slotStart(day, x.slot);
    const bids = db.prepare(`SELECT b.*, a.title AS ad_title FROM showcase_bids b JOIN ads a ON a.id = b.ad_id
      WHERE b.day = ? AND b.slot = ? AND b.status IN ('open','won') ORDER BY b.amount_paise DESC, b.amount_at ASC, b.id ASC`).all(day, x.slot);
    const closed = start <= now;
    const full = bids.length >= c.places;
    // to get in now you must beat the lowest bid that is currently inside the places
    const cutoff = full ? bids[c.places - 1].amount_paise : 0;
    const need = full ? cutoff + 100 : c.mins[x.slot];
    const mine = clientId ? bids.map((b, i) => ({ ...b, place: i + 1, inside: i < c.places })).filter((b) => b.client_id === clientId) : [];
    return { ...x, day, start, end: start + SLOT_MS, closed, live: closed && now < start + SLOT_MS, min: c.mins[x.slot], count: bids.length,
      placesLeft: Math.max(0, c.places - bids.length), cutoff, need, mine, round: rounds.get(x.slot) || null };
  });
}

/**
 * Place or change bids: one amount for each chosen slot of one day.
 * The extra money needed (new bids + raises) must be free in the balance; it is held, not taken.
 */
function placeBids(seller, adId, day, slots, amountPaise, now = Date.now()) {
  const c = cfg();
  if (!c.on) return { error: 'Showcase bidding is closed at the moment.' };
  if (!validDay(day) || !biddableDays(now, c).includes(day)) return { error: 'Choose a day from the list.' };
  slots = [...new Set([].concat(slots || []).map((v) => parseInt(v, 10)).filter((n) => n >= 0 && n <= 7))];
  if (!slots.length) return { error: 'Choose at least one time slot.' };
  amountPaise = Math.round(amountPaise);
  if (!(amountPaise > 0)) return { error: 'Enter your bid.' };
  const ad = db.prepare('SELECT * FROM ads WHERE id = ? AND client_id = ?').get(adId, seller.id);
  for (const sl of slots) {
    const start = slotStart(day, sl);
    if (start <= now) return { error: `${SLOTS[sl].label} has already started — bidding for it is closed.` };
    const p = adProblem(ad, start); if (p) return { error: p };
    if (amountPaise < c.mins[sl]) return { error: `The minimum bid for ${SLOTS[sl].label} is ${rupees(c.mins[sl])}.` };
  }
  return tx(() => {
    let extra = 0;
    const existing = slots.map((sl) => db.prepare("SELECT * FROM showcase_bids WHERE ad_id = ? AND day = ? AND slot = ?").get(ad.id, day, sl));
    existing.forEach((b) => { extra += amountPaise - (b && b.status === 'open' ? b.amount_paise : 0); });
    const free = W.available(seller.id);
    if (extra > free) return { error: `You need ${rupees(extra)} free in your balance for ${slots.length > 1 ? 'these bids' : 'this bid'}; you have ${rupees(free)}. Add money first.`, short: extra - free };
    slots.forEach((sl, i) => {
      const b = existing[i];
      if (b) db.prepare("UPDATE showcase_bids SET amount_paise = ?, status = 'open', note = NULL, place = NULL, amount_at = ?, updated_at = ? WHERE id = ?").run(amountPaise, now, now, b.id);
      else db.prepare(`INSERT INTO showcase_bids (ad_id, client_id, day, slot, amount_paise, status, amount_at, created_at, updated_at)
        VALUES (?,?,?,?,?, 'open', ?, ?, ?)`).run(ad.id, seller.id, day, sl, amountPaise, now, now, now);
    });
    return { ok: true, count: slots.length, held: extra };
  });
}

function cancelBid(clientId, bidId, now = Date.now()) {
  const b = db.prepare("SELECT * FROM showcase_bids WHERE id = ? AND client_id = ? AND status = 'open'").get(bidId, clientId);
  if (!b) return { error: 'Bid not found.' };
  if (slotStart(b.day, b.slot) <= now) return { error: 'This time slot has started — the bid can no longer be cancelled.' };
  db.prepare("UPDATE showcase_bids SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, b.id);
  return { ok: true };
}

/** Decide one round: the highest bids win and pay; the rest keep their money. Runs once per round. */
function settle(day, slot, now = Date.now()) {
  const notify = require('./notify');
  const c = cfg();
  const start = slotStart(day, slot);
  const late = now >= start + SLOT_MS;   // the app was off for the whole slot: nobody is charged
  const msgs = [];
  const result = tx(() => {
    if (db.prepare('SELECT 1 FROM showcase_rounds WHERE day = ? AND slot = ?').get(day, slot)) return null;
    let winners = 0; let earned = 0;
    for (const b of openBids(day, slot)) {
      const ad = db.prepare(`SELECT a.*, cl.status AS seller_status FROM ads a JOIN clients cl ON cl.id = a.client_id WHERE a.id = ?`).get(b.ad_id);
      let why = late ? 'The time slot passed without the showcase running' : adProblem(ad, start) || (ad.seller_status !== 'approved' ? 'Seller account not active' : '');
      if (!why && winners >= c.places) why = 'Outbid';
      if (!why) {
        // mark it won first (so its own hold is released), then take the money
        db.prepare("UPDATE showcase_bids SET status = 'won', place = ?, updated_at = ? WHERE id = ?").run(winners + 1, now, b.id);
        if (W.debit(b.client_id, b.amount_paise, `Showcase ${SLOTS[slot].label}, ${day} — "${ad.title}"`, { adId: ad.id })) {
          winners += 1; earned += b.amount_paise;
          msgs.push([b.client_id, { kind: 'showcase', tone: 'success', title: `You won a showcase place — ${SLOTS[slot].label}`, body: `"${ad.title}" is in the 3D ring at the top of the home page now (place ${winners} of ${c.places}). ${rupees(b.amount_paise)} was taken from your balance.`, link: '/client/showcase', linkText: 'Showcase' }]);
          continue;
        }
        why = 'Not enough balance when the slot started';
      }
      db.prepare("UPDATE showcase_bids SET status = 'lost', note = ?, updated_at = ? WHERE id = ?").run(why, now, b.id);
      msgs.push([b.client_id, { kind: 'showcase', tone: 'info', title: `Showcase bid not won — ${SLOTS[slot].label}, ${day}`, body: `${why}. Nothing was taken from your balance.${why === 'Outbid' ? ' Bid a little higher next time.' : ''}`, link: '/client/showcase', linkText: 'Bid again' }]);
    }
    db.prepare('INSERT INTO showcase_rounds (day, slot, settled_at, winners, earned_paise) VALUES (?,?,?,?,?)').run(day, slot, now, winners, earned);
    return { winners, earned };
  });
  for (const [id, m] of msgs) { try { notify.inbox(id, m); } catch { /* ignore */ } }
  return result;
}

/** Settle every round that has started (normally just the current one). Cheap when there is nothing to do. */
function settleDue(now = Date.now()) {
  const due = db.prepare(`SELECT DISTINCT day, slot FROM showcase_bids WHERE status = 'open'`).all()
    .filter((r) => slotStart(r.day, r.slot) <= now);
  const cur = roundAt(now);
  if (!due.some((r) => r.day === cur.day && r.slot === cur.slot)) due.push(cur);
  for (const r of due) settle(r.day, r.slot, now);
}

/** Ads that won the round running now, highest bid first. */
function winnersNow(now = Date.now()) {
  const { day, slot } = roundAt(now);
  return db.prepare("SELECT ad_id, amount_paise FROM showcase_bids WHERE day = ? AND slot = ? AND status = 'won' ORDER BY place ASC, amount_paise DESC").all(day, slot);
}

/** Owner / admin removes a bid. A bid that already won is refunded to the seller's balance. */
function adminRemove(bidId, note) {
  const notify = require('./notify');
  const b = db.prepare('SELECT b.*, a.title FROM showcase_bids b JOIN ads a ON a.id = b.ad_id WHERE b.id = ?').get(bidId);
  if (!b || !['open', 'won'].includes(b.status)) return null;
  tx(() => {
    db.prepare("UPDATE showcase_bids SET status = 'removed', note = ?, updated_at = ? WHERE id = ?").run(note || 'Removed by the admin', Date.now(), b.id);
    if (b.status === 'won') {
      W.credit(b.client_id, b.amount_paise, 'refund', `Showcase bid removed by the admin — "${b.title}"`, { adId: b.ad_id });
      db.prepare('UPDATE showcase_rounds SET earned_paise = MAX(0, earned_paise - ?), winners = MAX(0, winners - 1) WHERE day = ? AND slot = ?').run(b.amount_paise, b.day, b.slot);
    }
  });
  notify.inbox(b.client_id, { kind: 'showcase', tone: 'warn', title: 'A showcase bid was removed', body: `Your bid for "${b.title}" (${SLOTS[b.slot].label}, ${b.day}) was removed by the admin${note ? `: ${note}` : ''}.${b.status === 'won' ? ` ${rupees(b.amount_paise)} went back to your balance.` : ' Nothing was taken from your balance.'}`, link: '/client/showcase', linkText: 'Showcase' });
  return b;
}

const earnedSince = (t) => db.prepare('SELECT COALESCE(SUM(earned_paise), 0) s FROM showcase_rounds WHERE settled_at >= ?').get(t).s;

function start() {
  try { settleDue(); } catch (e) { console.error('[showcase]', e); }
  const t = setInterval(() => { try { settleDue(); } catch (e) { console.error('[showcase]', e); } }, 20_000);
  t.unref();
}

module.exports = { cfg, istDay, slotStart, roundAt, biddableDays, board, placeBids, cancelBid, settle, settleDue, winnersNow, adminRemove, earnedSince, adProblem, start, SLOT_MS };
