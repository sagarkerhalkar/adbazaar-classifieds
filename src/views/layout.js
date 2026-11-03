'use strict';
const { html, raw } = require('../lib/html');
const { assetUrl } = require('../lib/files');
const { icon } = require('./icons');

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
        ${req.seller
    ? html`<a href="/client" class="hlink">${icon('user')}<span>My ads</span></a>`
    : html`<a href="/client/login" class="hlink">${icon('user')}<span>Login</span></a>`}
        <a href="${req.seller ? '/client/ads/new' : '/client/register'}" class="btn btn-sell">${icon('plus', { size: 18 })}<span>Post ad</span></a>
      </nav>
    </div>
  </header>`;
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
  const badge = (n) => (n ? html`<span class="badge-count">${n}</span>` : '');
  const item = (href, ic, label, n) => {
    const active = href === '/admin' ? req.path === '/admin' : req.path.startsWith(href);
    return html`<a href="${href}" class="side-link ${active ? 'active' : ''}">${icon(ic)}<span>${label}</span>${badge(n)}</a>`;
  };
  return html`
  <aside class="sidebar" data-sidebar>
    <a class="logo" href="/admin"><span class="logo-mark">${icon('tag', { size: 18 })}</span><span class="logo-text">${s.site_name}</span></a>
    <nav class="side-nav">
      ${item('/admin', 'grid', 'Dashboard')}
      ${item('/admin/clients', 'users', 'Clients', counts.kyc)}
      ${item('/admin/payments', 'card', 'Payments', counts.pay)}
      ${item('/admin/ads', 'layers', 'Ads')}
      ${item('/admin/categories', 'tag', 'Categories')}
      ${item('/admin/reports', 'chart', 'Reports', counts.reports)}
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
<body class="portal-admin shell">
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

  return html`${head(req, s, title, description)}
<body class="portal-${portal}">
${header}
<main class="wrap main">
${flashes(req)}
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <div class="footer-brand"><span class="logo-mark sm">${icon('tag', { size: 14 })}</span> ${s.site_name}<span class="muted">Happy buying, happy selling.</span></div>
    <div class="footer-links"><a href="/terms">Terms</a><a href="/safety">Safety tips</a><a href="/client/register">Sell on ${s.site_name}</a>${s.support_phone ? html`<span>${icon('phone', { size: 14 })} ${s.support_phone}</span>` : ''}</div>
  </div>
</footer>
${scriptsHtml(scripts)}
</body>
</html>`;
}

function renderError(req, status, title, message) {
  const body = html`<section class="card narrow center"><div class="error-code">${status}</div><h1>${title}</h1><p class="muted">${message}</p><p><a class="btn btn-primary" href="/">Go to homepage</a></p></section>`;
  try { return renderPage(req, { title, body, portal: req.path?.startsWith('/admin') ? 'admin' : 'public' }); } catch { return raw(`<h1>${status}</h1>`); }
}

module.exports = { renderPage, renderError };
