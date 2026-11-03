'use strict';
// Admin → Reports: KPIs, charts, rejected sellers, rejected payments, ad reports, all sellers. Every list exports to CSV.

const { db } = require('../db');
const { html, raw, rupees, fmtDate } = require('../lib/html');
const { csrf, pill, adUrl } = require('../views/components');
const { icon } = require('../views/icons');

const DAY = 86400_000;
const RANGES = [7, 30, 90];
const IST = "'+5 hours', '+30 minutes'";
const dayKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// Status colours carry meaning (good / waiting / bad / inactive) and always come with a text label.
const CLIENT_GROUPS = [
  ['Approved', ['approved'], 'var(--ok)'],
  ['Waiting', ['pending', 'video_call', 'unverified'], '#c98a00'],
  ['Rejected', ['rejected'], 'var(--bad)'],
  ['Blocked', ['suspended'], '#8f2a1c'],
  ['Deactivated / deleted', ['deactivated', 'deleted'], '#9aa7b3'],
];
const PAYMENT_GROUPS = [
  ['Confirmed', ['paid'], 'var(--ok)'],
  ['Waiting', ['pending', 'created'], '#c98a00'],
  ['Rejected', ['rejected'], 'var(--bad)'],
  ['Failed', ['failed'], '#9aa7b3'],
];

