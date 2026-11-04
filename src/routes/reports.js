'use strict';
const Staff = require('../staff');
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
  // Money received = ad payments paid in cash (minus the part paid from balance) + confirmed balance top-ups.
  const revRows = q(`SELECT day, SUM(v) v FROM (
      SELECT date(confirmed_at/1000, 'unixepoch', ${IST}) AS day, (amount_paise - wallet_paise) AS v FROM payments WHERE status = 'paid' AND confirmed_at >= ?
      UNION ALL SELECT date(confirmed_at/1000, 'unixepoch', ${IST}), amount_paise FROM wallet_topups WHERE status = 'paid' AND confirmed_at >= ?
    ) GROUP BY day`, since - DAY, since - DAY);
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
      revenue: g("SELECT COALESCE(SUM(amount_paise - wallet_paise),0) v FROM payments WHERE status = 'paid' AND confirmed_at >= ?", since).v
        + g("SELECT COALESCE(SUM(amount_paise),0) v FROM wallet_topups WHERE status = 'paid' AND confirmed_at >= ?", since).v,
      waitingMoney: g("SELECT COALESCE(SUM(amount_paise - wallet_paise),0) v FROM payments WHERE status = 'pending'").v + g("SELECT COALESCE(SUM(amount_paise),0) v FROM wallet_topups WHERE status = 'pending'").v,
      waitingCount: g("SELECT (SELECT COUNT(*) FROM payments WHERE status = 'pending') + (SELECT COUNT(*) FROM wallet_topups WHERE status = 'pending') v").v,
      live: g("SELECT COUNT(*) v FROM ads WHERE status = 'active' AND expires_at > ?", Date.now()).v,
      walletHeld: g("SELECT COALESCE(SUM(wallet_paise),0) v FROM clients WHERE status != 'deleted'").v,
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
    byMethod: q(`SELECT method, COUNT(*) n, SUM(amount_paise - wallet_paise) cash, SUM(wallet_paise) bal FROM payments WHERE status = 'paid' AND confirmed_at >= ? GROUP BY method ORDER BY cash DESC`, since),
    topupsPaid: g("SELECT COUNT(*) n, COALESCE(SUM(amount_paise),0) s FROM wallet_topups WHERE status = 'paid' AND confirmed_at >= ?", since),
    byPlan: q(`SELECT COALESCE(pl.name, p.days || ' days') AS plan, COUNT(*) n, SUM(p.amount_paise) total FROM payments p LEFT JOIN plans pl ON pl.id = p.plan_id
      WHERE p.status = 'paid' AND p.confirmed_at >= ? GROUP BY plan ORDER BY total DESC`, since),
    topSellers: q(`SELECT c.id, c.name, c.business_name, SUM(p.amount_paise) total, COUNT(*) n FROM payments p JOIN clients c ON c.id = p.client_id
      WHERE p.status = 'paid' AND p.confirmed_at >= ? GROUP BY c.id ORDER BY total DESC LIMIT 10`, since),
    paidList: q(`SELECT p.*, c.name AS client_name, a.title AS ad_title FROM payments p JOIN clients c ON c.id = p.client_id JOIN ads a ON a.id = p.ad_id
      WHERE p.status = 'paid' AND p.confirmed_at >= ? ORDER BY p.confirmed_at DESC LIMIT 500`, since),
    liveAds: q(`SELECT a.id, a.title, a.city, a.views, a.expires_at, a.top_slots, a.admin_top_until, a.admin_boost, a.paid_total_paise, a.rank_score, c.name AS client_name, COALESCE(pl.name, '—') AS plan
      FROM ads a JOIN clients c ON c.id = a.client_id LEFT JOIN plans pl ON pl.id = a.plan_id WHERE a.status = 'active' AND a.expires_at > ? ORDER BY a.expires_at LIMIT 500`, Date.now()),
    adStatus: Object.fromEntries(q('SELECT status, COUNT(*) n FROM ads GROUP BY status').map((r) => [r.status, r.n])),
    sellers: q(`SELECT c.id, c.name, c.business_name, c.phone, c.email, c.city, c.status, c.created_at, c.last_login_at,
      (SELECT COUNT(*) FROM ads WHERE client_id = c.id AND status != 'deleted') AS ads,
      (SELECT COALESCE(SUM(p.amount_paise - p.wallet_paise),0) FROM payments p WHERE p.client_id = c.id AND p.status = 'paid')
        + (SELECT COALESCE(SUM(t.amount_paise),0) FROM wallet_topups t WHERE t.client_id = c.id AND t.status = 'paid') AS paid,
      c.wallet_paise AS wallet
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
  const empty = (t) => html`<div class="empty center"><div class="empty-icon">${icon('chart', { size: 26 })}</div><p class="muted">${t}</p></div>`;
  const k = d.kpi;
  const money = Staff.can(req, 'money'); // amounts are hidden from staff without "See money totals"
  const M = money ? rupees : () => '—';
  return html`
  <div class="page-head">
    <div><h1>Reports</h1><p class="muted">Sellers, payments and complaints for the selected period.</p></div>
    <div class="seg" role="group" aria-label="Period">${RANGES.map((n) => html`<a class="${n === d.days ? 'active' : ''}" href="/admin/reports?days=${n}">${`Last ${n} days`}</a>`)}</div>
  </div>
  <div class="stats">
    ${money ? html`<a class="stat stat-link" href="#money"><span data-count="${Math.round(k.revenue / 100)}" data-prefix="₹">${M(k.revenue)}</span>Money received</a>
    <a class="stat stat-link" href="/admin/payments"><span>${M(k.waitingMoney)}</span>${k.waitingCount} payment(s) waiting for you</a>` : ''}
    <a class="stat stat-link" href="#live"><span data-count="${k.live}">${k.live}</span>Ads running now</a>
    <div class="stat"><span data-count="${k.sellers}">${k.sellers}</span>New sellers</div>
    <a class="stat stat-link" href="#rejected-sellers"><span data-count="${k.rejectedSellers}">${k.rejectedSellers}</span>Rejected sellers</a>
    <a class="stat stat-link" href="#rejected-payments"><span data-count="${k.rejectedPayments}">${k.rejectedPayments}</span>Rejected payments</a>
    <a class="stat stat-link" href="#ad-reports"><span data-count="${k.openReports}">${k.openReports}</span>Open ad complaints</a>
  </div>

  <div data-tab-scope>
    <div class="tabs" data-tabs data-tabs-hash role="tablist">
      <button type="button" class="tab active" data-tab="overview">${icon('chart', { size: 16 })} Overview</button>
      ${money ? html`<button type="button" class="tab" data-tab="money">${icon('card', { size: 16 })} Money</button>` : ''}
      <button type="button" class="tab" data-tab="live">${icon('bolt', { size: 16 })} Live ads <span class="pill pill-muted">${k.live}</span></button>
      <button type="button" class="tab" data-tab="rejected-sellers">${icon('users', { size: 16 })} Rejected sellers <span class="pill pill-muted">${d.rejectedSellers.length}</span></button>
      <button type="button" class="tab" data-tab="rejected-payments">${icon('card', { size: 16 })} Rejected payments <span class="pill pill-muted">${d.rejectedPayments.length}</span></button>
      <button type="button" class="tab" data-tab="ad-reports">${icon('flag', { size: 16 })} Ad complaints ${k.openReports ? html`<span class="badge-count">${k.openReports}</span>` : ''}</button>
      <button type="button" class="tab" data-tab="sellers">${icon('user', { size: 16 })} All sellers</button>
    </div>

    <div class="tab-panel" data-panel="overview">
      <div class="chartgrid">
        ${money ? html`<section class="chartcard wide">
          <h3>Money received</h3><p class="chart-sub">Per day, last ${d.days} days · total ${M(k.revenue)}</p>
          ${lineChart(d.series, 'rev', (v) => M(v))}
        </section>` : ''}
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

    ${money ? html`<div class="tab-panel" data-panel="money" hidden>
      <div class="chartgrid">
        <section class="chartcard">
          <h3>Where the money came from</h3><p class="chart-sub">Last ${d.days} days</p>
          <ul class="list">${d.byMethod.map((m) => html`<li><span>${({ upi_manual: 'UPI (checked by you)', razorpay: 'Online (Razorpay)', wallet: 'Paid from balance' })[m.method] || m.method} <span class="muted small">· ${m.n} payment(s)</span></span><strong>${M(m.cash)}${m.bal ? html` <span class="muted small">+ ${M(m.bal)} balance</span>` : ''}</strong></li>`)}
            <li><span>Balance top-ups <span class="muted small">· ${d.topupsPaid.n}</span></span><strong>${M(d.topupsPaid.s)}</strong></li>
            <li><span><strong>Total received</strong></span><strong>${M(k.revenue)}</strong></li>
            <li><span class="muted">Balance held for sellers (to be used on ads)</span><span>${M(k.walletHeld)}</span></li></ul>
        </section>
        <section class="chartcard">
          <h3>Plans sold</h3><p class="chart-sub">Number sold and total value</p>
          ${d.byPlan.length ? html`<ul class="list">${d.byPlan.map((x) => html`<li><span>${x.plan} <span class="muted small">× ${x.n}</span></span><strong>${M(x.total)}</strong></li>`)}</ul>` : html`<p class="muted small">No plans sold in this period.</p>`}
          <h3 style="margin-top:18px">Top paying sellers</h3>
          ${d.topSellers.length ? html`<ul class="list">${d.topSellers.map((x) => html`<li><a href="/admin/clients/${x.id}">${x.business_name || x.name}</a><strong>${M(x.total)} <span class="muted small">· ${x.n}</span></strong></li>`)}</ul>` : html`<p class="muted small">—</p>`}
        </section>
      </div>
      <div class="section-head" style="margin-top:18px"><span class="muted small">Every confirmed payment in the last ${d.days} days.</span>${exp('payments')}</div>
      ${d.paidList.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>Receipt</th><th>Confirmed</th><th>Seller</th><th>Ad</th><th>Plan</th><th>Amount</th><th>How</th></tr></thead>
        <tbody>${d.paidList.map((p) => html`<tr><td><a href="/admin/payments/${p.id}/receipt" target="_blank">#${p.id}</a></td><td>${fmtDate(p.confirmed_at)}</td>
          <td><a href="/admin/clients/${p.client_id}">${p.client_name}</a></td><td>${p.ad_title}</td><td>${p.days} days</td>
          <td><strong>${M(p.amount_paise)}</strong>${p.wallet_paise ? html`<div class="small muted">${M(p.wallet_paise)} from balance</div>` : ''}</td>
          <td>${({ upi_manual: 'UPI (checked by you)', razorpay: 'Online (Razorpay)', wallet: 'Paid from balance' })[p.method] || p.method}${p.utr ? html`<div class="small muted mono">${p.utr}</div>` : ''}</td></tr>`)}</tbody></table></div>` : html`<div class="card">${empty('No payments in this period yet.')}</div>`}
    </div>` : ''}

    <div class="tab-panel" data-panel="live" hidden>
      <section class="card tipcard">
        <h3 style="margin-top:0">${icon('bolt', { size: 18 })} How ads move up</h3>
        <ol class="small">
          <li><strong>TOP ads</strong> come first: sellers buy 3-hour slots, or you pin an ad with <strong>Boost & TOP</strong> (days or until a date).</li>
          <li>Then <strong>boost</strong> (−10 … +10) that you set.</li>
          <li>Then <strong>money paid</strong> for the current run — a yearly plan is above a monthly plan, above 7 days, above 1 day.</li>
          <li>Ads that paid the same are <strong>shuffled on every visit</strong>, so each gets a fair turn at the top.</li>
        </ol>
        <p class="small muted" style="margin:0">Ads ending soon are listed first below — a good moment to remind the seller to renew.</p>
      </section>
      <div class="section-head"><span class="muted small">${k.live} ads are live. Paused: ${d.adStatus.paused || 0} · Waiting for payment: ${(d.adStatus.awaiting_payment || 0) + (d.adStatus.payment_review || 0)} · Expired: ${d.adStatus.expired || 0} · Blocked: ${d.adStatus.blocked || 0}</span>${exp('live-ads')}</div>
      ${d.liveAds.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>Ad</th><th>Seller</th><th>Plan</th><th>Paid</th><th>Ends</th><th>Views</th><th>Place</th><th></th></tr></thead>
        <tbody>${d.liveAds.map((a) => { const left = a.expires_at - Date.now(); return html`<tr>
          <td><a href="/ad/${a.id}" target="_blank"><strong>${a.title}</strong></a><div class="small muted">#${a.id} · ${a.city}</div></td>
          <td>${a.client_name}</td><td>${a.plan}</td><td>${M(a.paid_total_paise)}</td>
          <td>${fmtDate(a.expires_at)}<div class="small ${left < DAY ? 'bad' : 'muted'}">${left < DAY ? 'ends within 24 h' : `${Math.ceil(left / DAY)} days left`}</div></td>
          <td>${a.views}</td>
          <td>${a.top_slots ? html`<span class="pill pill-top">TOP (paid)</span> ` : ''}${a.admin_top_until > Date.now() ? html`<span class="pill pill-top">★ Admin TOP</span> ` : ''}${a.admin_boost ? html`<span class="pill pill-info">boost ${a.admin_boost}</span>` : ''}${!a.top_slots && !(a.admin_top_until > Date.now()) && !a.admin_boost ? html`<span class="muted small">by payment</span>` : ''}</td>
          <td><a class="btn btn-sm" href="/admin/ads?status=active&q=${a.id}">${icon('bolt', { size: 14 })} Boost & TOP</a></td></tr>`; })}</tbody></table></div>` : html`<div class="card">${empty('No ads are live right now.')}</div>`}
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
          <td>${M(p.amount_paise)}</td><td class="mono">${p.utr || '—'}</td>
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
      <div class="section-head"><span class="muted small">Every seller with ads and money paid (all time).</span>${money ? exp('sellers') : ''}</div>
      <div class="table-wrap card"><table class="table">
        <thead><tr><th>#</th><th>Seller</th><th>Contact</th><th>City</th><th>Status</th><th>Ads</th><th>Paid</th><th>Balance</th><th>Joined</th><th>Last login</th></tr></thead>
        <tbody>${d.sellers.map((c) => html`<tr>
          <td>${c.id}</td><td><a href="/admin/clients/${c.id}"><strong>${c.name}</strong></a>${c.business_name ? html`<div class="small muted">${c.business_name}</div>` : ''}</td>
          <td>${c.phone}<div class="small muted">${c.email}</div></td><td>${c.city || '—'}</td><td>${pill(c.status)}</td>
          <td>${c.ads}</td><td>${M(c.paid)}</td><td>${M(c.wallet)}</td><td>${fmtDate(c.created_at)}</td><td>${fmtDate(c.last_login_at)}</td></tr>`)}</tbody></table></div>
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
  if (kind === 'payments') return [['Payment ID', 'Confirmed', 'Seller', 'Ad', 'Days', 'Total (Rs)', 'From balance (Rs)', 'Cash received (Rs)', 'Method', 'UTR'],
    ...d.paidList.map((p) => [p.id, day(p.confirmed_at), p.client_name, p.ad_title, p.days, money(p.amount_paise), money(p.wallet_paise), money(p.amount_paise - p.wallet_paise), p.method, p.utr])];
  if (kind === 'live-ads') return [['Ad ID', 'Title', 'City', 'Seller', 'Plan', 'Paid (Rs)', 'Ends', 'Views', 'Paid TOP', 'Admin TOP until', 'Boost'],
    ...d.liveAds.map((a) => [a.id, a.title, a.city, a.client_name, a.plan, money(a.paid_total_paise), day(a.expires_at), a.views, a.top_slots ? 'yes' : '', a.admin_top_until > Date.now() ? day(a.admin_top_until) : '', a.admin_boost])];
  if (kind === 'sellers') return [['ID', 'Name', 'Business', 'Phone', 'Email', 'City', 'Status', 'Ads', 'Paid (Rs)', 'Balance (Rs)', 'Joined', 'Last login'],
    ...d.sellers.map((c) => [c.id, c.name, c.business_name, c.phone, c.email, c.city, c.status, c.ads, money(c.paid), money(c.wallet), day(c.created_at), day(c.last_login_at)])];
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
