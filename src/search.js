'use strict';
// Smart search: people type the way they talk ("mobile pune", "gadi", "iphnoe", "flat on rent").
// The search box understands:
//   - parts of words        "mob"       → mobile
//   - plurals / -ing        "cars"      → car,  "repairing" → repair
//   - typing mistakes       "iphnoe"    → iphone (words are compared with what live ads actually say)
//   - same-meaning words    "mobile"    → phone, smartphone … (also common Hinglish: gadi, naukri, ghar, kiraya)
//   - category names        "tuition"   → every ad in Education › Tuition, even if the ad never says "tuition"
//   - city names            "pune"      → city filter (old names too: Bombay, Bangalore, Gurgaon …)
// An ad shows if it matches ANY of the words. Ads that match ALL of the words come first; inside each group the
// normal order applies (TOP now → admin boost → amount paid → fair shuffle), so paying sellers stay on top.

const { db } = require('./db');

const STOP = new Set(`a an the in at on for of to and or with near nearby me my i want need needed looking look buy sell selling
sale new best good cheap low price prices rs inr under below above available from per all any some please urgent urgently
mein me ka ki ke ko chahiye wala wali wale hai hain se par aur`.split(/\s+/));

// Words that mean the same thing. Each line is one group; a search for any word also finds the others.
const GROUPS = `
mobile phone smartphone cellphone handset fone
laptop notebook macbook computer pc desktop
tv television
fridge refrigerator
ac aircon airconditioner cooler
washing washer washingmachine
car cars gadi gaadi sedan suv hatchback taxi
vehicle vehicles automobile
bike motorcycle motorbike scooter scooty moped
cycle bicycle
flat apartment bhk
house ghar makaan makan villa bungalow
rent rental kiraya lease tolet
pg hostel
plot land jamin zameen
shop dukaan dukan showroom
office workspace coworking
job jobs naukri vacancy vacancies hiring career opening
tuition tutor tutors teacher coaching classes class padhai
course training institute
repair repairing fix fixing servicing mechanic technician
plumber plumbing
electrician electrical wiring
carpenter carpentry
painter painting
cleaning cleaner housekeeping maid
cook chef tiffin
driver chauffeur
massage spa therapy wellness
salon parlour parlor beauty makeup bridal mehendi mehndi
gym fitness workout trainer
yoga meditation
wedding shaadi marriage
event events party birthday
catering caterer
photographer photography photoshoot
movers packers shifting relocation
dog dogs puppy puppies kutta
cat cats kitten billi
sofa couch
bed mattress
furniture
watch smartwatch
headphone headphones earphone earphones earbuds headset airpods
speaker speakers soundbar
camera dslr
shoes shoe footwear sneakers joota
dress kurti saree sari clothes clothing kapde
book books novel
toy toys
`.trim().split('\n').map((l) => l.trim().split(/\s+/));
const SYN = new Map();
for (const g of GROUPS) for (const w of g) SYN.set(w, [...new Set([...(SYN.get(w) || []), ...g])]);

// Old or other names of cities → the name ads use.
const CITY_ALIAS = { bombay: 'Mumbai', bangalore: 'Bengaluru', bengalore: 'Bengaluru', blr: 'Bengaluru', gurgaon: 'Gurugram', calcutta: 'Kolkata',
  madras: 'Chennai', poona: 'Pune', baroda: 'Vadodara', mysore: 'Mysuru', trivandrum: 'Thiruvananthapuram', cochin: 'Kochi', ncr: 'Delhi', 'new delhi': 'Delhi' };

// Brand names: a search for the plain word also finds these (not the other way round).
// Only brands that clearly belong to one kind of thing (Samsung or LG could be a phone, a TV or a fridge).
const BRANDS = {
  mobile: 'iphone oneplus redmi xiaomi vivo oppo realme pixel poco nokia motorola', phone: 'iphone oneplus redmi xiaomi vivo oppo realme pixel poco nokia motorola',
  laptop: 'macbook thinkpad dell lenovo asus acer', car: 'maruti swift hyundai creta nexon innova kia baleno', bike: 'activa splendor pulsar enfield bullet ktm yamaha',
  headphone: 'airpods boat jbl', watch: 'smartwatch', tv: 'led oled',
};
for (const k of Object.keys(BRANDS)) BRANDS[k] = BRANDS[k].split(' ');
// …and a brand also finds the plain kind of thing, a little lower ("iphone" → other phones after iPhones).
const KIND_OF = new Map();
for (const [k, list] of Object.entries(BRANDS)) for (const b of list) KIND_OF.set(b, [...new Set([...(KIND_OF.get(b) || []), k, ...(SYN.get(k) || [])])]);

