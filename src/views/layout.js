'use strict';
const Brand = require('../brand');
const { html, raw } = require('../lib/html');
const { assetUrl } = require('../lib/files');
const { icon } = require('./icons');
const Cat = require('../categories');
const { getHome, cityList } = require('../homeconfig');

// The brand mark: the owner's uploaded logo, or the tag symbol (Admin → Settings → Staff & brand).
const logoMark = (s, size = '') => (s.brand_logo
  ? html`<img class="logo-img ${size}" src="/media/ads/${s.brand_logo}" alt="">`
  : html`<span class="logo-mark ${size}">${icon('tag', { size: size === 'sm' ? 14 : 18 })}</span>`);

function flashes(req) {
  const list = req.takeFlash ? req.takeFlash() : [];
  if (!list.length) return '';
  return html`<div class="flashes" data-flashes>${list.map((f) => html`<div class="flash flash-${f.type}" role="status">${icon(f.type === 'error' ? 'x' : f.type === 'success' ? 'check' : 'bolt', { size: 18 })}<span>${f.msg}</span><button type="button" class="flash-close" aria-label="Close" data-flash-close>${icon('x', { size: 14 })}</button></div>`)}</div>`;
}

const csrfInput = (req) => html`<input type="hidden" name="_csrf" value="${req.csrfToken}">`;

// ---- Public header: logo · search · actions (marketplace style) ----
function publicHeader(req, s) {
  const q = req.query || {};
  return html`
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a class="logo" href="/" aria-label="${s.site_name} home">${logoMark(s)}<span class="logo-text">${s.site_name}</span></a>
      <form class="hsearch" method="get" action="/" role="search">
        <input type="search" name="q" value="${req.path === '/' ? q.q : ''}" placeholder="Search phones, cars, tuition, repairs…" aria-label="Search">
        <input name="city" value="${req.path === '/' ? q.city : ''}" list="cities-h" placeholder="All India" aria-label="City" class="hsearch-city">
        <datalist id="cities-h">${['Mumbai', 'Pune', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Nagpur', 'Nashik', 'Surat'].map((c) => html`<option value="${c}">`)}</datalist>
        ${req.path === '/' && q.cat ? html`<input type="hidden" name="cat" value="${q.cat}">` : ''}
        <button class="hsearch-go" aria-label="Search">${icon('search', { size: 20 })}</button>
      </form>
      <nav class="hactions">
        <a href="/saved" class="hlink" data-saved-link>${icon('heart')}<span>Saved</span><span class="badge-count" data-saved-count hidden></span></a>
        ${req.seller
    ? html`<a href="/client/messages" class="hlink" aria-label="Messages">${icon('bell')}<span class="badge-count" data-live="unread" ${req.sellerUnread ? '' : 'hidden'}>${req.sellerUnread || 0}</span></a><a href="/client" class="hlink">${icon('user')}<span>My ads</span></a>`
    : html`<a href="/client/login" class="hlink">${icon('user')}<span>Login</span></a>`}
        <a href="${req.seller ? '/client/ads/new' : '/post'}" class="btn btn-sell">${icon('plus', { size: 18 })}<span>Post ad</span></a>
      </nav>
    </div>
  </header>
  ${catBar(req)}`;
}

// ---- Category bar under the public header (OLX style) ----
function catBar(req) {
  let cats = [];
  try { cats = Cat.tree(); } catch { return ''; }
  const cur = req.path === '/' ? String((req.query || {}).cat || '') : '';
  const isActive = (c) => cur === c.slug || c.subs.some((sc) => sc.slug === cur);
  return html`<nav class="catbar" aria-label="Categories"><div class="wrap catbar-inner">
    <details class="catbar-all">
      <summary>${icon('grid', { size: 18 })}All categories ${icon('down', { size: 16 })}</summary>
      <div class="megamenu">${cats.map((c) => html`<div class="mm-col"><a class="mm-main" href="/?cat=${c.slug}">${c.name}</a>${c.subs.map((sc) => html`<a href="/?cat=${sc.slug}">${sc.name}</a>`)}</div>`)}</div>
    </details>
    ${cats.slice(0, 8).map((c) => html`<a class="catbar-link ${isActive(c) ? 'active' : ''}" href="/?cat=${c.slug}">${c.name}</a>`)}
  </div></nav>`;
}

