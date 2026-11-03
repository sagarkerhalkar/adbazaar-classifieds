'use strict';
// Public site: anyone can browse live ads without logging in.

const path = require('node:path');
const { db, parseImages, parseVideos, getSettings } = require('../db');
const { currentSlot, SLOTS } = require('../slots');
const Cat = require('../categories');
const { html, raw, fmtDate, timeAgo, approveTimeText, PAYMENT_TIME_TEXT } = require('../lib/html');
const { icon } = require('../views/icons');
const Sp = require('./sponsors');
const { getHome, cityList } = require('../homeconfig');
const Ph = require('../photos');
const Search = require('../search');
const { renderPage } = require('../views/layout');
const { csrf, adCard, adUrl, imgUrl, priceText, pager, cityDatalist } = require('../views/components');
const { DIRS, sendFile, safeName } = require('../lib/files');
const { str, normalizePhone } = require('../validators');
const { rateLimit } = require('../lib/security');

const PAGE_SIZE = 24;

// Category columns for ad queries: sub-category name + main category (icon comes from the main category).
const CAT_COLS = `COALESCE(pc.name || ' › ' || c.name, c.name) AS cat_name, COALESCE(pc.icon, c.icon) AS cat_icon,
  COALESCE(pc.slug, c.slug) AS main_slug, COALESCE(pc.name, c.name) AS main_name, c.slug AS cat_slug, c.name AS sub_name`;
const CAT_JOIN = 'JOIN categories c ON c.id = a.category_id LEFT JOIN categories pc ON pc.id = c.parent_id';
// Hide ads whose seller is no longer active (deactivated / blocked / deleted).
const SELLER_OK = "a.client_id IN (SELECT id FROM clients WHERE status = 'approved')";

// An ad is TOP right now if the seller bought the current 3-hour slot, or the admin pinned it (until a date, in chosen slots).
// Only integers are put into this SQL.
function TOP_NOW(slot = currentSlot(), now = Date.now()) {
  const sl = Number(slot) | 0; const t = Math.floor(Number(now));
  return `((((a.top_slots >> ${sl}) & 1) = 1) OR (COALESCE(a.admin_top_until, 0) > ${t} AND ((a.admin_top_slots >> ${sl}) & 1) = 1))`;
}
// Ranking (see src/ranking.js): TOP first, then admin boost, then the amount paid for the current run (more money = higher).
// Ads that paid the same amount are shuffled on every new visit, so everyone in a price group gets a fair turn at the top.
const SHUFFLE = (seed) => `((a.id * 2654435761 + ${Number(seed) | 0}) % 1000003)`;
const SORTS = {
  best: 'top_now DESC, a.admin_boost DESC, a.rank_score DESC, SHUFFLE',
  new: 'top_now DESC, a.starts_at DESC',
  price_asc: 'top_now DESC, (a.price_paise IS NULL OR a.price_paise = 0), a.price_paise ASC, a.rank_score DESC',
  price_desc: 'top_now DESC, a.price_paise IS NULL, a.price_paise DESC, a.rank_score DESC',
};

