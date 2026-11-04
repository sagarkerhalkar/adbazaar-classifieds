'use strict';
// Admin → Home page: change the banners, texts and sections of the public home page.

const { html } = require('../lib/html');
const { csrf, field, imgUrl } = require('../views/components');
const { icon } = require('../views/icons');
const { saveUpload, removeFile, UploadError } = require('../lib/files');
const { getHome, saveHome, safeLink, THEMES } = require('../homeconfig');
const V = require('../validators');
const Ph = require('../photos');

const THEME_LABELS = { peacock: 'Blue', marigold: 'Yellow', green: 'Green', berry: 'Pink', ink: 'Dark' };

function view(req, cfg) {
  const slideCard = (x, i, n) => html`
  <article class="bcard">
    <div class="bcard-preview slide theme-${x.theme} active has-img">
      <img class="slide-img" src="${x.image ? imgUrl(x.image) : Ph.photoUrl(x.photo && Ph.exists(x.photo) ? x.photo : Ph.BANNER_DEFAULTS[i % Ph.BANNER_DEFAULTS.length])}" alt="">
      <div class="slide-text"><h2>${x.title || 'No title'}</h2>${x.subtitle ? html`<p>${x.subtitle}</p>` : ''}${x.button ? html`<span class="btn btn-sm btn-sell">${x.button}</span>` : ''}</div>
      ${x.active ? '' : html`<span class="pill pill-muted bcard-off">Hidden</span>`}
    </div>
    <details class="bcard-edit" ${x.title === 'New banner' ? 'open' : ''}><summary>${icon('edit', { size: 15 })} Edit banner ${i + 1}</summary>
    <form method="post" action="/admin/home/slides/${i}" enctype="multipart/form-data" class="form bcard-form">
      ${csrf(req)}
      ${field('Headline', html`<input name="title" maxlength="80" value="${x.title}" placeholder="e.g. Diwali offers in your city">`)}
      ${field('Small text', html`<input name="subtitle" maxlength="160" value="${x.subtitle}">`)}
      <div class="row2">
        ${field('Button text', html`<input name="button" maxlength="30" value="${x.button}" placeholder="e.g. Post your ad">`)}
        ${field('Button opens', html`<input name="link" maxlength="300" value="${x.link}" placeholder="/client/register">`, 'A page of this site like /?cat=vehicles, or a full https:// link')}
      </div>
      <div class="row3">
        ${field('Colour', html`<select name="theme">${THEMES.map((t) => html`<option value="${t}" ${t === x.theme ? 'selected' : ''}>${THEME_LABELS[t]}</option>`)}</select>`)}
        ${field('Built-in photo', html`<select name="photo">${Ph.list().map((n) => html`<option value="${n}" ${n === (x.photo || Ph.BANNER_DEFAULTS[i % Ph.BANNER_DEFAULTS.length]) ? 'selected' : ''}>${Ph.label(n)}</option>`)}</select>`, 'Used when you have not uploaded your own picture')}
        <label class="field"><span class="label">Show on site</span><span class="switch-row"><input type="checkbox" class="switch" name="active" value="1" ${x.active ? 'checked' : ''}> ${x.active ? 'On' : 'Off'}</span></label>
      </div>
      ${field('Your own picture (optional)', html`<input type="file" name="image" accept="image/jpeg,image/png,image/webp" data-max-mb="4" data-max-px="2000">`, 'Wide photo, about 1600 × 500 pixels, max 4 MB. The text is shown on its left side.')}
      ${x.image ? html`<label class="check"><input type="checkbox" name="remove_image" value="1"> <span>Remove my picture and use the built-in photo</span></label>` : ''}
      <div class="bcard-actions">
        <button class="btn btn-primary">${icon('check', { size: 16 })} Save banner</button>
        <span class="bcard-tools">
          <button class="icon-btn" formaction="/admin/home/slides/${i}/move?dir=up" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">${icon('arrowUp', { size: 16 })}</button>
          <button class="icon-btn" formaction="/admin/home/slides/${i}/move?dir=down" ${i === n - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">${icon('arrowDown', { size: 16 })}</button>
          <button class="icon-btn danger" formaction="/admin/home/slides/${i}/delete" data-confirm="Delete this banner?" title="Delete" aria-label="Delete banner">${icon('trash', { size: 16 })}</button>
        </span>
      </div>
    </form>
    </details>
  </article>`;

  const sw = (name, label, on) => html`<label class="check switch-line"><input type="checkbox" class="switch" name="${name}" value="1" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  return html`
  <div class="page-head">
    <div><h1>Home page</h1><p class="muted">Change what visitors see on the front page. Changes show straight away.</p></div>
    <a class="btn" href="/" target="_blank">${icon('eye', { size: 16 })} Open home page</a>
  </div>
  <div data-tab-scope>
    <div class="tabs" data-tabs data-tabs-hash role="tablist">
      <button type="button" class="tab active" data-tab="banners">${icon('image', { size: 16 })} Banners <span class="pill pill-muted">${cfg.slides.length}</span></button>
      <button type="button" class="tab" data-tab="sections">${icon('layers', { size: 16 })} Sections & texts</button>
    </div>

    <div class="tab-panel" data-panel="banners">
      <div class="section-head" style="align-items:center"><p class="muted small" style="margin:0">Banners slide by themselves every 5 seconds at the top of the home page. Up to 8.</p>
</div>
      <div class="bgrid">${cfg.slides.map((x, i) => slideCard(x, i, cfg.slides.length))}
        ${cfg.slides.length < 8 ? html`<form method="post" action="/admin/home/slides/add" class="bcard bcard-add">${csrf(req)}<button class="btn btn-lg">${icon('plus', { size: 20 })} Add a banner</button></form>` : ''}
      </div>
    </div>

    <div class="tab-panel" data-panel="sections" hidden>
      <form method="post" action="/admin/home/content" class="card form narrow-ish">
        ${csrf(req)}
        <h2>Sections</h2>
        <div class="switch-list">
          ${sw('show_globe', '3D ad showcase with the moving globe (top of the page)', cfg.show.globe)}
          ${sw('show_top', 'Put TOP ads first in the showcase', cfg.show.top)}
          ${sw('show_sell', '"Have something to sell?" band', cfg.show.sell)}
        </div>
        <h2>Texts</h2>
        <div class="row2">
          ${field('Showcase heading', html`<input name="globe_title" maxlength="80" value="${cfg.globe_title}">`)}
          ${field('Text when no paid ads yet', html`<input name="globe_text" maxlength="200" value="${cfg.globe_text}">`)}
        </div>
        ${field('Notice bar at the very top (optional)', html`<input name="announcement" maxlength="160" value="${cfg.announcement}" placeholder="e.g. 🎉 Post your first ad this week and get 2 extra days">`, 'Leave empty to hide the bar')}
        <div class="row2">
          ${field('Ads grid heading', html`<input name="fresh_title" maxlength="60" value="${cfg.fresh_title}">`)}
        </div>
        <div class="row2">
          ${field('Sell band heading', html`<input name="sell_title" maxlength="60" value="${cfg.sell_title}">`)}
          ${field('Sell band text', html`<input name="sell_text" maxlength="160" value="${cfg.sell_text}">`)}
        </div>
        ${field('Globe cities', html`<textarea name="cities" rows="2" maxlength="600">${cfg.cities}</textarea>`, 'Separate with commas. These light up on the globe.')}
        ${field('Footer: about the site', html`<textarea name="footer_about" rows="2" maxlength="300">${cfg.footer_about}</textarea>`)}
        <button class="btn btn-primary">${icon('check', { size: 16 })} Save sections & texts</button>
      </form>
    </div>
  </div>`;
}

function register(app, { requireAdmin, page }) {
  const idx = (req, cfg) => { const i = parseInt(req.params.i, 10); return Number.isInteger(i) && i >= 0 && i < cfg.slides.length ? i : -1; };

  app.get('/admin/home', requireAdmin, (req, res) => res.html(page(req, 'Home page', view(req, getHome()))));

  app.post('/admin/home/slides/add', requireAdmin, (req, res) => {
    const cfg = getHome();
    if (cfg.slides.length < 8) cfg.slides.push({ title: 'New banner', subtitle: '', button: 'Post your ad', link: '/client/register', theme: 'peacock', photo: 'people-man-cafe', image: '', active: false });
    saveHome(cfg);
    req.flash('success', 'Banner added. It is hidden until you switch "Show on site" on and save.');
    res.redirect('/admin/home#banners');
  });

  app.post('/admin/home/slides/:i', requireAdmin, (req, res) => {
    const cfg = getHome(); const i = idx(req, cfg);
    if (i < 0) { res.redirect('/admin/home'); return; }
    const b = req.body; const x = cfg.slides[i];
    x.title = V.str(b.title, 80); x.subtitle = V.str(b.subtitle, 160); x.button = V.str(b.button, 30);
    const link = String(b.link || '').trim();
    if (link && !safeLink(link)) { req.flash('error', 'The button link must start with / (a page of this site) or https://'); res.redirect('/admin/home#banners'); return; }
    x.link = safeLink(link); x.theme = THEMES.includes(b.theme) ? b.theme : 'peacock'; if (Ph.exists(String(b.photo || '').replace(/[^a-z0-9-]/g, ''))) x.photo = String(b.photo).replace(/[^a-z0-9-]/g, ''); x.active = b.active === '1';
    if (b.remove_image === '1' && x.image) { removeFile('ads', x.image); x.image = ''; }
    const file = req.files && req.files.image && req.files.image[0];
    if (file && file.data && file.data.length) {
      try {
        const name = saveUpload(file, 'ads', { maxMb: 4 });
        if (x.image) removeFile('ads', x.image);
        x.image = name;
      } catch (e) { if (e instanceof UploadError) { req.flash('error', e.message); res.redirect('/admin/home#banners'); return; } throw e; }
    }
    if (x.active && !x.title && !x.image) { req.flash('error', 'Add a headline or a picture before showing this banner.'); res.redirect('/admin/home#banners'); return; }
    saveHome(cfg);
    req.flash('success', `Banner ${i + 1} saved${x.active ? '' : ' (hidden)'}.`);
    res.redirect('/admin/home#banners');
  });

  app.post('/admin/home/slides/:i/move', requireAdmin, (req, res) => {
    const cfg = getHome(); const i = idx(req, cfg);
    const j = req.query.dir === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < cfg.slides.length) { [cfg.slides[i], cfg.slides[j]] = [cfg.slides[j], cfg.slides[i]]; saveHome(cfg); }
    res.redirect('/admin/home#banners');
  });

  app.post('/admin/home/slides/:i/delete', requireAdmin, (req, res) => {
    const cfg = getHome(); const i = idx(req, cfg);
    if (i >= 0) { const [gone] = cfg.slides.splice(i, 1); if (gone.image) removeFile('ads', gone.image); saveHome(cfg); req.flash('success', 'Banner deleted.'); }
    res.redirect('/admin/home#banners');
  });

  app.post('/admin/home/content', requireAdmin, (req, res) => {
    const cfg = getHome(); const b = req.body;
    cfg.announcement = V.str(b.announcement, 160);
    cfg.top_title = V.str(b.top_title, 60) || 'TOP ads';
    cfg.fresh_title = V.str(b.fresh_title, 60) || 'Fresh recommendations';
    cfg.sell_title = V.str(b.sell_title, 60) || 'Have something to sell?';
    cfg.sell_text = V.str(b.sell_text, 160);
    cfg.cities = V.str(b.cities, 600);
    cfg.footer_about = V.str(b.footer_about, 300);
    cfg.globe_title = V.str(b.globe_title, 80) || 'Buy and sell anything, anywhere.';
    cfg.globe_text = V.str(b.globe_text, 200);
    cfg.show = { globe: b.show_globe === '1', categories: false, top: b.show_top === '1', cities: false, sell: b.show_sell === '1' };
    saveHome(cfg);
    req.flash('success', 'Home page saved.');
    res.redirect('/admin/home#sections');
  });
}

module.exports = { register };
