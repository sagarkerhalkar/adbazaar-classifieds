'use strict';
// Public site: anyone can browse live ads without logging in.

const path = require('node:path');
const { db, parseImages } = require('../db');
const { html, fmtDate, timeAgo } = require('../lib/html');
const { renderPage } = require('../views/layout');
const { csrf, adCard, adUrl, imgUrl, priceText, pager, cityDatalist } = require('../views/components');
const { DIRS, sendFile, safeName } = require('../lib/files');
const { str, normalizePhone } = require('../validators');
const { rateLimit } = require('../lib/security');

const PAGE_SIZE = 24;

function categories() {
  return db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort, name').all();
}

function listAds({ q, city, cat, kind, page }) {
  const where = ["a.status = 'active'", 'a.expires_at > ?'];
  const args = [Date.now()];
  if (q) {
    where.push("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like, like);
  }
  if (city) { where.push('a.city = ? COLLATE NOCASE'); args.push(city); }
  if (cat) { where.push('c.slug = ?'); args.push(cat); }
  if (kind === 'product' || kind === 'service') { where.push('a.kind = ?'); args.push(kind); }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ads a JOIN categories c ON c.id = a.category_id WHERE ${w}`).get(...args).n;
  const rows = db.prepare(`SELECT a.*, c.name AS cat_name, c.icon AS cat_icon, c.slug AS cat_slug
    FROM ads a JOIN categories c ON c.id = a.category_id WHERE ${w}
    ORDER BY a.rank_score DESC, a.starts_at DESC LIMIT ? OFFSET ?`).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  return { rows, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

function homeView(req, { cats, data, filters, cities }) {
  const tops = filters.page === 1 ? data.rows.filter((a) => a.is_top) : [];
  const rest = filters.page === 1 ? data.rows.filter((a) => !a.is_top) : data.rows;
  const activeCat = cats.find((c) => c.slug === filters.cat);
  return html`
  <section class="hero">
    <h1>${activeCat ? activeCat.name : req.settings.tagline}</h1>
    <form class="search" method="get" action="/">
      <input type="search" name="q" value="${filters.q}" placeholder="Search products & services…" aria-label="Search">
      <input name="city" value="${filters.city}" list="cities" placeholder="All cities" aria-label="City">
      ${cityDatalist()}
      <select name="kind" aria-label="Type">
        <option value="">All types</option>
        <option value="product" ${filters.kind === 'product' ? 'selected' : ''}>Products</option>
        <option value="service" ${filters.kind === 'service' ? 'selected' : ''}>Services</option>
      </select>
      ${filters.cat ? html`<input type="hidden" name="cat" value="${filters.cat}">` : ''}
      <button class="btn btn-accent">Search</button>
    </form>
  </section>

  <div class="cats">
    <a class="cat ${!filters.cat ? 'active' : ''}" href="/?${new URLSearchParams({ q: filters.q, city: filters.city, kind: filters.kind })}">🗂️ All</a>
    ${cats.map((c) => html`<a class="cat ${c.slug === filters.cat ? 'active' : ''}" href="/?${new URLSearchParams({ cat: c.slug, q: filters.q, city: filters.city, kind: filters.kind })}">${c.icon} ${c.name}</a>`)}
  </div>

  ${cities.length ? html`<div class="city-chips">${cities.map((c) => html`<a class="chip ${c.city.toLowerCase() === filters.city.toLowerCase() ? 'active' : ''}" href="/?${new URLSearchParams({ city: c.city, cat: filters.cat })}">${c.city} <span class="muted">${c.n}</span></a>`)}</div>` : ''}

  ${tops.length ? html`
    <section class="section">
      <div class="section-head"><h2>★ Top ads</h2><span class="muted small">Featured by sellers</span></div>
      <div class="grid">${tops.map(adCard)}</div>
    </section>` : ''}

  <section class="section">
    <div class="section-head"><h2>${filters.q ? `Results for “${filters.q}”` : 'Latest ads'}</h2><span class="muted small">${data.total} ad${data.total === 1 ? '' : 's'}</span></div>
    ${rest.length ? html`<div class="grid">${rest.map(adCard)}</div>` : (tops.length ? '' : html`
      <div class="empty card center">
        <div class="empty-icon">🔎</div>
        <h3>No ads found</h3>
        <p class="muted">Try another search or city — or be the first to post here.</p>
        <a class="btn btn-accent" href="/client/register">Post your ad</a>
      </div>`)}
    ${pager(filters.page, data.totalPages, { q: filters.q, city: filters.city, cat: filters.cat, kind: filters.kind })}
  </section>

  <section class="how card">
    <h2>Sell on ${req.settings.site_name}</h2>
    <ol class="steps">
      <li><strong>Register & verify</strong><span>Submit your Aadhaar, PAN, address and a live photo.</span></li>
      <li><strong>Get approved</strong><span>We verify you — sometimes over a quick video call.</span></li>
      <li><strong>Post & pay</strong><span>Choose 7, 15 or 29 days. Your ad goes live as soon as payment is confirmed.</span></li>
    </ol>
    <a class="btn btn-accent" href="/client/register">Start selling</a>
  </section>`;
}

function adView(req, { ad, images, related }) {
  const wa = ad.whatsapp ? normalizePhone(ad.whatsapp) : '';
  const waText = encodeURIComponent(`Hi, I saw your ad "${ad.title}" on ${req.settings.site_name}.`);
  return html`
  <nav class="crumbs"><a href="/">Home</a> › <a href="/?cat=${ad.cat_slug}">${ad.cat_name}</a> › <span>${ad.title}</span></nav>
  <div class="ad-page">
    <div class="ad-main">
      <div class="gallery" data-gallery>
        ${images.length ? html`
          <div class="gallery-main"><img src="${imgUrl(images[0])}" alt="${ad.title}" data-gallery-main></div>
          ${images.length > 1 ? html`<div class="gallery-thumbs">${images.map((f, i) => html`<button type="button" class="${i === 0 ? 'active' : ''}" data-gallery-thumb="${imgUrl(f)}"><img src="${imgUrl(f)}" alt=""></button>`)}</div>` : ''}`
        : html`<div class="gallery-main ph">${ad.cat_icon}</div>`}
      </div>
      <section class="card">
        <h2>Description</h2>
        <div class="desc">${String(ad.description).split(/\n+/).map((p) => html`<p>${p}</p>`)}</div>
        <dl class="facts">
          <div><dt>Type</dt><dd>${ad.kind === 'service' ? 'Service' : 'Product'}</dd></div>
          <div><dt>Category</dt><dd>${ad.cat_name}</dd></div>
          <div><dt>Location</dt><dd>${ad.locality ? `${ad.locality}, ` : ''}${ad.city}</dd></div>
          <div><dt>Posted</dt><dd>${fmtDate(ad.starts_at)}</dd></div>
          <div><dt>Ad ID</dt><dd>#${ad.id}</dd></div>
          <div><dt>Views</dt><dd>${ad.views}</dd></div>
        </dl>
      </section>
    </div>
    <aside class="ad-side">
      <div class="card sticky">
        ${ad.is_top ? html`<span class="top-badge static">★ TOP AD</span>` : ''}
        <h1 class="ad-h1">${ad.title}</h1>
        <div class="big-price">${priceText(ad)}</div>
        <p class="muted">📍 ${ad.locality ? `${ad.locality}, ` : ''}${ad.city} · ${timeAgo(ad.starts_at)}</p>
        <div class="seller">
          <div class="avatar">${(ad.business_name || ad.seller_name || '?').slice(0, 1).toUpperCase()}</div>
          <div><strong>${ad.business_name || ad.seller_name}</strong><div class="verified small">✔ ID-verified seller</div></div>
        </div>
        <a class="btn btn-accent btn-block" href="tel:+91${normalizePhone(ad.contact_phone)}" data-reveal-phone="+91 ${normalizePhone(ad.contact_phone)}">📞 Show phone number</a>
        ${wa ? html`<a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="https://wa.me/91${wa}?text=${waText}">💬 WhatsApp</a>` : ''}
        <details class="report">
          <summary>⚑ Report this ad</summary>
          <form method="post" action="/ad/${ad.id}/report">
            ${csrf(req)}
            <select name="reason" required>
              <option value="">Choose a reason</option>
              <option>Fraud / scam</option><option>Wrong category</option><option>Prohibited item or service</option>
              <option>Sold / no longer available</option><option>Offensive content</option><option>Other</option>
            </select>
            <textarea name="details" rows="2" maxlength="500" placeholder="Details (optional)"></textarea>
            <button class="btn btn-ghost btn-sm">Send report</button>
          </form>
        </details>
      </div>
      <div class="card safety small">
        <strong>Stay safe</strong>
        <ul><li>Meet in a public place.</li><li>Inspect items before paying.</li><li>Never share OTPs or pay advance to strangers.</li></ul>
      </div>
    </aside>
  </div>
  ${related.length ? html`<section class="section"><div class="section-head"><h2>Similar ads</h2></div><div class="grid">${related.map(adCard)}</div></section>` : ''}`;
}

function register(app) {
  app.get('/', (req, res) => {
    const filters = {
      q: str(req.query.q, 80), city: str(req.query.city, 60), cat: str(req.query.cat, 60),
      kind: str(req.query.kind, 10), page: Math.max(1, Math.min(500, parseInt(req.query.page, 10) || 1)),
    };
    const cats = categories();
    const data = listAds(filters);
    const cities = db.prepare("SELECT city, COUNT(*) AS n FROM ads WHERE status = 'active' AND expires_at > ? GROUP BY city COLLATE NOCASE ORDER BY n DESC LIMIT 12").all(Date.now());
    const activeCat = cats.find((c) => c.slug === filters.cat);
    res.html(renderPage(req, { title: activeCat?.name || (filters.q ? `Search: ${filters.q}` : ''), body: homeView(req, { cats, data, filters, cities }) }));
  });

  app.get('/c/:slug', (req, res) => res.redirect(`/?cat=${encodeURIComponent(req.params.slug)}`));

  app.get('/ad/:idslug', (req, res) => {
    const id = parseInt(req.params.idslug, 10);
    const ad = id && db.prepare(`SELECT a.*, c.name AS cat_name, c.icon AS cat_icon, c.slug AS cat_slug, cl.name AS seller_name, cl.business_name
      FROM ads a JOIN categories c ON c.id = a.category_id JOIN clients cl ON cl.id = a.client_id WHERE a.id = ?`).get(id);
    const isOwner = ad && req.seller && req.seller.id === ad.client_id;
    const visible = ad && ad.status === 'active' && ad.expires_at > Date.now();
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
    const related = db.prepare(`SELECT a.*, c.name AS cat_name, c.icon AS cat_icon FROM ads a JOIN categories c ON c.id = a.category_id
      WHERE a.status = 'active' AND a.expires_at > ? AND a.category_id = ? AND a.id != ? ORDER BY a.rank_score DESC LIMIT 4`).all(Date.now(), ad.category_id, ad.id);
    let body = adView(req, { ad, images: parseImages(ad), related });
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
    return sendFile(res, path.join(DIRS.ads, name), { cache: 'public, max-age=604800, immutable' });
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
