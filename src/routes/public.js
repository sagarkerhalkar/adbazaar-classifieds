'use strict';
// Public site: anyone can browse live ads without logging in.

const path = require('node:path');
const { db, parseImages, parseVideos } = require('../db');
const { currentSlot, SLOTS } = require('../slots');
const Cat = require('../categories');
const { html, fmtDate, timeAgo, approveTimeText, PAYMENT_TIME_TEXT } = require('../lib/html');
const { icon } = require('../views/icons');
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

const SORTS = {
  best: 'top_now DESC, a.rank_score DESC, a.starts_at DESC',
  new: 'top_now DESC, a.starts_at DESC',
  price_asc: 'top_now DESC, (a.price_paise IS NULL OR a.price_paise = 0), a.price_paise ASC, a.rank_score DESC',
  price_desc: 'top_now DESC, a.price_paise IS NULL, a.price_paise DESC, a.rank_score DESC',
};

function listAds({ q, city, cat, kind, page, sort }) {
  const where = ["a.status = 'active'", 'a.expires_at > ?', SELLER_OK];
  const args = [Date.now()];
  if (q) {
    where.push("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like, like);
  }
  if (city) { where.push('a.city = ? COLLATE NOCASE'); args.push(city); }
  if (cat) {
    const ids = Cat.idsForSlug(cat);
    where.push(`a.category_id IN (${ids.map(() => '?').join(',') || 'NULL'})`);
    args.push(...ids);
  }
  if (kind === 'product' || kind === 'service') { where.push('a.kind = ?'); args.push(kind); }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ads a ${CAT_JOIN} WHERE ${w}`).get(...args).n;
  // Ads that bought the CURRENT 3-hour slot always come first (TOP), then the chosen order.
  const slot = currentSlot();
  const order = SORTS[sort] || SORTS.best;
  const rows = db.prepare(`SELECT a.*, ${CAT_COLS}, ((a.top_slots >> ?) & 1) AS top_now
    FROM ads a ${CAT_JOIN} WHERE ${w}
    ORDER BY ${order} LIMIT ? OFFSET ?`).all(slot, ...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  rows.forEach((r) => { r.is_top = r.top_now; });
  return { rows, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), slot };
}

function ringCard(ad) {
  let images = [];
  try { images = JSON.parse(ad.images || '[]'); } catch { /* ignore */ }
  return html`<a class="ring-card" href="${adUrl(ad)}" draggable="false">
    ${images[0] ? html`<img src="${imgUrl(images[0])}" alt="" draggable="false" loading="lazy">` : html`<div class="thumb-ph">${ad.cat_icon || '📦'}</div>`}
    ${ad.is_top ? html`<span class="top-badge">★ TOP</span>` : ''}
    <span class="rc-body"><span class="rc-title">${ad.title}</span><span class="rc-price">${priceText(ad)}</span><span class="muted small">${ad.city}</span></span>
  </a>`;
}

function homeView(req, { cats, data, filters, cities, featured }) {
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
  const filtered = filters.q || filters.city || filters.cat || filters.kind || filters.page > 1;
  const heading = filters.q ? `Results for “${filters.q}”` : activeSub ? activeSub.name : activeMain ? activeMain.name : 'Fresh ads near you';
  const anyTop = featured.some((a) => a.is_top);
  return html`
  ${!filtered ? html`
  <section class="hero">
    <div>
      <h1>${req.settings.tagline || 'Buy and sell with verified people'}</h1>
      <p>Find great deals and helpful local services in a few taps. No sign-up, just browse and call.</p>
      <div class="hero-trust">
        <span>${icon('star', { size: 18 })} Trusted local sellers</span>
        <span>${icon('eye', { size: 18 })} Free to browse</span>
        <span>${icon('bolt', { size: 18 })} ${data.total} live ad${data.total === 1 ? '' : 's'}</span>
      </div>
    </div>
    <div class="ring-stage" data-ring tabindex="0" aria-label="${anyTop ? 'TOP ads right now' : 'Featured ads'}. Use arrow keys or drag to turn.">
      ${featured.length ? html`<div class="ring">${featured.map(ringCard)}</div>
        <div class="ring-nav"><button type="button" data-ring-prev aria-label="Previous">‹</button><span class="small" style="align-self:center">${anyTop ? `★ TOP now · ${SLOTS[data.slot].label}` : 'Featured'}</span><button type="button" data-ring-next aria-label="Next">›</button></div>`
      : html`<div class="ring-empty"><div><div class="empty-icon">★</div><p>TOP ads appear here.<br>Be the first — <a href="/client/register" style="color:#fff;text-decoration:underline">post an ad</a>.</p></div></div>`}
    </div>
  </section>` : ''}

  <nav class="catrail" aria-label="Categories">
    <a class="cat ${!filters.cat ? 'active' : ''}" href="${q({ cat: '', page: '' })}"><span class="cat-ic">🗂️</span>All</a>
    ${cats.map((c) => html`<a class="cat ${activeMain && activeMain.id === c.id ? 'active' : ''}" href="${q({ cat: c.slug, page: '' })}"><span class="cat-ic">${c.icon}</span>${c.name}</a>`)}
  </nav>

  <div class="listing">
    <aside class="filters" data-filters>
      ${activeMain && activeMain.subs.length ? html`<div class="f-group"><h3>${activeMain.name}</h3>
        <a class="f-opt ${!activeSub ? 'active' : ''}" href="${q({ cat: activeMain.slug, page: '' })}">All ${activeMain.name}</a>
        ${activeMain.subs.map((sc) => html`<a class="f-opt ${activeSub && activeSub.id === sc.id ? 'active' : ''}" href="${q({ cat: sc.slug, page: '' })}">${sc.name}</a>`)}
      </div>` : ''}
      <div class="f-group"><h3>Type</h3>
        ${[['', 'Everything'], ['product', 'Products'], ['service', 'Services']].map(([k, l]) => html`<a class="f-opt ${filters.kind === k ? 'active' : ''}" href="${q({ kind: k, page: '' })}">${l}</a>`)}
      </div>
      ${cities.length ? html`<div class="f-group"><h3>City</h3>
        <a class="f-opt ${!filters.city ? 'active' : ''}" href="${q({ city: '', page: '' })}">All cities</a>
        ${cities.slice(0, 8).map((c) => html`<a class="f-opt ${c.city.toLowerCase() === filters.city.toLowerCase() ? 'active' : ''}" href="${q({ city: c.city, page: '' })}">${c.city} <span class="muted small" style="margin-left:auto">${c.n}</span></a>`)}
      </div>` : ''}
    </aside>

    <section>
      <div class="sortbar">
        <div><h2>${heading}</h2><span class="muted small">${data.total} ad${data.total === 1 ? '' : 's'}${filters.city ? ` in ${filters.city}` : ''}</span></div>
        <div class="btn-row" style="margin:0">
          <button type="button" class="btn btn-sm only-filters" data-toggle-filters>${icon('layers', { size: 16 })} Filters</button>
          <form method="get" action="/" class="inline">
            ${Object.entries(base).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
            <select name="sort" aria-label="Sort" onchange="this.form.submit()" style="padding:7px 10px">
              ${[['best', 'Best match'], ['new', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']].map(([k, l]) => html`<option value="${k}" ${filters.sort === k ? 'selected' : ''}>${l}</option>`)}
            </select>
          </form>
        </div>
      </div>
      ${data.rows.length ? html`<div class="grid">${data.rows.map(adCard)}</div>` : html`
        <div class="empty card center">
          <div class="empty-icon">🔎</div>
          <h3>No ads match this search</h3>
          <p class="muted">Try another word, city or category.</p>
          <a class="btn btn-primary" href="/">Show all ads</a>
        </div>`}
      ${pager(filters.page, data.totalPages, Object.fromEntries(Object.entries(base).filter(([, v]) => v)))}
    </section>
  </div>

  ${!filtered ? html`
  <section class="sellband">
    <div><h2>Sell on ${req.settings.site_name}</h2><p class="muted">Register in about 3 minutes. Login check takes ${approveTimeText(Number(req.settings.auto_approve_minutes || 1))}; your ad goes live once payment is confirmed (${PAYMENT_TIME_TEXT}).</p></div>
    <ol class="steps"><li><strong>Register</strong><span>Quick and free</span></li><li><strong>Get verified</strong><span>About ${approveTimeText(Number(req.settings.auto_approve_minutes || 1)).replace('about ', '')}</span></li><li><strong>Post & pay</strong><span>7, 15 or 29 days</span></li></ol>
    <a class="btn btn-sell btn-lg" href="/client/register">Start selling</a>
  </section>` : ''}`;
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
        : html`<div class="gallery-main ph">${ad.cat_icon}</div>`}
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
  ${related.length ? html`<section class="section"><div class="section-head"><h2>Similar ads</h2><a class="small" href="/?cat=${ad.cat_slug}">See all</a></div><div class="grid">${related.map(adCard)}</div></section>` : ''}`;
}

function register(app) {
  app.get('/', (req, res) => {
    const filters = {
      q: str(req.query.q, 80), city: str(req.query.city, 60), cat: str(req.query.cat, 60),
      kind: str(req.query.kind, 10), page: Math.max(1, Math.min(500, parseInt(req.query.page, 10) || 1)),
      sort: SORTS[req.query.sort] ? req.query.sort : 'best',
    };
    const cats = Cat.tree();
    const data = listAds(filters);
    const cities = db.prepare(`SELECT city, COUNT(*) AS n FROM ads a WHERE status = 'active' AND expires_at > ? AND ${SELLER_OK} GROUP BY city COLLATE NOCASE ORDER BY n DESC LIMIT 12`).all(Date.now());
    const activeCat = filters.cat ? Cat.label((Cat.bySlug(filters.cat) || {}).id) : '';
    // The 3D ring shows ads in the current TOP slot; if there are fewer than 3, it is topped up with the best-ranked ads.
    let featured = [];
    if (!filters.q && !filters.city && !filters.cat && !filters.kind && filters.page === 1) {
      const slot = currentSlot();
      featured = db.prepare(`SELECT a.*, ${CAT_COLS}, ((a.top_slots >> ?) & 1) AS top_now FROM ads a ${CAT_JOIN}
        WHERE a.status = 'active' AND a.expires_at > ? AND ${SELLER_OK} ORDER BY top_now DESC, a.rank_score DESC LIMIT 10`).all(slot, Date.now());
      featured.forEach((r) => { r.is_top = r.top_now; });
      const tops = featured.filter((a) => a.is_top);
      featured = tops.length >= 3 ? tops : featured.slice(0, Math.max(tops.length, 8));
    }
    res.html(renderPage(req, { title: activeCat || (filters.q ? `Search: ${filters.q}` : ''), body: homeView(req, { cats, data, filters, cities, featured }) }));
  });

  app.get('/c/:slug', (req, res) => res.redirect(`/?cat=${encodeURIComponent(req.params.slug)}`));

  app.get('/ad/:idslug', (req, res) => {
    const id = parseInt(req.params.idslug, 10);
    const ad = id && db.prepare(`SELECT a.*, ${CAT_COLS}, cl.name AS seller_name, cl.business_name, cl.status AS seller_status
      FROM ads a ${CAT_JOIN} JOIN clients cl ON cl.id = a.client_id WHERE a.id = ? AND a.status != 'deleted'`).get(id);
    const isOwner = ad && req.seller && req.seller.id === ad.client_id;
    const visible = ad && ad.status === 'active' && ad.expires_at > Date.now() && ad.seller_status === 'approved';
    if (!ad || (!visible && !isOwner && !req.admin)) {
      res.status(410).html(renderPage(req, { title: 'Ad not available', body: html`<section class="card narrow center"><div class="empty-icon">⌛</div><h1>This ad is no longer available</h1><p class="muted">Its paid period may have ended or it was removed.</p><a class="btn btn-accent" href="/">Browse other ads</a></section>` }));
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
    ad.is_top = (ad.top_slots >> slot) & 1;
    const related = db.prepare(`SELECT a.*, ${CAT_COLS}, ((a.top_slots >> ?) & 1) AS is_top_now FROM ads a ${CAT_JOIN}
      WHERE a.status = 'active' AND a.expires_at > ? AND ${SELLER_OK} AND a.category_id = ? AND a.id != ? ORDER BY is_top_now DESC, a.rank_score DESC LIMIT 4`).all(slot, Date.now(), ad.category_id, ad.id);
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
    req.flash('success', 'Thanks — our team will review this ad.');
    res.redirect(adUrl(ad));
  });

  app.get('/media/ads/:file', (req, res) => {
    const name = safeName(req.params.file);
    if (!name || name.endsWith('.pdf')) { res.status(404).send('Not found'); return; }
    return sendFile(res, path.join(DIRS.ads, name), { cache: 'public, max-age=604800, immutable', req });
  });

  app.get('/terms', (req, res) => res.html(renderPage(req, { title: 'Terms', body: html`<section class="card prose narrow">
    <h1>Terms of use</h1>
    <p>${req.settings.site_name} is a classifieds platform. Sellers are identity-verified before they can post, but buyers should still take normal precautions.</p>
    <ul>
      <li>Ads run for the paid period (e.g. 7, 15 or 29 days) and are removed automatically when it ends.</li>
      <li>Payments for ad placement are non-refundable once an ad has gone live.</li>
      <li>Prohibited: illegal goods or services, adult/escort services, weapons, drugs, counterfeit items, and misleading ads. Such ads are removed without refund and the account may be suspended.</li>
      <li>Identity documents submitted for verification are used only for KYC and are never shown publicly.</li>
    </ul></section>` })));

  app.get('/safety', (req, res) => res.html(renderPage(req, { title: 'Safety tips', body: html`<section class="card prose narrow">
    <h1>Safety tips</h1>
    <ul><li>Meet sellers in busy public places.</li><li>Check the product or service before paying.</li><li>Never pay in advance to unknown people or share OTP / UPI PIN.</li><li>Use the “Report this ad” button for anything suspicious.</li></ul></section>` })));
}

module.exports = { register };
