'use strict';
const { html, raw } = require('../lib/html');
const { assetUrl } = require('../lib/files');
const { icon } = require('./icons');
const Cat = require('../categories');
const { getHome, cityList } = require('../homeconfig');

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
      <a class="logo" href="/" aria-label="${s.site_name} home"><span class="logo-mark">${icon('tag', { size: 18 })}</span><span class="logo-text">${s.site_name}</span></a>
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
      <div class="megamenu">${cats.map((c) => html`<div class="mm-col"><a class="mm-main" href="/?cat=${c.slug}">${c.icon} ${c.name}</a>${c.subs.map((sc) => html`<a href="/?cat=${sc.slug}">${sc.name}</a>`)}</div>`)}</div>
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
      <a class="logo" href="/"><span class="logo-mark">${icon('tag', { size: 18 })}</span><span class="logo-text">${s.site_name}</span><span class="logo-tag">Seller</span></a>
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
  const badge = (n, key) => (key ? html`<span class="badge-count" data-live="${key}" ${n ? '' : 'hidden'}>${n || 0}</span>` : n ? html`<span class="badge-count">${n}</span>` : '');
  const item = (href, ic, label, n, key) => {
    const active = href === '/admin' ? req.path === '/admin' : req.path.startsWith(href);
    return html`<a href="${href}" class="side-link ${active ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badge(n, key)}</a>`;
  };
  return html`
  <aside class="sidebar" data-sidebar>
    <a class="logo" href="/admin"><span class="logo-mark">${icon('tag', { size: 18 })}</span><span class="logo-text">${s.site_name}</span></a>
    <nav class="side-nav">
      ${item('/admin', 'grid', 'Dashboard')}
      ${item('/admin/clients', 'users', 'Clients', counts.kyc, 'kyc')}
      ${item('/admin/payments', 'card', 'Payments', counts.pay, 'pay')}
      ${item('/admin/ads', 'layers', 'Ads')}
      ${item('/admin/categories', 'tag', 'Categories')}
      ${item('/admin/home', 'home', 'Home page')}
      ${item('/admin/sponsors', 'bolt', 'Sponsors')}
      ${item('/admin/reports', 'chart', 'Reports', counts.reports, 'reports')}
      ${item('/admin/messages', 'mail', 'Messages')}
      ${item('/admin/settings', 'settings', 'Settings')}
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
<meta name="theme-color" content="#0a4d68">
<title>${title ? `${title} · ` : ''}${s.site_name}</title>
<meta name="description" content="${description || s.tagline || ''}">
<meta name="csrf-token" content="${req.csrfToken || ''}">
<link rel="icon" href="/public/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${assetUrl('/public/css/style.css')}">
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
    ? html`<header class="topbar"><div class="wrap topbar-inner"><a class="logo" href="/"><span class="logo-mark">${icon('tag', { size: 18 })}</span><span class="logo-text">${s.site_name}</span><span class="logo-tag">Admin</span></a></div></header>`
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
    <div class="footer-brand"><span class="logo-mark sm">${icon('tag', { size: 14 })}</span> ${s.site_name}<span class="muted">Happy buying, happy selling.</span></div>
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
  return html`<footer class="bigfooter">
  <div class="wrap bigfooter-grid">
    <div class="bf-brand">
      <a class="logo" href="/"><span class="logo-mark">${icon('tag', { size: 18 })}</span><span class="logo-text">${s.site_name}</span></a>
      <p>${home.footer_about}</p>
      ${s.support_phone || s.support_email ? html`<p class="bf-contact">${s.support_phone ? html`<span>${icon('phone', { size: 15 })} ${s.support_phone}</span>` : ''}${s.support_email ? html`<span>${icon('mail', { size: 15 })} ${s.support_email}</span>` : ''}</p>` : ''}
    </div>
    <div><h4>Popular categories</h4>${cats.map((c) => html`<a href="/?cat=${c.slug}">${c.name}</a>`)}</div>
    <div><h4>Popular cities</h4>${cityList(home).slice(0, 8).map((c) => html`<a href="/?city=${encodeURIComponent(c)}">${c}</a>`)}</div>
    <div><h4>Help & policies</h4><a href="/about">About us</a><a href="/contact">Contact & grievances</a><a href="/pricing">Pricing</a><a href="/safety">Safety tips</a><a href="/terms">Terms of use</a><a href="/privacy">Privacy policy</a><a href="/refund-policy">Refund & cancellation</a><a href="/client/register">Sell on ${s.site_name}</a><a href="/client/login">Seller login</a><a href="/saved">Saved ads</a></div>
  </div>
  <div class="bf-bottom"><div class="wrap">© ${new Date().getFullYear()} ${s.site_name}. All rights reserved. By using this website you accept our <a href="/terms">Terms of use</a>. Ads are published by advertisers on their own initiative and under their sole responsibility; ${s.site_name} only provides publication and browsing services and does not mediate between users. <a href="/advertise">Advertise with us</a></div></div>
</footer>`;
}

function renderError(req, status, title, message) {
  const body = html`<section class="card narrow center"><div class="error-code">${status}</div><h1>${title}</h1><p class="muted">${message}</p><p><a class="btn btn-primary" href="/">Go to homepage</a></p></section>`;
  try { return renderPage(req, { title, body, portal: req.path?.startsWith('/admin') ? 'admin' : 'public' }); } catch { return raw(`<h1>${status}</h1>`); }
}

module.exports = { renderPage, renderError };
