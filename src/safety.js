'use strict';
// Blocked words (Admin → Settings → Approvals → Blocked words).
// Ads and category names that offer sexual or adult services are not published:
//   - a seller cannot post or save an ad that contains a blocked word;
//   - a category whose name contains one is hidden from buyers and cannot be chosen for new ads;
//   - an existing ad that contains one (or sits in such a category) is hidden from buyers, and the admin sees why.
// The owner can edit the list; matching is by whole words, so "unisex salon" or "Sussex" do not match "sex".

const DEFAULT_WORDS = [
  'escort', 'escorts', 'escort service', 'call girl', 'call girls', 'callgirl', 'call boy', 'call boys', 'callboy', 'gigolo', 'playboy job', 'playboy service',
  'sex service', 'sex services', 'sexual service', 'sexual services', 'sex', 'sexy', 'erotic', 'nude', 'nudes', 'porn', 'xxx', 'nsfw',
  'happy ending', 'body to body', 'b2b massage', 'nuru', 'sensual massage', 'adult service', 'adult services', 'adult entertainment',
  'hookup', 'hookups', 'hook up', 'one night stand', 'prostitute', 'prostitutes', 'prostitution', 'girlfriend experience', 'gfe',
  'sugar daddy', 'sugar mommy', 'paid dating', 'dating for money', 'webcam show', 'striptease', 'full service massage',
  'bhabhi service', 'aunty service', 'housewife service', 'college girl service', 'female companion', 'male companion',
];

let cache = { at: 0, src: null, words: DEFAULT_WORDS, re: null };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function words() {
  const { getSettings } = require('./db');
  const raw = getSettings().blocked_words;
  if (cache.re && cache.src === raw) return cache;
  const list = raw == null || raw === '' ? DEFAULT_WORDS
    : String(raw).split(/[\n,]+/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2).slice(0, 500);
  // "call boy" also matches "call-boy", "call.boy", "callboy"
  const parts = list.map((w) => w.split(/\s+/).map(esc).join('[\\s._\\-]*'));
  cache = { src: raw, words: list, re: parts.length ? new RegExp(`(?:^|[^a-z0-9])(${parts.join('|')})(?=$|[^a-z0-9])`, 'i') : null };
  return cache;
}

/** The first blocked word found in these texts, or null. */
function match(...texts) {
  const { re } = words();
  if (!re) return null;
  const m = re.exec(texts.filter(Boolean).join(' \n ').toLowerCase());
  return m ? m[1] : null;
}

/** Mark categories and ads that contain a blocked word (they are hidden from buyers). Returns counts. */
function recheck() {
  const { db, tx } = require('./db');
  return tx(() => {
    const cats = db.prepare('SELECT id, name, parent_id FROM categories').all();
    const flaggedCat = new Set();
    for (const c of cats) if (match(c.name)) flaggedCat.add(c.id);
    for (const c of cats) if (c.parent_id && flaggedCat.has(c.parent_id)) flaggedCat.add(c.id); // sub-categories of a hidden main category
    const setCat = db.prepare('UPDATE categories SET flagged = ? WHERE id = ?');
    for (const c of cats) setCat.run(flaggedCat.has(c.id) ? 1 : 0, c.id);
    const ads = db.prepare("SELECT id, title, description, price_note, category_id FROM ads WHERE status != 'deleted'").all();
    const setAd = db.prepare('UPDATE ads SET flagged = ? WHERE id = ?');
    let n = 0;
    for (const a of ads) { const f = flaggedCat.has(a.category_id) || !!match(a.title, a.description, a.price_note); if (f) n += 1; setAd.run(f ? 1 : 0, a.id); }
    return { categories: flaggedCat.size, ads: n };
  });
}

/** Why this ad or category is hidden ("call boy"), for the admin. */
const reason = (...texts) => match(...texts);

module.exports = { DEFAULT_WORDS, words, match, recheck, reason };