function load(days) {
  const since = Date.now() - days * DAY;
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const g = (sql, ...a) => db.prepare(sql).get(...a);
  const revRows = q(`SELECT date(confirmed_at/1000, 'unixepoch', ${IST}) AS day, SUM(amount_paise) AS v FROM payments WHERE status = 'paid' AND confirmed_at >= ? GROUP BY day`, since - DAY);
  const newRows = q(`SELECT date(created_at/1000, 'unixepoch', ${IST}) AS day, COUNT(*) AS v FROM clients WHERE created_at >= ? GROUP BY day`, since - DAY);
  const rev = Object.fromEntries(revRows.map((r) => [r.day, r.v]));
  const nw = Object.fromEntries(newRows.map((r) => [r.day, r.v]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) { const d = dayKey(Date.now() - i * DAY); series.push({ day: d, rev: rev[d] || 0, sellers: nw[d] || 0 }); }
  const clientStatus = Object.fromEntries(q('SELECT status, COUNT(*) n FROM clients GROUP BY status').map((r) => [r.status, r.n]));
  const payStatus = Object.fromEntries(q('SELECT status, COUNT(*) n FROM payments WHERE created_at >= ? GROUP BY status', since).map((r) => [r.status, r.n]));
  return {
    days, series, clientStatus, payStatus,
    kpi: {
      revenue: g("SELECT COALESCE(SUM(amount_paise),0) v FROM payments WHERE status = 'paid' AND confirmed_at >= ?", since).v,
      sellers: g('SELECT COUNT(*) v FROM clients WHERE created_at >= ?', since).v,
      rejectedSellers: g("SELECT COUNT(*) v FROM clients WHERE status = 'rejected' AND COALESCE(reviewed_at, created_at) >= ?", since).v,
      rejectedPayments: g("SELECT COUNT(*) v FROM payments WHERE status = 'rejected' AND created_at >= ?", since).v,
      openReports: g('SELECT COUNT(*) v FROM reports WHERE resolved = 0').v,
    },
    rejectedSellers: q(`SELECT c.*, a.name AS reviewer FROM clients c LEFT JOIN admins a ON a.id = c.reviewed_by
      WHERE c.status = 'rejected' AND COALESCE(c.reviewed_at, c.created_at) >= ? ORDER BY COALESCE(c.reviewed_at, c.created_at) DESC LIMIT 500`, since),
    rejectedPayments: q(`SELECT p.*, ad.title AS ad_title, ad.id AS ad_id, c.name AS client_name, c.phone AS client_phone, c.id AS cid, a.name AS reviewer
      FROM payments p JOIN ads ad ON ad.id = p.ad_id JOIN clients c ON c.id = ad.client_id LEFT JOIN admins a ON a.id = p.confirmed_by
      WHERE p.status = 'rejected' AND p.created_at >= ? ORDER BY p.id DESC LIMIT 500`, since),
    adReports: q(`SELECT r.*, a.title AS ad_title, a.status AS ad_status FROM reports r JOIN ads a ON a.id = r.ad_id
      ORDER BY r.resolved, r.id DESC LIMIT 300`),
    sellers: q(`SELECT c.id, c.name, c.business_name, c.phone, c.email, c.city, c.status, c.created_at, c.last_login_at,
      (SELECT COUNT(*) FROM ads WHERE client_id = c.id AND status != 'deleted') AS ads,
      (SELECT COALESCE(SUM(p.amount_paise),0) FROM payments p JOIN ads x ON x.id = p.ad_id WHERE x.client_id = c.id AND p.status = 'paid') AS paid
      FROM clients c WHERE c.status != 'deleted' ORDER BY c.id DESC LIMIT 1000`),
  };
}

// ---------- charts (server-rendered SVG; app.js adds the hover read-out) ----------
const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function lineChart(series, key, fmt) {
  const W = 640; const H = 180; const L = 8; const R = 8; const T = 14; const B = 24;
  const max = Math.max(1, ...series.map((s) => s[key]));
  const x = (i) => L + (series.length === 1 ? 0 : (i * (W - L - R)) / (series.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`);
  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  const data = series.map((s) => ({ l: shortDay(s.day), v: fmt(s[key]) }));
  return html`<div class="linechart" data-linechart='${JSON.stringify(data)}'>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Line chart">
      <line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"></line>
      <path class="area" d="M${x(0)},${H - B} L${pts.join(' L')} L${x(series.length - 1)},${H - B} Z"></path>
      <path class="line" d="M${pts.join(' L')}" vector-effect="non-scaling-stroke"></path>
    </svg>
    <div class="lc-x">${ticks.map((i) => html`<span>${shortDay(series[i].day)}</span>`)}</div>
    <div class="lc-hair" hidden></div><div class="lc-tip" hidden><b></b><span></span></div>
  </div>`;
}

function barChart(series, key, label) {
  const max = Math.max(1, ...series.map((s) => s[key]));
  const every = Math.ceil(series.length / 10);
  return html`<div class="bars bars-tip">${series.map((s, i) => html`<div class="bar" tabindex="0" data-tip="${shortDay(s.day)} · ${s[key]} ${label}">
    <div style="height:${Math.max(1.5, (s[key] / max) * 100)}%"></div><span>${i % every === 0 ? s.day.slice(8) : ''}</span></div>`)}</div>`;
}

function splitBar(groups, counts) {
  const rows = groups.map(([label, keys, color]) => ({ label, color, n: keys.reduce((t, k) => t + (counts[k] || 0), 0) }));
  const total = rows.reduce((t, r) => t + r.n, 0);
  if (!total) return html`<p class="muted small">Nothing yet.</p>`;
  return html`<div class="split" role="img" aria-label="${rows.map((r) => `${r.label} ${r.n}`).join(', ')}">
      ${rows.filter((r) => r.n).map((r) => html`<i style="width:${(r.n / total) * 100}%;background:${raw(r.color)}" title="${r.label}: ${r.n}"></i>`)}
    </div>
    <div class="legend">${rows.map((r) => html`<span><i style="background:${raw(r.color)}"></i>${r.label} <b>${r.n}</b> <span class="muted">${Math.round((r.n / total) * 100)}%</span></span>`)}</div>`;
}

// ---------- page ----------
function view(req, d) {
  const exp = (kind) => html`<a class="btn btn-sm" href="/admin/reports/export/${kind}?days=${d.days}">${icon('download', { size: 15 })} Download CSV</a>`;
  const empty = (t) => html`<div class="empty center"><div class="empty-icon">✨</div><p class="muted">${t}</p></div>`;
  const k = d.kpi;
  return html`
  <div class="page-head">
    <div><h1>Reports</h1><p class="muted">Sellers, payments and complaints for the selected period.</p></div>
    <div class="seg" role="group" aria-label="Period">${RANGES.map((n) => html`<a class="${n === d.days ? 'active' : ''}" href="/admin/reports?days=${n}">${`Last ${n} days`}</a>`)}</div>
  </div>
  <div class="stats">
    <div class="stat"><span data-count="${Math.round(k.revenue / 100)}" data-prefix="₹">${rupees(k.revenue)}</span>Revenue confirmed</div>
    <div class="stat"><span data-count="${k.sellers}">${k.sellers}</span>New sellers</div>
    <a class="stat stat-link" href="#rejected-sellers"><span data-count="${k.rejectedSellers}">${k.rejectedSellers}</span>Rejected sellers</a>
    <a class="stat stat-link" href="#rejected-payments"><span data-count="${k.rejectedPayments}">${k.rejectedPayments}</span>Rejected payments</a>
    <a class="stat stat-link" href="#ad-reports"><span data-count="${k.openReports}">${k.openReports}</span>Open ad complaints</a>
  </div>

  <div data-tab-scope>
    <div class="tabs" data-tabs data-tabs-hash role="tablist">
      <button type="button" class="tab active" data-tab="overview">${icon('chart', { size: 16 })} Overview</button>
      <button type="button" class="tab" data-tab="rejected-sellers">${icon('users', { size: 16 })} Rejected sellers <span class="pill pill-muted">${d.rejectedSellers.length}</span></button>
      <button type="button" class="tab" data-tab="rejected-payments">${icon('card', { size: 16 })} Rejected payments <span class="pill pill-muted">${d.rejectedPayments.length}</span></button>
      <button type="button" class="tab" data-tab="ad-reports">${icon('flag', { size: 16 })} Ad complaints ${k.openReports ? html`<span class="badge-count">${k.openReports}</span>` : ''}</button>
      <button type="button" class="tab" data-tab="sellers">${icon('user', { size: 16 })} All sellers</button>
    </div>

    <div class="tab-panel" data-panel="overview">
      <div class="chartgrid">
        <section class="chartcard wide">
          <h3>Revenue confirmed</h3><p class="chart-sub">Per day, last ${d.days} days · total ${rupees(k.revenue)}</p>
          ${lineChart(d.series, 'rev', (v) => rupees(v))}
        </section>
        <section class="chartcard">
          <h3>New sellers</h3><p class="chart-sub">Registrations per day · ${k.sellers} in total</p>
          ${barChart(d.series, 'sellers', 'new')}
        </section>
        <section class="chartcard">
          <h3>Sellers by status</h3><p class="chart-sub">All sellers right now</p>
          ${splitBar(CLIENT_GROUPS, d.clientStatus)}
          <h3 style="margin-top:22px">Payments by status</h3><p class="chart-sub">Payments made in the last ${d.days} days</p>
          ${splitBar(PAYMENT_GROUPS, d.payStatus)}
        </section>
      </div>
    </div>

    <div class="tab-panel" data-panel="rejected-sellers" hidden>
      <div class="section-head"><span class="muted small">Sellers whose verification was rejected in the last ${d.days} days.</span>${exp('rejected-sellers')}</div>
      ${d.rejectedSellers.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>Seller</th><th>Contact</th><th>Registered</th><th>Rejected</th><th>Reason</th><th></th></tr></thead>
        <tbody>${d.rejectedSellers.map((c) => html`<tr>
          <td><strong>${c.name}</strong>${c.business_name ? html`<div class="small muted">${c.business_name}</div>` : ''}</td>
          <td>${c.phone}<div class="small muted">${c.email}</div></td>
          <td>${fmtDate(c.created_at)}</td><td>${fmtDate(c.reviewed_at)}${c.reviewer ? html`<div class="small muted">by ${c.reviewer}</div>` : ''}</td>
          <td>${c.admin_note || html`<span class="muted">—</span>`}</td>
          <td><a class="btn btn-sm" href="/admin/clients/${c.id}">Open</a></td></tr>`)}</tbody></table></div>` : html`<div class="card">${empty('No rejected sellers in this period.')}</div>`}
    </div>

    <div class="tab-panel" data-panel="rejected-payments" hidden>
      <div class="section-head"><span class="muted small">Payments you rejected (wrong UTR, amount not received…) in the last ${d.days} days.</span>${exp('rejected-payments')}</div>
      ${d.rejectedPayments.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>#</th><th>Date</th><th>Seller</th><th>Ad</th><th>Amount</th><th>UTR</th><th>Reason</th></tr></thead>
        <tbody>${d.rejectedPayments.map((p) => html`<tr>
          <td>${p.id}</td><td>${fmtDate(p.created_at)}</td>
          <td><a href="/admin/clients/${p.cid}">${p.client_name}</a><div class="small muted">${p.client_phone}</div></td>
          <td><a href="${adUrl({ id: p.ad_id, title: p.ad_title })}" target="_blank">${p.ad_title}</a></td>
          <td>${rupees(p.amount_paise)}</td><td class="mono">${p.utr || '—'}</td>
          <td>${p.admin_note || html`<span class="muted">—</span>`}${p.reviewer ? html`<div class="small muted">by ${p.reviewer}</div>` : ''}</td></tr>`)}</tbody></table></div>` : html`<div class="card">${empty('No rejected payments in this period.')}</div>`}
    </div>

    <div class="tab-panel" data-panel="ad-reports" hidden>
      <div class="section-head"><span class="muted small">Complaints from visitors about ads.</span>${exp('ad-reports')}</div>
      ${d.adReports.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>Date</th><th>Ad</th><th>Reason</th><th>Details</th><th></th></tr></thead>
        <tbody>${d.adReports.map((r) => html`<tr class="${r.resolved ? 'dim' : ''}">
          <td>${fmtDate(r.created_at)}</td><td><a href="${adUrl({ id: r.ad_id, title: r.ad_title })}" target="_blank">${r.ad_title}</a> ${pill(r.ad_status)}</td>
          <td>${r.reason}</td><td>${r.details}</td>
          <td class="actions">${!r.resolved ? html`
            <form method="post" action="/admin/ads/${r.ad_id}/block" class="inline" data-confirm="Block this ad? It disappears from the site.">${csrf(req)}<input type="hidden" name="reason" value="Reported: ${r.reason}"><input type="hidden" name="report_id" value="${r.id}"><button class="btn btn-danger btn-sm">Block ad</button></form>
            <form method="post" action="/admin/reports/${r.id}/resolve" class="inline">${csrf(req)}<button class="btn btn-sm">Dismiss</button></form>` : html`<span class="pill pill-muted">Resolved</span>`}</td></tr>`)}
        </tbody></table></div>` : html`<div class="card">${empty('No complaints. 👍')}</div>`}
    </div>

    <div class="tab-panel" data-panel="sellers" hidden>
      <div class="section-head"><span class="muted small">Every seller with ads and money paid (all time).</span>${exp('sellers')}</div>
      <div class="table-wrap card"><table class="table">
        <thead><tr><th>#</th><th>Seller</th><th>Contact</th><th>City</th><th>Status</th><th>Ads</th><th>Paid</th><th>Joined</th><th>Last login</th></tr></thead>
        <tbody>${d.sellers.map((c) => html`<tr>
          <td>${c.id}</td><td><a href="/admin/clients/${c.id}"><strong>${c.name}</strong></a>${c.business_name ? html`<div class="small muted">${c.business_name}</div>` : ''}</td>
          <td>${c.phone}<div class="small muted">${c.email}</div></td><td>${c.city || '—'}</td><td>${pill(c.status)}</td>
          <td>${c.ads}</td><td>${rupees(c.paid)}</td><td>${fmtDate(c.created_at)}</td><td>${fmtDate(c.last_login_at)}</td></tr>`)}</tbody></table></div>
    </div>
  </div>`;
}

// ---------- CSV ----------
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const day = (ms) => (ms ? fmtDate(ms) : '');
const money = (p) => (Number(p || 0) / 100).toFixed(2);

function csvFor(kind, d) {
  if (kind === 'rejected-sellers') return [['ID', 'Name', 'Business', 'Phone', 'Email', 'City', 'Registered', 'Rejected', 'Rejected by', 'Reason'],
    ...d.rejectedSellers.map((c) => [c.id, c.name, c.business_name, c.phone, c.email, c.city, day(c.created_at), day(c.reviewed_at), c.reviewer, c.admin_note])];
  if (kind === 'rejected-payments') return [['Payment ID', 'Date', 'Seller', 'Phone', 'Ad ID', 'Ad', 'Amount (Rs)', 'Days', 'UTR', 'Reason', 'Rejected by'],
    ...d.rejectedPayments.map((p) => [p.id, day(p.created_at), p.client_name, p.client_phone, p.ad_id, p.ad_title, money(p.amount_paise), p.days, p.utr, p.admin_note, p.reviewer])];
  if (kind === 'ad-reports') return [['Report ID', 'Date', 'Ad ID', 'Ad', 'Ad status', 'Reason', 'Details', 'Resolved'],
    ...d.adReports.map((r) => [r.id, day(r.created_at), r.ad_id, r.ad_title, r.ad_status, r.reason, r.details, r.resolved ? 'yes' : 'no'])];
  if (kind === 'sellers') return [['ID', 'Name', 'Business', 'Phone', 'Email', 'City', 'Status', 'Ads', 'Paid (Rs)', 'Joined', 'Last login'],
    ...d.sellers.map((c) => [c.id, c.name, c.business_name, c.phone, c.email, c.city, c.status, c.ads, money(c.paid), day(c.created_at), day(c.last_login_at)])];
  return null;
}

function register(app, { requireAdmin, page }) {
  const daysOf = (req) => (RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 30);
  app.get('/admin/reports', requireAdmin, (req, res) => res.html(page(req, 'Reports', view(req, load(daysOf(req))))));
  app.get('/admin/reports/export/:kind', requireAdmin, (req, res) => {
    const rows = csvFor(req.params.kind, load(daysOf(req)));
    if (!rows) { res.status(404).send('Not found'); return; }
    res.setHeader('Content-Disposition', `attachment; filename="adbazaar-${req.params.kind}-${dayKey(Date.now())}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`, 'text/csv; charset=utf-8');
  });
}

module.exports = { register };
