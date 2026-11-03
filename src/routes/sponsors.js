'use strict';
// Sponsored ads from other businesses, websites or apps (third-party advertisers).
//  - shown as a "Sponsored" card between listings, under the ad page and on the home page
//  - admin adds them in Admin → Sponsors with a start/end date; views and clicks are counted
//  - advertisers ask for a slot on /advertise; their enquiry lands in Admin → Sponsors

const { db, getSettings } = require('../db');
const { html } = require('../lib/html');
const { csrf, field, imgUrl } = require('../views/components');
const { icon } = require('../views/icons');
const { saveUpload, removeFile, UploadError } = require('../lib/files');
const { safeLink } = require('../homeconfig');
const { rateLimit } = require('../lib/security');
const V = require('../validators');

const PLACES = { feed: 'Between ads in listings', ad_page: 'Under the ad page', home: 'Home page (above the footer)' };

/** Pick one live sponsor for a placement (random among live ones) and count the view. */
function pick(placement) {
  const now = Date.now();
  const list = db.prepare(`SELECT * FROM sponsors WHERE is_active = 1 AND placement = ?
    AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?)`).all(placement, now, now);
  if (!list.length) return null;
  const sp = list[Math.floor(Math.random() * list.length)];
  db.prepare('UPDATE sponsors SET impressions = impressions + 1 WHERE id = ?').run(sp.id);
  return sp;
}

function card(sp, variant = 'card') {
  if (!sp) return '';
  return html`<aside class="sponsor sponsor-${variant}">
    <a href="/go/s/${sp.id}" target="_blank" rel="sponsored noopener" class="sponsor-link">
      ${sp.image ? html`<img src="${imgUrl(sp.image)}" alt="" loading="lazy">` : html`<span class="sponsor-ph">${icon('bolt', { size: 28 })}</span>`}
      <span class="sponsor-body"><span class="sponsor-tag">Sponsored · ${sp.advertiser}</span><strong>${sp.title}</strong>${sp.body ? html`<span class="muted small">${sp.body}</span>` : ''}</span>
    </a>
  </aside>`;
}

/** Insert a sponsored card into a list of rendered ad cards after every N ads. */
function weave(cards) {
  const every = Math.max(3, Number(getSettings().sponsor_every) || 8);
  if (cards.length < every) return cards;
  const out = [];
  cards.forEach((c, i) => { out.push(c); if ((i + 1) % every === 0) { const sp = pick('feed'); if (sp) out.push(card(sp, 'card')); } });
  return out;
}

const toInput = (ms) => (ms ? new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 16) : '');
const fromInput = (v) => { if (!v) return null; const t = Date.parse(`${v}:00+05:30`); return Number.isFinite(t) ? t : null; };