// ---- Seller (client) header ----
function clientHeader(req, s) {
  const on = (p) => (req.path === p || (p !== '/client' && req.path.startsWith(p)) ? 'active' : '');
  return html`
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a class="logo" href="/">${logoMark(s)}<span class="logo-text">${s.site_name}</span><span class="logo-tag">Seller</span></a>
      <button class="nav-toggle" aria-label="Menu" data-toggle-nav>${icon('menu')}</button>
      <nav class="nav">
        <a href="/client" class="nav-link ${on('/client')}">${icon('list')}My ads</a>
        <a href="/client/payments" class="nav-link ${on('/client/payments')}">${icon('card')}Payments</a>
        <a href="/client/wallet" class="nav-link ${on('/client/wallet')}">${icon('tag')}Balance</a>
        <a href="/client/messages" class="nav-link ${on('/client/messages')}" aria-label="Messages${req.sellerUnread ? ` (${req.sellerUnread} new)` : ''}">${icon('bell')}Messages<span class="badge-count" data-live="unread" ${req.sellerUnread ? '' : 'hidden'}>${req.sellerUnread || 0}</span></a>
        <a href="/client/account" class="nav-link ${on('/client/account')}">${icon('user')}Account</a>
        <a href="/" class="nav-link">${icon('home')}View site</a>
        <a href="/client/ads/new" class="btn btn-sell">${icon('plus', { size: 18 })}Post ad</a>
        <form method="post" action="/client/logout" class="inline">${csrfInput(req)}<button class="btn btn-ghost btn-sm">${icon('logout', { size: 16 })}Logout</button></form>
      </nav>
    </div>
  </header>`;
}

// ---- Admin: side menu ----
function adminSidebar(req, s, counts = {}) {
  // Only the pages this login may open (owner: all; staff: what their role allows — see src/staff.js)
  const can = (perm) => !!(req.admin && (req.admin.owner || perm === 'any' || (perm !== 'owner' && req.admin.perms && req.admin.perms.has(perm))));
  const badge = (n, key) => (key ? html`<span class="badge-count" data-live="${key}" ${n ? '' : 'hidden'}>${n || 0}</span>` : n ? html`<span class="badge-count">${n}</span>` : '');
  const item = (href, ic, label, n, key) => {
    const active = href === '/admin' ? req.path === '/admin' : req.path.startsWith(href);
    return html`<a href="${href}" class="side-link ${active ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badge(n, key)}</a>`;
  };
  return html`
  <aside class="sidebar" data-sidebar>
    <a class="logo" href="/admin">${logoMark(s)}<span class="logo-text">${s.site_name}</span></a>
    ${req.admin ? html`<div class="side-me"><span class="avatar sm">${String(req.admin.name || '?').slice(0, 1)}</span><span><strong>${req.admin.name}</strong><span class="small">${req.admin.roleName || ''}</span></span></div>` : ''}
    <nav class="side-nav">
      ${can('any') ? item('/admin', 'grid', 'Dashboard') : ''}
      ${can('sellers') ? item('/admin/clients', 'users', 'Clients', counts.kyc, 'kyc') : ''}
      ${can('payments') ? item('/admin/payments', 'card', can('money') ? 'Payments' : 'Payments to confirm', counts.pay, 'pay') : ''}
      ${can('ads') ? item('/admin/ads', 'layers', 'Ads', counts.free, 'free') : ''}
      ${can('categories') ? item('/admin/categories', 'tag', 'Categories') : ''}
      ${can('home') ? item('/admin/home', 'home', 'Home page') : ''}
      ${can('sponsors') ? item('/admin/sponsors', 'bolt', 'Sponsors') : ''}
      ${can('reports') ? item('/admin/reports', 'chart', 'Reports', counts.reports, 'reports') : ''}
      ${can('messages') ? item('/admin/messages', 'mail', 'Messages') : ''}
      ${can('settings') || can('owner') ? item('/admin/settings', 'settings', 'Settings') : ''}
      ${item('/admin/account', 'user', 'My login')}
    </nav>
    <div class="side-foot">
      <a href="/" class="side-link" target="_blank">${icon('eye')}<span>View site</span></a>
      <form method="post" action="/admin/logout">${csrfInput(req)}<button class="side-link">${icon('logout')}<span>Logout</span></button></form>
    </div>
  </aside>`;
}

function head(req, s, title, description) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${Brand.theme(s).main}">
<title>${title ? `${title} · ` : ''}${s.site_name}</title>
<meta name="description" content="${description || s.tagline || ''}">
<meta name="csrf-token" content="${req.csrfToken || ''}">
<link rel="icon" href="/public/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${assetUrl('/public/css/style.css')}">
${Brand.themeCss(s) ? html`<style>${raw(Brand.themeCss(s))}</style>` : ''}
</head>`;
}

function scriptsHtml(scripts) {
  return html`<script src="${assetUrl('/public/js/app.js')}"></script>