// "cars" → car, "classes" → class, "repairing" → repair. Never cut a word below 4 letters ("hiring" stays hiring).
function stem(w) {
  if (w.length > 6 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 5 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim().split(' ').filter(Boolean);

/** Edit distance with swapped letters counted as one mistake ("iphnoe" → "iphone" = 1). Stops early above `max`. */
function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Words that live ads, categories and cities use — refreshed at most once a minute.
let cache = { at: 0 };
function vocab() {
  if (Date.now() - cache.at < 60_000) return cache;
  const freq = new Map();
  const add = (text, n = 1) => { for (const w of words(text)) if (w.length >= 3 && !/\d/.test(w)) freq.set(w, (freq.get(w) || 0) + n); };
  for (const r of db.prepare("SELECT title, city, locality FROM ads WHERE status = 'active' ORDER BY id DESC LIMIT 5000").all()) { add(r.title, 2); add(r.city); add(r.locality); }
  const cats = db.prepare('SELECT id, name, slug, parent_id FROM categories WHERE is_active = 1').all();
  for (const c of cats) add(c.name, 5);
  for (const g of GROUPS) for (const w of g) if (w.length >= 3 && !freq.has(w)) freq.set(w, 1);
  for (const list of Object.values(BRANDS)) for (const w of list) if (w.length >= 3 && !freq.has(w)) freq.set(w, 1);
  const cities = db.prepare("SELECT city, COUNT(*) n FROM ads WHERE status = 'active' GROUP BY city COLLATE NOCASE ORDER BY n DESC LIMIT 300").all();
  cache = { at: Date.now(), freq, list: [...freq.keys()], cats, cities: new Map(cities.map((c) => [c.city.toLowerCase(), c.city])) };
  return cache;
}
const resetCache = () => { cache = { at: 0 }; };
const known = (w, v) => v.freq.has(w) || SYN.has(w) || v.freq.has(stem(w)) || SYN.has(stem(w));

/** Closest known word for a mistyped one, or null. */
function correct(w, v = vocab()) {
  if (w.length < 4 || known(w, v) || /\d/.test(w)) return null;
  if (v.list.some((x) => x.startsWith(w))) return null; // still typing: "mobi" → mobile is fine as it is
  const max = w.length <= 5 ? 1 : 2;
  let best = null;
  for (const x of v.list) {
    if (Math.abs(x.length - w.length) > max) continue;
    const d = distance(w, x, max);
    if (d <= max && (!best || d < best.d || (d === best.d && v.freq.get(x) > v.freq.get(best.x)))) best = { x, d };
  }
  return best ? best.x : null;
}

/** Category ids whose name fits one of these terms (a main category brings its sub-categories). */
function categoryIds(terms, v = vocab()) {
  const ids = new Set();
  for (const c of v.cats) {
    const cw = words(`${c.name} ${String(c.slug).replace(/-/g, ' ')}`).map(stem);
    if (terms.some((t) => t.length >= 2 && cw.some((x) => x === t || (t.length >= 5 && x.startsWith(t))))) {
      ids.add(c.id);
      if (!c.parent_id) for (const s of v.cats) if (s.parent_id === c.id) ids.add(s.id);
    }
  }
  return [...ids];
}

/**
 * Turn what the person typed into search parts.
 * Returns { groups: [{ word, terms[], related[], prefix[], catIds[] }], city, corrections: [{ from, to }] }.
 * terms match whole words (and plurals; longer ones also as the start of a word); prefix terms match the start of any word;
 * related words and categories count as a match too, but rank below a match in the title.
 */
function parse(q, { cityGiven = false } = {}) {
  const v = vocab();
  let ws = words(q).slice(0, 8);
  let city = '';
  if (!cityGiven) {
    for (let i = 0; i < ws.length && !city; i++) {
      for (const len of [2, 1]) { // two-word city names first ("new delhi", "navi mumbai")
        if (i + len > ws.length) continue;
        const part = ws.slice(i, i + len).join(' ');
        const hit = CITY_ALIAS[part] || v.cities.get(part);
        if (hit) { city = hit; ws = [...ws.slice(0, i), ...ws.slice(i + len)]; break; }
      }
    }
  }
  const corrections = [];
  const groups = [];
  for (const raw of ws) {
    if (STOP.has(raw) && ws.length > 1) continue;
    let w = raw;
    const fix = correct(w, v);
    if (fix) { corrections.push({ from: raw, to: fix }); w = fix; }
    const base = stem(w);
    const terms = new Set([w, base]);
    for (const k of [w, base]) {
      for (const b of BRANDS[k] || []) terms.add(b);
      for (const s of SYN.get(k) || []) { terms.add(stem(s)); for (const b of BRANDS[s] || []) terms.add(b); }
    }
    const related = new Set();
    for (const t of terms) for (const k of KIND_OF.get(t) || []) if (!terms.has(stem(k))) related.add(stem(k));
    const prefix = !fix && !known(w, v) && w.length >= 2 && !/^\d+$/.test(w) ? [w] : [];
    groups.push({ word: raw, terms: [...terms].slice(0, 24), related: [...related].slice(0, 12), prefix,
      catIds: categoryIds([...terms, ...related], v) });
  }
  return { groups: groups.slice(0, 6), city, corrections };
}

// ---- Matching, done in JavaScript inside SQLite (search_score) so it can work on whole words ----
const termHit = (t, ws) => ws.some((x) => x === t || x === `${t}s` || x === `${t}es` || (t.length >= 5 && x.startsWith(t)));
const prefixHit = (p, ws) => ws.some((x) => x.startsWith(p));
const specCache = new Map();
function getSpec(json) {
  let s = specCache.get(json);
  if (!s) { s = JSON.parse(json); s.forEach((g) => { g.c = new Set(g.c); }); if (specCache.size > 200) specCache.clear(); specCache.set(json, s); }
  return s;
}
/**
 * 0 = no match. Otherwise higher is better:
 * 4 every word found in the title · 3 every word found (title, category, description or a related word)
 * 2 some words in the title · 1 some words found somewhere.
 */
function score(json, catId, title, rest) {
  const spec = getSpec(json);
  const sw = words(title); const ww = words(rest);
  let all = true; let any = false; let strongAll = true; let strongAny = false;
  for (const g of spec) {
    const strong = g.t.some((t) => termHit(t, sw)) || g.p.some((p) => prefixHit(p, sw));
    const hit = strong || g.c.has(catId) || g.t.some((t) => termHit(t, ww)) || g.p.some((p) => prefixHit(p, ww))
      || g.r.some((t) => termHit(t, sw) || termHit(t, ww));
    if (hit) any = true; else all = false;
    if (strong) strongAny = true; else strongAll = false;
  }
  if (!any) return 0;
  if (all) return strongAll ? 4 : 3;
  return strongAny ? 2 : 1;
}
db.function('search_score', { deterministic: true }, (json, catId, strong, weak) => score(String(json), Number(catId), strong, weak));

const STRONG = 'a.title';
const WEAK = "c.name || ' ' || COALESCE(pc.name, '') || ' ' || a.description || ' ' || COALESCE(a.locality, '')";

/**
 * SQL for the parsed search. `expr` (bind `args`) gives the match score 0–4 for an ad row; categories c / pc must be joined.
 */
function sql(parsed) {
  if (!parsed.groups.length) return null;
  const spec = JSON.stringify(parsed.groups.map((g) => ({ t: g.terms, r: g.related, p: g.prefix, c: g.catIds })));
  return { expr: `search_score(?, a.category_id, ${STRONG}, ${WEAK})`, args: [spec] };
}

/** What to show under the box while typing: categories, ad titles and cities. */
function suggest(q) {
  const raw = String(q || '').trim().slice(0, 60);
  if (raw.length < 2) return { cats: [], ads: [], cities: [] };
  const v = vocab();
  const parsed = parse(raw);
  const last = words(raw).pop() || '';
  // Categories: by name match or by the parsed category ids, with how many live ads each has.
  const catIds = new Set(parsed.groups.flatMap((g) => g.catIds));
  const lw = stem(last);
  for (const c of v.cats) if (words(c.name).some((x) => x.startsWith(lw))) catIds.add(c.id);
  const counts = new Map(db.prepare(`SELECT category_id id, COUNT(*) n FROM ads WHERE status = 'active' AND expires_at > ? GROUP BY category_id`).all(Date.now()).map((r) => [r.id, r.n]));
  const cats = v.cats.filter((c) => catIds.has(c.id)).map((c) => {
    const parent = c.parent_id ? v.cats.find((p) => p.id === c.parent_id) : null;
    const n = c.parent_id ? counts.get(c.id) || 0 : v.cats.filter((s) => s.id === c.id || s.parent_id === c.id).reduce((x, s) => x + (counts.get(s.id) || 0), 0);
    return { name: c.name, parent: parent ? parent.name : '', slug: c.slug, n };
  }).sort((x, y) => y.n - x.n).slice(0, 4);
  let ads = [];
  const m = sql(parsed);
  if (m || parsed.city) {
    ads = db.prepare(`SELECT a.id, a.title, a.city, ${m ? m.expr : '1'} AS sc FROM ads a JOIN categories c ON c.id = a.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
      WHERE a.status = 'active' AND a.expires_at > ? AND a.client_id IN (SELECT id FROM clients WHERE status = 'approved')
      ${parsed.city ? 'AND a.city = ? COLLATE NOCASE' : ''}
      ORDER BY sc DESC, a.admin_boost DESC, a.rank_score DESC LIMIT 40`)
      .all(...(m ? m.args : []), Date.now(), ...(parsed.city ? [parsed.city] : [])) // placeholders bind in text order
      .filter((r) => r.sc > 0).slice(0, 6)
      .map((r) => ({ id: r.id, title: r.title, city: r.city }));
  }
  const cities = [...v.cities.values()].filter((c) => c.toLowerCase().startsWith(last) && last.length >= 2).slice(0, 3);
  return { cats, ads, cities, city: parsed.city, corrections: parsed.corrections };
}

module.exports = { parse, sql, suggest, distance, stem, words, correct, resetCache, SYN };
