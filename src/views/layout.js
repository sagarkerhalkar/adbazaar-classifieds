'use strict';
const { html, raw } = require('../lib/html');

function flashes(req) {
  const list = req.takeFlash ? req.takeFlash() : [];
  if (!list.length) return '';
  return html`<div class="flashes">${list.map((f) => html`<div class="flash flash-${f.type}" role="status">${f.msg}</div>`)}</div>`;
}

function publicNav(req) {
  return html`
    <a href="/" class="nav-link">Browse</a>
    ${req.seller
      ? html`<a href="/client" class="nav-link">My ads</a><a href="/client/ads/new" class="btn btn-accent">+ Post ad</a>`
      : html`<a href="/client/login" class="nav-link">Seller login</a><a href="/client/register" class="btn btn-accent">+ Post your ad</a>`}`;
}

function clientNav(req) {
  return html`
    <a href="/" class="nav-link">View site</a>
    <a href="/client" class="nav-link">My ads</a>
    <a href="/client/payments" class="nav-link">Payments</a>
    <a href="/client/account" class="nav-link">Account</a>
    <a href="/client/ads/new" class="btn btn-accent">+ Post ad</a>
    <form method="post" action="/client/logout" class="inline"><input type="hidden" name="_csrf" value="${req.csrfToken}"><button class="btn btn-ghost">Logout</button></form>`;
}

function adminNav(req, counts = {}) {
  const badge = (n) => (n ? html`<span class="badge-count">${n}</span>` : '');
  return html`
    <a href="/admin" class="nav-link">Dashboard</a>
    <a href="/admin/clients" class="nav-link">Clients ${badge(counts.kyc)}</a>
    <a href="/admin/payments" class="nav-link">Payments ${badge(counts.pay)}</a>
    <a href="/admin/ads" class="nav-link">Ads</a>
    <a href="/admin/categories" class="nav-link">Categories</a>
    <a href="/admin/reports" class="nav-link">Reports ${badge(counts.reports)}</a>
    <a href="/admin/messages" class="nav-link">Messages</a>
    <a href="/admin/settings" class="nav-link">Settings</a>
    <form method="post" action="/admin/logout" class="inline"><input type="hidden" name="_csrf" value="${req.csrfToken}"><button class="btn btn-ghost">Logout</button></form>`;
}

function renderPage(req, { title, body, portal = 'public', scripts = [], description }) {
  const s = req.settings || { site_name: 'AdBazaar' };
  let nav = '';
  if (portal === 'client') nav = clientNav(req);
  else if (portal === 'admin') nav = req.admin ? adminNav(req, req.adminCounts) : '';
  else nav = publicNav(req);
  const homeHref = portal === 'admin' && req.admin ? '/admin' : '/';

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ` : ''}${s.site_name}</title>
<meta name="description" content="${description || s.tagline || ''}">
<meta name="csrf-token" content="${req.csrfToken || ''}">
<link rel="icon" href="/public/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/public/css/style.css">
</head>
<body class="portal-${portal}">
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="logo" href="${homeHref}"><span class="logo-mark">A</span><span>${s.site_name}</span>${portal === 'admin' ? html`<span class="logo-tag">Admin</span>` : ''}${portal === 'client' ? html`<span class="logo-tag">Seller</span>` : ''}</a>
    <button class="nav-toggle" aria-label="Menu" data-toggle-nav>☰</button>
    <nav class="nav">${nav}</nav>
  </div>
</header>
<main class="wrap main">
${flashes(req)}
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <div>© ${new Date().getFullYear()} ${s.site_name}. All sellers are identity-verified.</div>
    <div class="footer-links"><a href="/terms">Terms</a><a href="/safety">Safety tips</a>${s.support_phone ? html`<span>Support: ${s.support_phone}</span>` : ''}</div>
  </div>
</footer>
<script src="/public/js/app.js"></script>
${scripts.map((src) => html`<script src="${src}"></script>`)}
</body>
</html>`;
}

function renderError(req, status, title, message) {
  const body = html`<section class="card narrow center"><div class="error-code">${status}</div><h1>${title}</h1><p class="muted">${message}</p><p><a class="btn" href="/">Go to homepage</a></p></section>`;
  try { return renderPage(req, { title, body, portal: req.path?.startsWith('/admin') ? 'admin' : 'public' }); } catch { return raw(`<h1>${status}</h1>`); }
}

module.exports = { renderPage, renderError };