${scripts.map((src) => html`<script src="${assetUrl(src)}"></script>`)}`;
}

function renderPage(req, { title, body, portal = 'public', scripts = [], description }) {
  const s = req.settings || { site_name: 'AdBazaar' };

  // Admin pages (logged in): app shell with a side menu.
  if (portal === 'admin' && req.admin) {
    return html`${head(req, s, title, description)}
<body class="portal-admin shell" data-live-url="/admin/live">
${adminSidebar(req, s, req.adminCounts)}
<div class="shell-main">
  <header class="shell-top">
    <button class="nav-toggle" aria-label="Menu" data-toggle-sidebar>${icon('menu')}</button>
    <div class="shell-title">${title || 'Dashboard'}</div>
    <div class="shell-user">${icon('user', { size: 18 })}<span>${req.admin.name}</span></div>
  </header>
  <main class="shell-content">
${flashes(req)}
${body}
  </main>
</div>
${scriptsHtml(scripts)}
</body>
</html>`;
  }

  const header = portal === 'client' ? clientHeader(req, s) : portal === 'admin'
    ? html`<header class="topbar"><div class="wrap topbar-inner"><a class="logo" href="/">${logoMark(s)}<span class="logo-text">${s.site_name}</span><span class="logo-tag">Admin</span></a></div></header>`
    : publicHeader(req, s);

  const home = getHome(s);
  return html`${head(req, s, title, description)}
<body class="portal-${portal}">
${portal === 'public' && home.announcement ? html`<div class="announce">${home.announcement}</div>` : ''}
${header}
<main class="wrap main">
${flashes(req)}
${body}
</main>
${portal === 'public' ? bigFooter(req, s, home) : html`<footer class="footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">${logoMark(s, 'sm')} ${s.site_name}<span class="muted">Happy buying, happy selling.</span></div>
    <div class="footer-links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund-policy">Refunds</a><a href="/contact">Contact</a><a href="/">View site</a></div>
  </div>
</footer>`}
${scriptsHtml(scripts)}
</body>
</html>`;
}

function bigFooter(req, s, home) {
  let cats = [];
  try { cats = Cat.tree().slice(0, 8); } catch { /* ignore */ }
  // Compact footer: brand row + three short link rows + one line of legal text.
  return html`<footer class="bigfooter compact">
  <div class="wrap bf-top">
    <div class="bf-brand">
      <a class="logo" href="/">${logoMark(s)}<span class="logo-text">${s.site_name}</span></a>
      <span class="bf-about">${home.footer_about}</span>
      ${s.support_phone || s.support_email ? html`<span class="bf-contact">${s.support_phone ? html`<a href="tel:${s.support_phone}">${icon('phone', { size: 14 })} ${s.support_phone}</a>` : ''}${s.support_email ? html`<a href="mailto:${s.support_email}">${icon('mail', { size: 14 })} ${s.support_email}</a>` : ''}</span>` : ''}
    </div>
    <a class="btn btn-sell bf-sell" href="${req.seller ? '/client/ads/new' : '/post'}">${icon('plus', { size: 16 })} Post your ad</a>
  </div>
  <div class="wrap bf-rows">
    <nav class="bf-row" aria-label="Categories"><strong>Categories</strong>${cats.slice(0, 6).map((c) => html`<a href="/?cat=${c.slug}">${c.name}</a>`)}</nav>
    <nav class="bf-row" aria-label="Cities"><strong>Cities</strong>${cityList(home).slice(0, 8).map((c) => html`<a href="/?city=${encodeURIComponent(c)}">${c}</a>`)}</nav>
    <nav class="bf-row" aria-label="Help"><strong>Help</strong><a href="/about">About</a><a href="/contact">Contact</a><a href="/pricing">Pricing</a><a href="/safety">Safety tips</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund-policy">Refunds</a><a href="/advertise">Advertise with us</a></nav>
  </div>
  <div class="bf-bottom"><div class="wrap">© ${new Date().getFullYear()} ${s.site_name}. Ads are published by advertisers under their sole responsibility; ${s.site_name} only provides publication and browsing and is not responsible for any deal, payment or fraud between users. Using this site means you accept the <a href="/terms">Terms</a>.</div></div>
</footer>`;
}

function renderError(req, status, title, message) {
  const body = html`<section class="card narrow center"><div class="error-code">${status}</div><h1>${title}</h1><p class="muted">${message}</p><p><a class="btn btn-primary" href="/">Go to homepage</a></p></section>`;
  try { return renderPage(req, { title, body, portal: req.path?.startsWith('/admin') ? 'admin' : 'public' }); } catch { return raw(`<h1>${status}</h1>`); }
}

module.exports = { renderPage, renderError };