function adminView(req, rows, enquiries) {
  const form = (sp = {}) => html`
    <form method="post" action="${sp.id ? `/admin/sponsors/${sp.id}` : '/admin/sponsors/add'}" enctype="multipart/form-data" class="form">
      ${csrf(req)}
      <div class="row2">${field('Advertiser', html`<input name="advertiser" required maxlength="60" value="${sp.advertiser}" placeholder="e.g. Sharma Insurance">`)}${field('Show at', html`<select name="placement">${Object.entries(PLACES).map(([k, l]) => html`<option value="${k}" ${sp.placement === k ? 'selected' : ''}>${l}</option>`)}</select>`)}</div>
      ${field('Headline', html`<input name="title" required maxlength="80" value="${sp.title}" placeholder="e.g. Bike insurance from ₹499">`)}
      ${field('Small text (optional)', html`<input name="body" maxlength="140" value="${sp.body}">`)}
      ${field('Link (their website or app)', html`<input name="link" required maxlength="300" value="${sp.link}" placeholder="https://…">`)}
      <div class="row2">${field('Start (India time)', html`<input type="datetime-local" name="starts_at" value="${toInput(sp.starts_at)}">`, 'Empty = now')}${field('End (India time)', html`<input type="datetime-local" name="ends_at" value="${toInput(sp.ends_at)}">`, 'Empty = no end')}</div>
      ${field('Picture (optional)', html`<input type="file" name="image" accept="image/jpeg,image/png,image/webp">`, 'Square or wide, max 3 MB')}
      <label class="check switch-line"><input type="checkbox" class="switch" name="is_active" value="1" ${sp.id ? (sp.is_active ? 'checked' : '') : 'checked'}><span>Show on site</span></label>
      <button class="btn btn-primary">${sp.id ? 'Save' : 'Add sponsored ad'}</button>
    </form>`;
  const now = Date.now();
  const state = (sp) => (!sp.is_active ? ['Off', 'muted'] : sp.ends_at && sp.ends_at <= now ? ['Ended', 'muted'] : sp.starts_at && sp.starts_at > now ? ['Scheduled', 'info'] : ['Live', 'ok']);
  return html`
  <div class="page-head"><div><h1>Sponsors</h1><p class="muted">Ads from other businesses, websites or apps. Shown with a "Sponsored" label. You agree the price with them directly.</p></div>
    <a class="btn" href="/advertise" target="_blank">${icon('eye', { size: 16 })} Advertise page</a></div>
  <div data-tab-scope>
    <div class="tabs" data-tabs data-tabs-hash role="tablist">
      <button type="button" class="tab active" data-tab="list">${icon('layers', { size: 16 })} Sponsored ads <span class="pill pill-muted">${rows.length}</span></button>
      <button type="button" class="tab" data-tab="add">${icon('plus', { size: 16 })} Add new</button>
      <button type="button" class="tab" data-tab="enquiries">${icon('mail', { size: 16 })} Enquiries ${enquiries.filter((e) => !e.handled).length ? html`<span class="badge-count">${enquiries.filter((e) => !e.handled).length}</span>` : ''}</button>
    </div>
    <div class="tab-panel" data-panel="list">
      ${rows.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>Sponsored ad</th><th>Where</th><th>Dates</th><th>Views</th><th>Clicks</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((sp) => { const [l, t] = state(sp); return html`<tr>
          <td><div class="cell-ad">${sp.image ? html`<img src="${imgUrl(sp.image)}" alt="">` : html`<div class="thumb-ph sm">${icon('image', { size: 18 })}</div>`}<div><strong>${sp.title}</strong><div class="small muted">${sp.advertiser} · <a href="${sp.link}" target="_blank" rel="noopener">link</a></div></div></div></td>
          <td>${PLACES[sp.placement]}</td>
          <td class="small">${sp.starts_at ? new Date(sp.starts_at).toLocaleDateString('en-IN') : 'now'} → ${sp.ends_at ? new Date(sp.ends_at).toLocaleDateString('en-IN') : 'no end'}</td>
          <td>${sp.impressions}</td><td>${sp.clicks}${sp.impressions ? html` <span class="muted small">(${((sp.clicks / sp.impressions) * 100).toFixed(1)}%)</span>` : ''}</td>
          <td><span class="pill pill-${t}">${l}</span></td>
          <td class="actions"><details><summary class="btn btn-sm">Edit</summary><div class="card" style="margin-top:8px;min-width:420px">${form(sp)}</div></details>
            <form method="post" action="/admin/sponsors/${sp.id}/delete" class="inline" data-confirm="Delete this sponsored ad?">${csrf(req)}<button class="btn btn-danger btn-sm">Delete</button></form></td></tr>`; })}
        </tbody></table></div>` : html`<div class="card empty center"><div class="empty-icon">${icon('bolt', { size: 26 })}</div><h3>No sponsored ads yet</h3><p class="muted">When a business wants to advertise with you, add their ad here.</p></div>`}
    </div>
    <div class="tab-panel narrow-ish" data-panel="add" hidden><section class="card">${form()}</section></div>
    <div class="tab-panel" data-panel="enquiries" hidden>
      ${enquiries.length ? html`<div class="msgs">${enquiries.map((e) => html`<article class="msg ${e.handled ? '' : 'unread'}">
        <span class="msg-ic">${icon('mail', { size: 18 })}</span>
        <div class="msg-main"><div class="msg-top"><strong>${e.name}${e.company ? ` · ${e.company}` : ''}</strong><time class="muted small">${new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</time></div>
          <p>${e.message}</p><p class="small"><a href="mailto:${e.email}">${e.email}</a>${e.phone ? html` · <a href="tel:${e.phone}">${e.phone}</a>` : ''}</p>
          ${e.handled ? html`<span class="pill pill-muted">Done</span>` : html`<form method="post" action="/admin/enquiries/${e.id}/done" class="inline">${csrf(req)}<button class="btn btn-sm">Mark as done</button></form>`}</div>
      </article>`)}</div>` : html`<div class="card empty center"><p class="muted">No enquiries yet. Share your <a href="/advertise" target="_blank">Advertise with us</a> page.</p></div>`}
    </div>
  </div>`;
}

function advertiseView(req, s) {
  return html`
  <div class="kyc-shell">
    <aside class="kyc-aside">
      <h2>Advertise with ${s.site_name}</h2>
      <p>Put your business, website or app in front of people who are ready to buy.</p>
      <ul class="kyc-points">
        <li>${icon('layers', { size: 20 })}<span><strong>Between listings</strong>A "Sponsored" card among the ads</span></li>
        <li>${icon('eye', { size: 20 })}<span><strong>On ad pages</strong>Right under the ad people are reading</span></li>
        <li>${icon('home', { size: 20 })}<span><strong>Home page</strong>Seen by every visitor</span></li>
        <li>${icon('chart', { size: 20 })}<span><strong>Clear numbers</strong>Views and clicks for your report</span></li>
      </ul>
    </aside>
    <section class="card kyc-card">
      <h1>Tell us about your campaign</h1>
      <p class="muted">We reply within one working day with prices and free slots.</p>
      <form method="post" action="/advertise" class="form">
        ${csrf(req)}
        <div class="row2">${field('Your name', html`<input name="name" required maxlength="80">`)}${field('Company / app', html`<input name="company" maxlength="80">`)}</div>
        <div class="row2">${field('Email', html`<input name="email" type="email" required maxlength="120">`)}${field('Phone', html`<input name="phone" maxlength="15" inputmode="tel">`)}</div>
        ${field('What would you like to promote?', html`<textarea name="message" rows="4" required maxlength="1500" placeholder="Website or app, cities, dates, budget…"></textarea>`)}
        <button class="btn btn-sell btn-lg">${icon('mail', { size: 18 })} Send enquiry</button>
      </form>
    </section>
  </div>`;
}

function register(app, { requireAdmin, page, renderPage }) {
  const rows = () => db.prepare('SELECT * FROM sponsors ORDER BY id DESC').all();
  app.get('/admin/sponsors', requireAdmin, (req, res) => res.html(page(req, 'Sponsors', adminView(req, rows(), db.prepare('SELECT * FROM enquiries ORDER BY handled, id DESC LIMIT 200').all()))));

  const read = (req, existing = {}) => {
    const b = req.body;
    const link = safeLink(b.link);
    if (!V.str(b.advertiser, 60) || !V.str(b.title, 80) || !link) return { error: 'Fill in the advertiser, headline and a link starting with https:// or /.' };
    let image = existing.image || null;
    const f = req.files && req.files.image && req.files.image[0];
    if (f && f.data && f.data.length) {
      try { const n = saveUpload(f, 'ads', { maxMb: 3 }); if (image) removeFile('ads', image); image = n; } catch (e) { if (e instanceof UploadError) return { error: e.message }; throw e; }
    }
    return { v: { advertiser: V.str(b.advertiser, 60), title: V.str(b.title, 80), body: V.str(b.body, 140), link, image,
      placement: PLACES[b.placement] ? b.placement : 'feed', starts_at: fromInput(b.starts_at), ends_at: fromInput(b.ends_at), is_active: b.is_active === '1' ? 1 : 0 } };
  };
  app.post('/admin/sponsors/add', requireAdmin, (req, res) => {
    const { v, error } = read(req);
    if (error) { req.flash('error', error); res.redirect('/admin/sponsors#add'); return; }
    db.prepare('INSERT INTO sponsors (advertiser, title, body, image, link, placement, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(v.advertiser, v.title, v.body, v.image, v.link, v.placement, v.starts_at, v.ends_at, v.is_active, Date.now());
    req.flash('success', 'Sponsored ad added.');
    res.redirect('/admin/sponsors');
  });
  app.post('/admin/sponsors/:id', requireAdmin, (req, res) => {
    const sp = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!sp) { res.redirect('/admin/sponsors'); return; }
    const { v, error } = read(req, sp);
    if (error) { req.flash('error', error); res.redirect('/admin/sponsors'); return; }
    db.prepare('UPDATE sponsors SET advertiser=?, title=?, body=?, image=?, link=?, placement=?, starts_at=?, ends_at=?, is_active=? WHERE id=?')
      .run(v.advertiser, v.title, v.body, v.image, v.link, v.placement, v.starts_at, v.ends_at, v.is_active, sp.id);
    req.flash('success', 'Saved.');
    res.redirect('/admin/sponsors');
  });
  app.post('/admin/sponsors/:id/delete', requireAdmin, (req, res) => {
    const sp = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (sp) { if (sp.image) removeFile('ads', sp.image); db.prepare('DELETE FROM sponsors WHERE id = ?').run(sp.id); req.flash('success', 'Deleted.'); }
    res.redirect('/admin/sponsors');
  });
  app.post('/admin/enquiries/:id/done', requireAdmin, (req, res) => {
    db.prepare('UPDATE enquiries SET handled = 1 WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
    res.redirect('/admin/sponsors#enquiries');
  });

  // Click counter + redirect to the advertiser
  app.get('/go/s/:id', (req, res) => {
    const sp = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!sp) { res.redirect('/'); return; }
    db.prepare('UPDATE sponsors SET clicks = clicks + 1 WHERE id = ?').run(sp.id);
    res.redirect(sp.link);
  });

  app.get('/advertise', (req, res) => res.html(renderPage(req, { title: 'Advertise with us', body: advertiseView(req, req.settings) })));
  app.post('/advertise', (req, res) => {
    const b = req.body;
    if (!rateLimit(`enq:${req.ip}`, 5, 3600_000)) { req.flash('error', 'Too many messages. Please try again later.'); res.redirect('/advertise'); return; }
    const name = V.str(b.name, 80); const email = V.str(b.email, 120); const message = V.str(b.message, 1500);
    if (!name || !V.isValidEmail(email) || !message) { req.flash('error', 'Please fill in your name, a valid email and a message.'); res.redirect('/advertise'); return; }
    db.prepare('INSERT INTO enquiries (name, company, email, phone, message, ip, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(name, V.str(b.company, 80), email, V.str(b.phone, 15), message, req.ip, Date.now());
    require('../notify').adminAlert('sponsor', `📣 New advertiser enquiry: ${name}${b.company ? ` (${V.str(b.company, 80)})` : ''} — ${email}`);
    req.flash('success', 'Thank you! We will get back to you within one working day.');
    res.redirect('/advertise');
  });
}

module.exports = { register, pick, card, weave };