function listAds({ q, city, cat, kind, page, sort, excludeTop = false, seed = 0 }) {
  const where = ["a.status = 'active'", 'a.expires_at > ?', SELLER_OK];
  const args = [Date.now()];
  // Smart search (src/search.js): parts of words, typos, same-meaning words, category and city names.
  let parsed = null; let match = null;
  if (q) {
    parsed = Search.parse(q, { cityGiven: !!city });
    if (parsed.city) city = parsed.city;
    match = Search.sql(parsed);
    if (match) { where.push(`${match.expr} > 0`); args.push(...match.args); }
  }
  if (city) { where.push('a.city = ? COLLATE NOCASE'); args.push(city); }
  if (cat) {
    const ids = Cat.idsForSlug(cat);
    where.push(`a.category_id IN (${ids.map(() => '?').join(',') || 'NULL'})`);
    args.push(...ids);
  }
  if (kind === 'product' || kind === 'service') { where.push('a.kind = ?'); args.push(kind); }
  if (excludeTop) where.push(`NOT ${TOP_NOW()}`);
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ads a ${CAT_JOIN} WHERE ${w}`).get(...args).n;
  // Ads that bought the CURRENT 3-hour slot always come first (TOP), then the chosen order.
  const slot = currentSlot();
  let order = (SORTS[sort] || SORTS.best).replace('SHUFFLE', SHUFFLE(seed));
  // With a search: TOP first, then how well the ad matches (all words in the title → some words in the text),
  // then the normal paid order inside each group.
  if (match) order = order.replace(/^top_now DESC/, 'top_now DESC, match_score DESC');
  const rows = db.prepare(`SELECT a.*, ${CAT_COLS}, ${TOP_NOW(slot)} AS top_now, ${match ? match.expr : '0'} AS match_score
    FROM ads a ${CAT_JOIN} WHERE ${w}
    ORDER BY ${order} LIMIT ? OFFSET ?`).all(...(match ? match.args : []), ...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  rows.forEach((r) => { r.is_top = r.top_now; });
  return { rows, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), slot, city, search: parsed };
}

// Each banner shows its uploaded picture, or one of the built-in photos (public/photos).
const slidePic = (x, i) => (x.image ? imgUrl(x.image) : Ph.photoUrl(x.photo && Ph.exists(x.photo) ? x.photo : Ph.BANNER_DEFAULTS[i % Ph.BANNER_DEFAULTS.length]));

function bannerSlider(slides) {
  const list = slides.filter((x) => x.active && (x.title || x.image));
  if (!list.length) return '';
  return html`<section class="banner" data-banner aria-roledescription="carousel" aria-label="Highlights">
    <div class="banner-track">
      ${list.map((x, i) => html`<div class="slide theme-${x.theme} has-img ${i === 0 ? 'active' : ''}" data-slide role="group" aria-label="${i + 1} of ${list.length}">
        <img class="slide-img" src="${slidePic(x, i)}" alt="" ${i ? raw('loading="lazy"') : raw('fetchpriority="high"')}>
        <div class="slide-text">
          ${x.title ? html`<h2>${x.title}</h2>` : ''}
          ${x.subtitle ? html`<p>${x.subtitle}</p>` : ''}
          ${x.button && x.link ? html`<a class="btn btn-lg btn-sell" href="${x.link}">${x.button}</a>` : ''}
        </div>
      </div>`)}
    </div>
    ${list.length > 1 ? html`
      <button type="button" class="banner-nav prev" data-banner-prev aria-label="Previous">${icon('chevronLeft')}</button>
      <button type="button" class="banner-nav next" data-banner-next aria-label="Next">${icon('chevron')}</button>
      <div class="banner-dots">${list.map((_, i) => html`<button type="button" class="${i === 0 ? 'active' : ''}" data-banner-dot="${i}" aria-label="Show ${i + 1}"></button>`)}</div>` : ''}
  </section>`;
}

/** Photo for a category tile: the admin's own upload, or a built-in photo that fits the name. */
const catPic = (c) => (c.image ? imgUrl(c.image) : Ph.photoUrl(Ph.categoryPhotoName(c)));

function loadMore(filters, data) {
  if (filters.page >= data.totalPages) return '';
  const p = new URLSearchParams();
  for (const k of ['q', 'city', 'cat', 'kind', 'sort']) if (filters[k] && !(k === 'sort' && filters[k] === 'best')) p.set(k, filters[k]);
  p.set('page', filters.page + 1);
  return html`<div class="loadmore" data-loadmore><a class="btn btn-lg" href="/?${p}" data-load-more>Load more ads</a><span class="muted small">Showing ${Math.min(filters.page * PAGE_SIZE, data.total)} of ${data.total}</span></div>`;
}

function homeLanding(req, { cats, data, filters, cities, tops, home }) {
  const site = req.settings.site_name;
  const popular = cityList(home);
  const counts = Object.fromEntries(cities.map((c) => [c.city.toLowerCase(), c.n]));
  return html`
  ${bannerSlider(home.slides)}

  ${home.show.categories ? html`<section class="section">
    <div class="section-head"><h2>Browse categories</h2></div>
    <div class="cattiles">${cats.map((c) => html`<a class="cattile" href="/?cat=${c.slug}"><img src="${catPic(c)}" alt="" loading="lazy"><span>${c.name}</span></a>`)}</div>
  </section>` : ''}

  ${home.show.top && tops.length ? html`<section class="section topstrip" data-scroller>
    <div class="section-head"><h2><span class="star">★</span> ${home.top_title}</h2>
      <div class="btn-row" style="margin:0;align-items:center"><span class="muted small">Featured now · ${SLOTS[data.slot].label}</span>
      <button type="button" class="round-btn" data-scroll-prev aria-label="Scroll left">${icon('chevronLeft', { size: 18 })}</button><button type="button" class="round-btn" data-scroll-next aria-label="Scroll right">${icon('chevron', { size: 18 })}</button></div></div>
    <div class="hscroll" data-scroll-track>${tops.map(adCard)}</div>
  </section>` : ''}

  ${home.show.cities && popular.length ? html`<section class="section">
    <div class="section-head"><h2>Popular cities</h2></div>
    <div class="citychips">${popular.map((c) => html`<a class="citychip" href="/?city=${encodeURIComponent(c)}">${icon('pin', { size: 15 })}${c}${counts[c.toLowerCase()] ? html`<span>${counts[c.toLowerCase()]}</span>` : ''}</a>`)}</div>
  </section>` : ''}

  <section class="section" data-results>
    <div class="section-head"><h2>${home.fresh_title}</h2><span class="muted small">${data.total} ad${data.total === 1 ? '' : 's'}</span></div>
    ${data.rows.length ? html`<div class="grid">${Sp.weave(data.rows.map(adCard))}</div>` : html`
      <div class="empty card center"><h3>No ads yet</h3><p class="muted">Be the first to post in your city.</p><a class="btn btn-sell" href="/post">Post your ad</a></div>`}
    ${loadMore(filters, data)}
  </section>

  ${Sp.card(Sp.pick('home'), 'wide')}
  ${home.show.sell ? html`<section class="sellband">
    <img class="sell-photo" src="${Ph.photoUrl('people-man-cafe')}" alt="" loading="lazy">
    <div><h2>${home.sell_title}</h2><p>${home.sell_text}</p>
      <p class="small sell-time">${icon('clock', { size: 15 })} Login check takes ${approveTimeText(req.settings.auto_approve_minutes)} · payment confirmation ${PAYMENT_TIME_TEXT}</p></div>
    <a class="btn btn-sell btn-lg" href="/post">${icon('plus', { size: 18 })} Post your ad</a>
  </section>` : ''}`;
}

// "· showing results for iphone (you typed iphnoe) · in Pune" — tells people how the search read their words.
function searchNote(data, filters) {
  const s = data.search;
  if (!s) return '';
  const parts = [];
  if (s.corrections.length) parts.push(html`including <strong>${s.corrections.map((c) => c.to).join(' ')}</strong> (you typed ${s.corrections.map((c) => c.from).join(' ')})`);
  if (s.city && !filters.city) parts.push(html`in <strong>${s.city}</strong>`);
  return parts.length ? html` · ${parts.map((p, i) => html`${i ? ' · ' : ''}${p}`)}` : '';
}

function homeResults(req, { cats, data, filters, cities }) {
  // cats = main categories with .subs. The selected slug may be a main or a sub category.
  const sel = Cat.bySlug(filters.cat);
  const activeMain = sel ? cats.find((m) => m.id === (sel.parent_id || sel.id)) : null;
  const activeSub = sel && sel.parent_id ? sel : null;
  const base = { q: filters.q, city: filters.city, kind: filters.kind, cat: filters.cat, sort: filters.sort };
  const q = (extra) => {
    const p = new URLSearchParams();
    Object.entries({ ...base, ...extra }).forEach(([k, v]) => { if (v && !(k === 'sort' && v === 'best')) p.set(k, v); });
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };
  const heading = filters.q ? `Results for “${filters.q}”` : activeSub ? activeSub.name : activeMain ? activeMain.name : filters.city ? `Ads in ${filters.city}` : 'All ads';
  return html`
  <nav class="crumbs"><a href="/">Home</a>${activeMain ? html` › <a href="${q({ cat: activeMain.slug, page: '' })}">${activeMain.name}</a>` : ''}${activeSub ? html` › <span>${activeSub.name}</span>` : ''}${filters.city ? html` › <span>${filters.city}</span>` : ''}</nav>
  ${activeMain && activeMain.subs.length ? html`<div class="subcats">
    <a class="chip ${!activeSub ? 'active' : ''}" href="${q({ cat: activeMain.slug, page: '' })}">All ${activeMain.name}</a>
    ${activeMain.subs.map((sc) => html`<a class="chip ${activeSub && activeSub.id === sc.id ? 'active' : ''}" href="${q({ cat: sc.slug, page: '' })}">${sc.name}</a>`)}
  </div>` : ''}
  <div class="listing">
    <aside class="filters" data-filters>
      <div class="f-group"><h3>Categories</h3>
        <a class="f-opt ${!filters.cat ? 'active' : ''}" href="${q({ cat: '', page: '' })}">All categories</a>
        ${cats.map((c) => html`<a class="f-opt ${activeMain && activeMain.id === c.id ? 'active' : ''}" href="${q({ cat: c.slug, page: '' })}">${c.name}</a>`)}
      </div>
      <div class="f-group"><h3>Type</h3>
        ${[['', 'Everything'], ['product', 'Products'], ['service', 'Services']].map(([k, l]) => html`<a class="f-opt ${filters.kind === k ? 'active' : ''}" href="${q({ kind: k, page: '' })}">${l}</a>`)}
      </div>
      ${cities.length ? html`<div class="f-group"><h3>City</h3>
        <a class="f-opt ${!filters.city ? 'active' : ''}" href="${q({ city: '', page: '' })}">All cities</a>
        ${cities.slice(0, 10).map((c) => html`<a class="f-opt ${c.city.toLowerCase() === filters.city.toLowerCase() ? 'active' : ''}" href="${q({ city: c.city, page: '' })}">${c.city} <span class="muted small" style="margin-left:auto">${c.n}</span></a>`)}
      </div>` : ''}
    </aside>
    <section data-results>
      <div class="sortbar">
        <div><h1 class="results-h">${heading}</h1><span class="muted small">${data.total} ad${data.total === 1 ? '' : 's'}${searchNote(data, filters)}</span></div>
        <div class="btn-row" style="margin:0">
          <button type="button" class="btn btn-sm only-filters" data-toggle-filters>${icon('layers', { size: 16 })} Filters</button>
          <form method="get" action="/" class="inline">
            ${Object.entries(base).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
            <select name="sort" aria-label="Sort" data-autosubmit style="padding:7px 10px">
              ${[['best', 'Best match'], ['new', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']].map(([k, l]) => html`<option value="${k}" ${filters.sort === k ? 'selected' : ''}>${l}</option>`)}
            </select>
          </form>
        </div>
      </div>
      ${data.rows.length ? html`<div class="grid">${Sp.weave(data.rows.map(adCard))}</div>` : html`
        <div class="empty card center">
          <div class="empty-icon">${icon('search', { size: 26 })}</div>
          <h3>No ads match this search</h3>
          ${(filters.city || data.city) && data.search && data.search.groups.length ? html`<p><a class="btn" href="${q({ q: data.search.groups.map((g) => g.word).join(' '), city: '', page: '' })}">Show “${data.search.groups.map((g) => g.word).join(' ')}” in all cities</a></p>` : ''}
          <p class="muted">Try a shorter word, another city, or one of these categories.</p>
          <div class="subcats" style="justify-content:center">${cats.slice(0, 8).map((c) => html`<a class="chip" href="/?cat=${encodeURIComponent(c.slug)}">${c.name}</a>`)}</div>
          <a class="btn btn-primary" href="/">Show all ads</a>
        </div>`}
      ${loadMore(filters, data)}
    </section>
  </div>`;
}

// Saved ads: ids come from the visitor's browser (localStorage), nothing is stored on the server.
function savedView(ads) {
  return html`
  <div class="page-head"><div><h1>Saved ads</h1><p class="muted">Ads you saved with the ♥ button. They are kept in this browser only.</p></div></div>
  ${ads.length ? html`<div class="grid">${ads.map(adCard)}</div>` : html`<div class="empty card center"><div class="empty-icon">${icon('heart', { size: 26 })}</div><h3>No saved ads yet</h3><p class="muted">Tap the heart on any ad to keep it here.</p><a class="btn btn-primary" href="/">Browse ads</a></div>`}`;
}

function adView(req, { ad, images, videos = [], related }) {
  const wa = ad.whatsapp ? normalizePhone(ad.whatsapp) : '';
  const waText = encodeURIComponent(`Hi, I saw your ad "${ad.title}" on ${req.settings.site_name}.`);
  const place = `${ad.locality ? `${ad.locality}, ` : ''}${ad.city}`;
  return html`
  <nav class="crumbs"><a href="/">Home</a> › <a href="/?cat=${ad.main_slug}">${ad.main_name}</a>${ad.main_slug !== ad.cat_slug ? html` › <a href="/?cat=${ad.cat_slug}">${ad.sub_name}</a>` : ''} › <span>${ad.title}</span></nav>
  <div class="ad-page">
    <div class="ad-main">
      <div class="gallery" data-gallery>
        ${images.length ? html`
          <div class="gallery-main"><img src="${imgUrl(images[0])}" alt="${ad.title}" data-gallery-main></div>
          ${images.length > 1 ? html`<div class="gallery-thumbs">${images.map((f, i) => html`<button type="button" class="${i === 0 ? 'active' : ''}" data-gallery-thumb="${imgUrl(f)}" aria-label="Photo ${i + 1}"><img src="${imgUrl(f)}" alt=""></button>`)}</div>` : ''}`
        : html`<div class="gallery-main ph"><img src="${Ph.photoUrl(Ph.categoryPhotoName({ name: ad.main_name, slug: ad.main_slug }))}" alt=""><span class="ph-note">The seller has not added photos yet</span></div>`}
      </div>
      <section class="card" data-tab-scope>
        <div class="tabs" data-tabs role="tablist">
          <button type="button" class="tab active" data-tab="about" role="tab">${icon('list', { size: 16 })} Description</button>
          ${videos.length ? html`<button type="button" class="tab" data-tab="videos" role="tab">${icon('video', { size: 16 })} Videos <span class="pill pill-muted">${videos.length}</span></button>` : ''}
          <button type="button" class="tab" data-tab="details" role="tab">${icon('tag', { size: 16 })} Details</button>
          <button type="button" class="tab" data-tab="safety" role="tab">${icon('shield', { size: 16 })} Safety</button>
        </div>
        <div class="tab-panel" data-panel="about"><div class="desc">${String(ad.description).split(/\n+/).map((p) => html`<p>${p}</p>`)}</div></div>
        ${videos.length ? html`<div class="tab-panel" data-panel="videos"><div class="videos">${videos.map((v) => html`<video controls playsinline preload="metadata" src="/media/ads/${v.file}"></video>`)}</div></div>` : ''}
        <div class="tab-panel" data-panel="details">
          <dl class="facts">
            <div><dt>Type</dt><dd>${ad.kind === 'service' ? 'Service' : 'Product'}</dd></div>
            <div><dt>Category</dt><dd>${ad.cat_name}</dd></div>
            <div><dt>Location</dt><dd>${place}</dd></div>
            <div><dt>Posted</dt><dd>${fmtDate(ad.starts_at)}</dd></div>
            <div><dt>Ad ID</dt><dd>#${ad.id}</dd></div>
            <div><dt>Views</dt><dd>${ad.views}</dd></div>
          </dl>
        </div>
        <div class="tab-panel safety" data-panel="safety">
          <ul><li>Meet in a busy public place.</li><li>Check the item or service before you pay.</li><li>Never share an OTP or UPI PIN, and never pay strangers in advance.</li></ul>
          <p class="small muted">This ad was posted by the advertiser under their own responsibility. ${req.settings.site_name} does not check, guarantee or take part in any deal and is not responsible for any loss or fraud. If you are cheated, call <strong>1930</strong> or report at cybercrime.gov.in. <a href="/terms#fraud">Terms</a></p>
          <details class="report">
            <summary>${icon('flag', { size: 14 })} Report this ad</summary>
            <form method="post" action="/ad/${ad.id}/report">
              ${csrf(req)}
              <select name="reason" required>
                <option value="">Choose a reason</option>
                <option>Fraud / scam</option><option>Wrong category</option><option>Prohibited item or service</option>
                <option>Sold / no longer available</option><option>Offensive content</option><option>Other</option>
              </select>
              <textarea name="details" rows="2" maxlength="500" placeholder="Details (optional)"></textarea>
              <button class="btn btn-sm">Send report</button>
            </form>
          </details>
        </div>
      </section>
    </div>
    <aside class="ad-side">
      <div class="card sticky buybox">
        ${ad.is_top ? html`<span class="top-badge static">★ TOP AD</span>` : ''}
        <span class="kind kind-${ad.kind}">${ad.kind === 'service' ? 'Service' : 'Product'}</span>
        <h1 class="ad-h1">${ad.title}</h1>
        <div class="big-price">${priceText(ad)}</div>
        <p class="muted small">${icon('pin', { size: 14 })} ${place} · ${timeAgo(ad.starts_at)} · ${icon('eye', { size: 14 })} ${ad.views}</p>
        <div class="seller">
          <div class="avatar">${(ad.business_name || ad.seller_name || '?').slice(0, 1).toUpperCase()}</div>
          <div><strong>${ad.business_name || ad.seller_name}</strong><div class="verified small">${icon('star', { size: 14 })} Trusted seller</div></div>
        </div>
        <a class="btn btn-primary btn-lg btn-block" href="tel:+91${normalizePhone(ad.contact_phone)}" data-reveal-phone="+91 ${normalizePhone(ad.contact_phone)}">${icon('phone', { size: 18 })} Show phone number</a>
        ${wa ? html`<a class="btn btn-wa btn-lg btn-block" target="_blank" rel="noopener" href="https://wa.me/91${wa}?text=${waText}">${icon('chat', { size: 18 })} Chat on WhatsApp</a>` : ''}
        <p class="hint center" style="margin:6px 0 0">Mention ${req.settings.site_name} when you call.</p>
      </div>
    </aside>
  </div>
  ${Sp.card(Sp.pick('ad_page'), 'wide')}
  ${related.length ? html`<section class="section"><div class="section-head"><h2>Similar ads</h2><a class="small" href="/?cat=${ad.cat_slug}">See all</a></div><div class="grid">${related.map(adCard)}</div></section>` : ''}`;
}

// Too many complaints about one ad from different people → the ad is removed and the seller is blocked from posting.
function complaintCheck(adId, reason) {
  const notify = require('../notify');
  const life = require('../lifecycle');
  const ad = db.prepare('SELECT a.*, c.name AS seller_name, c.status AS seller_status FROM ads a JOIN clients c ON c.id = a.client_id WHERE a.id = ?').get(adId);
  if (!ad) return;
  const people = db.prepare('SELECT COUNT(DISTINCT reporter_ip) n FROM reports WHERE ad_id = ?').get(adId).n;
  const limit = Number(getSettings().complaint_block_threshold) || 0;
  notify.adminAlert('complaint', `⚑ Complaint about "${ad.title}" (${reason}) — ${people} complaint(s) from different people`);
  if (!limit || people < limit || ad.seller_status === 'suspended') return;
  const why = `Blocked automatically: the ad "${ad.title}" got complaints from ${people} different people.`;
  db.prepare("UPDATE ads SET status = 'blocked', block_reason = ?, rank_score = -1, updated_at = ? WHERE id = ?").run(why, Date.now(), ad.id);
  if (life.blockClient(ad.client_id, why)) {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(ad.client_id);
    notify.suspended(c, why);
    notify.adminAlert('complaint', `⛔ ${ad.seller_name} was blocked automatically — "${ad.title}" got complaints from ${people} different people.`);
  }
}

function register(app) {
  app.get('/', (req, res) => {
    const filters = {
      q: str(req.query.q, 80), city: str(req.query.city, 60), cat: str(req.query.cat, 60),
      kind: str(req.query.kind, 10), page: Math.max(1, Math.min(500, parseInt(req.query.page, 10) || 1)),
      sort: SORTS[req.query.sort] ? req.query.sort : 'best',
    };
    // New shuffle for equal-paying ads on every fresh visit; "Load more" pages keep the same order.
    if (filters.page === 1 || !req.session.shuffle) req.session.shuffle = Math.floor(Math.random() * 1_000_000);
    filters.seed = req.session.shuffle;
    const cats = Cat.tree();
    const data = listAds(filters);
    const cities = db.prepare(`SELECT city, COUNT(*) AS n FROM ads a WHERE status = 'active' AND expires_at > ? AND ${SELLER_OK} GROUP BY city COLLATE NOCASE ORDER BY n DESC LIMIT 12`).all(Date.now());
    const activeCat = filters.cat ? Cat.label((Cat.bySlug(filters.cat) || {}).id) : '';
    const landing = !filters.q && !filters.city && !filters.cat && !filters.kind;
    let body;
    if (landing) {
      const home = getHome(req.settings);
      const slot = currentSlot();
      const tops = home.show.top ? db.prepare(`SELECT a.*, ${CAT_COLS}, 1 AS is_top FROM ads a ${CAT_JOIN}
        WHERE a.status = 'active' AND a.expires_at > ? AND ${SELLER_OK} AND ${TOP_NOW(slot)} ORDER BY a.admin_boost DESC, a.rank_score DESC, ${SHUFFLE(filters.seed)} LIMIT 16`).all(Date.now()) : [];
      const fresh = tops.length ? listAds({ ...filters, excludeTop: true }) : data;
      body = homeLanding(req, { cats, data: fresh, filters, cities, tops, home });
    } else body = homeResults(req, { cats, data, filters, cities });
    res.html(renderPage(req, { title: activeCat || (filters.q ? `Search: ${filters.q}` : ''), body }));
  });

  // Suggestions under the search box while typing (categories, matching ads, cities).
  app.get('/api/suggest', (req, res) => {
    if (!rateLimit(`suggest:${req.ip}`, 240, 60_000)) { res.status(429).json({ cats: [], ads: [], cities: [] }); return; }
    res.json(Search.suggest(str(req.query.q, 60)));
  });

  app.get('/saved', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0).slice(0, 100);
    const ads = ids.length ? db.prepare(`SELECT a.*, ${CAT_COLS}, ${TOP_NOW()} AS is_top FROM ads a ${CAT_JOIN}
      WHERE a.status = 'active' AND a.expires_at > ? AND ${SELLER_OK} AND a.id IN (${ids.map(() => '?').join(',')})`).all(Date.now(), ...ids) : [];
    ads.sort((x, y) => ids.indexOf(y.id) - ids.indexOf(x.id));
    res.html(renderPage(req, { title: 'Saved ads', body: savedView(ads) }));
  });

  app.get('/c/:slug', (req, res) => res.redirect(`/?cat=${encodeURIComponent(req.params.slug)}`));

  app.get('/ad/:idslug', (req, res) => {
    const id = parseInt(req.params.idslug, 10);
    const ad = id && db.prepare(`SELECT a.*, ${CAT_COLS}, cl.name AS seller_name, cl.business_name, cl.status AS seller_status
      FROM ads a ${CAT_JOIN} JOIN clients cl ON cl.id = a.client_id WHERE a.id = ? AND a.status != 'deleted'`).get(id);
    const isOwner = ad && req.seller && req.seller.id === ad.client_id;
    const visible = ad && ad.status === 'active' && ad.expires_at > Date.now() && ad.seller_status === 'approved';
    if (!ad || (!visible && !isOwner && !req.admin)) {
      res.status(410).html(renderPage(req, { title: 'Ad not available', body: html`<section class="card narrow center"><div class="empty-icon">${icon('clock', { size: 26 })}</div><h1>This ad is no longer available</h1><p class="muted">Its paid period may have ended or it was removed.</p><a class="btn btn-accent" href="/">Browse other ads</a></section>` }));
      return;
    }
    if (visible) {
      const seen = req.session.seen || [];
      if (!seen.includes(ad.id)) {
        db.prepare('UPDATE ads SET views = views + 1 WHERE id = ?').run(ad.id);
        ad.views += 1;
        req.session.seen = [...seen, ad.id].slice(-100);
      }
    }
    const slot = currentSlot();
    ad.is_top = ((ad.top_slots >> slot) & 1) || (ad.admin_top_until > Date.now() && ((ad.admin_top_slots >> slot) & 1)) ? 1 : 0;
    const related = db.prepare(`SELECT a.*, ${CAT_COLS}, ${TOP_NOW(slot)} AS is_top_now FROM ads a ${CAT_JOIN}
      WHERE a.status = 'active' AND a.expires_at > ? AND ${SELLER_OK} AND a.category_id = ? AND a.id != ? ORDER BY is_top_now DESC, a.rank_score DESC LIMIT 4`).all(Date.now(), ad.category_id, ad.id);
    related.forEach((r) => { r.is_top = r.is_top_now; });
    let body = adView(req, { ad, images: parseImages(ad), videos: parseVideos(ad), related });
    if (!visible) body = html`<div class="flash flash-warn">Preview only — this ad is not live (${ad.status.replace('_', ' ')}). Visitors cannot see it.</div>${body}`;
    res.html(renderPage(req, { title: ad.title, body, description: String(ad.description).slice(0, 150) }));
  });

  app.post('/ad/:id/report', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const ad = db.prepare('SELECT id, title FROM ads WHERE id = ?').get(id);
    if (!ad) { res.redirect('/'); return; }
    if (!rateLimit(`report:${req.ip}`, 10, 3600_000)) { req.flash('error', 'Too many reports. Please try later.'); res.redirect(adUrl(ad)); return; }
    const reason = str(req.body.reason, 80);
    if (!reason) { req.flash('error', 'Please choose a reason.'); res.redirect(adUrl(ad)); return; }
    db.prepare('INSERT INTO reports (ad_id, reason, details, reporter_ip, created_at) VALUES (?, ?, ?, ?, ?)').run(ad.id, reason, str(req.body.details, 500), req.ip, Date.now());
    complaintCheck(ad.id, reason);
    req.flash('success', 'Thanks — our team will review this ad.');
    res.redirect(adUrl(ad));
  });

  app.get('/media/ads/:file', (req, res) => {
    const name = safeName(req.params.file);
    if (!name || name.endsWith('.pdf')) { res.status(404).send('Not found'); return; }
    return sendFile(res, path.join(DIRS.ads, name), { cache: 'public, max-age=604800, immutable', req });
  });

  require('./legal').register(app);

  app.get('/safety', (req, res) => res.html(renderPage(req, { title: 'Safety tips', body: html`<section class="card prose narrow">
    <h1>Safety tips</h1>
    <ul><li>Meet sellers in busy public places.</li><li>Check the product or service before paying.</li><li>Never pay in advance to unknown people or share OTP / UPI PIN.</li><li>Use the “Report this ad” button for anything suspicious.</li></ul></section>` })));
}

module.exports = { register };
