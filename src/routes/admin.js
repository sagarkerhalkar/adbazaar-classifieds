'use strict';
// Owner / admin portal: verify clients (KYC + video call), confirm payments, manage ads, plans and settings.

const path = require('node:path');
const { db, tx, getSettings, setSetting, parseImages } = require('../db');
const { html, rupees, fmtDate, fmtDay, timeLeft } = require('../lib/html');
const { renderPage } = require('../views/layout');
const { csrf, pill, adUrl, imgUrl, field, cityDatalist, stateSelect } = require('../views/components');
const { hashPassword, verifyPassword, randomToken, rateLimit } = require('../lib/security');
const { saveUpload, saveDataUrl, removeFile, UploadError, sendFile, DIRS, safeName } = require('../lib/files');
const V = require('../validators');
const P = require('../payments');
const rtc = require('../rtc');
const { rescore, runMaintenance } = require('../ranking');
const { callView } = require('./client');

const page = (req, title, body, scripts = []) => renderPage(req, { title, body, portal: 'admin', scripts });
const back = (req, fallback) => {
  const ref = String(req.headers.referer || '');
  try { const u = new URL(ref); if (u.pathname.startsWith('/admin')) return u.pathname + u.search; } catch { /* ignore */ }
  return fallback;
};

function requireAdmin(req, res) {
  if (!req.admin) { res.redirect('/admin/login'); return; }
  req.adminCounts = {
    kyc: db.prepare("SELECT COUNT(*) n FROM clients WHERE status IN ('pending','video_call')").get().n,
    pay: db.prepare("SELECT COUNT(*) n FROM payments WHERE status = 'pending'").get().n,
    reports: db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved = 0').get().n,
  };
}

const getClient = (id) => db.prepare('SELECT * FROM clients WHERE id = ?').get(parseInt(id, 10) || 0);

function docLink(file, label) {
  if (!file) return html`<div class="doc doc-missing"><span>${label}</span><em>Not provided</em></div>`;
  const url = `/admin/kyc/${file}`;
  return html`<a class="doc" href="${url}" target="_blank" rel="noopener">${file.endsWith('.pdf') ? html`<div class="doc-pdf">PDF</div>` : html`<img src="${url}" alt="${label}">`}<span>${label}</span></a>`;
}

// ---------- views ----------
function dashboardView(req, d) {
  return html`
  <div class="page-head"><h1>Dashboard</h1><a class="btn btn-accent" href="/admin/clients/new">+ Add client</a></div>
  <div class="stats">
    <a class="stat stat-link" href="/admin/clients?status=pending"><span>${d.pendingKyc}</span>Clients to verify</a>
    <a class="stat stat-link" href="/admin/payments"><span>${d.pendingPay}</span>Payments to confirm</a>
    <a class="stat stat-link" href="/admin/ads?status=active"><span>${d.liveAds}</span>Live ads</a>
    <div class="stat"><span>${rupees(d.revMonth)}</span>Revenue this month</div>
    <div class="stat"><span>${rupees(d.revTotal)}</span>Total revenue</div>
    <a class="stat stat-link" href="/admin/clients?status=approved"><span>${d.approved}</span>Verified clients</a>
  </div>
  <div class="cols2">
    <section class="card">
      <div class="section-head"><h2>Waiting for verification</h2><a href="/admin/clients?status=pending" class="small">View all</a></div>
      ${d.kycList.length ? html`<ul class="list">${d.kycList.map((c) => html`<li><a href="/admin/clients/${c.id}"><strong>${c.name}</strong> <span class="muted small">${c.city} · ${fmtDate(c.created_at)}</span></a>${pill(c.status)}</li>`)}</ul>` : html`<p class="muted">All caught up 🎉</p>`}
    </section>
    <section class="card">
      <div class="section-head"><h2>Payments to confirm</h2><a href="/admin/payments" class="small">View all</a></div>
      ${d.payList.length ? html`<ul class="list">${d.payList.map((p) => html`<li><a href="/admin/payments"><strong>${rupees(p.amount_paise)}</strong> <span class="muted small">${p.client_name} · UTR ${p.utr}</span></a>${pill(p.status)}</li>`)}</ul>` : html`<p class="muted">No pending payments.</p>`}
    </section>
  </div>
  <section class="card">
    <h2>Revenue — last 14 days</h2>
    <div class="bars">${d.daily.map((x) => html`<div class="bar" title="${x.day}: ${rupees(x.total)}"><div style="height:${d.maxDaily ? Math.max(2, (x.total / d.maxDaily) * 100) : 2}%"></div><span>${x.day.slice(8)}</span></div>`)}</div>
  </section>`;
}

function clientsView(req, rows, filter) {
  const tabs = [['pending', 'To verify'], ['video_call', 'Video call'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended'], ['all', 'All']];
  return html`
  <div class="page-head"><h1>Clients</h1><a class="btn btn-accent" href="/admin/clients/new">+ Add client</a></div>
  <div class="tabs">${tabs.map(([k, l]) => html`<a class="tab ${filter.status === k ? 'active' : ''}" href="/admin/clients?status=${k}">${l}</a>`)}</div>
  <form class="search-inline" method="get"><input type="hidden" name="status" value="${filter.status}"><input type="search" name="q" value="${filter.q}" placeholder="Search name, email, phone, PAN…"><button class="btn">Search</button></form>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>Client</th><th>Contact</th><th>City</th><th>Submitted</th><th>Status</th><th>Ads</th><th></th></tr></thead>
    <tbody>${rows.map((c) => html`<tr>
      <td><div class="cell-ad">${c.live_photo_file ? html`<img class="round" src="/admin/kyc/${c.live_photo_file}" alt="">` : html`<div class="avatar">${c.name.slice(0, 1)}</div>`}<div><strong>${c.name}</strong>${c.business_name ? html`<div class="small muted">${c.business_name}</div>` : ''}</div></div></td>
      <td>${c.phone}<div class="small muted">${c.email}</div></td><td>${c.city}</td><td>${fmtDate(c.created_at)}</td>
      <td>${pill(c.status)}</td><td>${c.ad_count}</td>
      <td><a class="btn btn-sm" href="/admin/clients/${c.id}">${c.status === 'pending' ? 'Review' : 'Open'}</a></td></tr>`)}
    </tbody></table></div>` : html`<div class="card empty center"><p class="muted">No clients here.</p></div>`}`;
}

function clientDetailView(req, c, { snapshots, ads, payments, tempPassword }) {
  const settings = req.settings;
  const base = process.env.BASE_URL || `http://${req.headers.host}`;
  const callLink = `${base}/kyc/call/${c.status_token}`;
  const statusLink = `${base}/kyc/status/${c.status_token}`;
  const waMsg = encodeURIComponent(`Hello ${c.name}, this is ${settings.site_name}. Please join your verification video call here: ${callLink}`);
  return html`
  <nav class="crumbs"><a href="/admin/clients">Clients</a> › <span>${c.name}</span></nav>
  ${tempPassword ? html`<div class="flash flash-success">Temporary password for this client: <strong class="mono">${tempPassword}</strong> — share it securely. It will not be shown again.</div>` : ''}
  <div class="page-head">
    <div><h1>${c.name} ${pill(c.status)}</h1><p class="muted">Client #${c.id} · registered ${fmtDate(c.created_at)}${c.created_by_admin ? ' by admin' : ''}${c.reviewed_at ? ` · reviewed ${fmtDate(c.reviewed_at)}` : ''}</p></div>
  </div>

  <div class="cols2 kyc-layout">
    <section class="card">
      <h2>Details</h2>
      <dl class="facts">
        <div><dt>Business</dt><dd>${c.business_name || '—'}</dd></div>
        <div><dt>Phone</dt><dd><a href="tel:+91${c.phone}">${c.phone}</a></dd></div>
        <div><dt>Email</dt><dd>${c.email}</dd></div>
        <div><dt>Aadhaar</dt><dd class="mono">XXXX XXXX ${c.aadhaar_last4}</dd></div>
        <div><dt>PAN</dt><dd class="mono">${c.pan_number}</dd></div>
        <div><dt>PIN</dt><dd>${c.pincode}</dd></div>
        <div class="wide"><dt>Address</dt><dd>${c.address}, ${c.city}, ${c.state} – ${c.pincode}</dd></div>
      </dl>
      <h3>Documents</h3>
      <div class="docs">
        ${docLink(c.aadhaar_file, 'Aadhaar front')}${docLink(c.aadhaar_back_file, 'Aadhaar back')}
        ${docLink(c.pan_file, 'PAN card')}${docLink(c.address_proof_file, 'Address proof')}
        ${docLink(c.photo_file, 'Uploaded photo')}
      </div>
      <h3>Live photos</h3>
      <div class="docs">${snapshots.length ? snapshots.map((s) => html`<a class="doc" href="/admin/kyc/${s.file}" target="_blank"><img src="/admin/kyc/${s.file}" alt=""><span>${s.source.replace('_', ' ')} · ${fmtDate(s.created_at)}</span></a>`) : html`<p class="muted">No live photos yet — take one on a video call.</p>`}</div>
    </section>

    <section class="card">
      <h2>Verification</h2>
      <p class="small muted">Compare the live photo with the uploaded photo and documents. Approve to let the client log in and post ads.</p>

      <form method="post" action="/admin/clients/${c.id}/status" class="form">
        ${csrf(req)}
        ${field('Note to client (shown on their status page)', html`<textarea name="note" rows="2" maxlength="500">${c.admin_note}</textarea>`)}
        <div class="btn-row">
          ${c.status !== 'approved' ? html`<button class="btn btn-ok" name="action" value="approve">✔ Approve</button>` : ''}
          ${c.status === 'pending' || c.status === 'video_call' ? html`<button class="btn btn-danger" name="action" value="reject">✖ Reject</button>` : ''}
          ${c.status === 'approved' ? html`<button class="btn btn-danger" name="action" value="suspend" data-confirm="Suspend this client? Their live ads will be hidden.">Suspend</button>` : ''}
          ${c.status === 'rejected' || c.status === 'suspended' ? html`<button class="btn" name="action" value="pending">Move back to review</button>` : ''}
        </div>
      </form>

      <div class="callbox">
        <h3>🎥 Video call verification</h3>
        ${c.status === 'video_call' ? html`
          <p>Call ${c.video_call_at ? html`scheduled for <strong>${fmtDate(c.video_call_at)}</strong>` : 'requested'}. Send the client this link:</p>
          <div class="copy"><input readonly value="${callLink}" data-copy-src><button type="button" class="btn btn-sm" data-copy>Copy</button></div>
          <div class="btn-row">
            <a class="btn btn-accent" href="/admin/clients/${c.id}/call">Start video call</a>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="https://wa.me/91${c.phone}?text=${waMsg}">Send on WhatsApp</a>
          </div>` : ''}
        ${c.status !== 'approved' && c.status !== 'suspended' ? html`
        <form method="post" action="/admin/clients/${c.id}/status" class="form inline-form">
          ${csrf(req)}
          <input type="hidden" name="note" value="${c.admin_note}">
          ${field(c.status === 'video_call' ? 'Reschedule' : 'Schedule a video call', html`<input type="datetime-local" name="video_call_at">`, 'Optional — leave empty to call now (India time)')}
          <button class="btn" name="action" value="video_call">${c.status === 'video_call' ? 'Update schedule' : 'Request video call'}</button>
        </form>` : ''}
      </div>

      <div class="callbox">
        <h3>Status link for client</h3>
        <div class="copy"><input readonly value="${statusLink}" data-copy-src><button type="button" class="btn btn-sm" data-copy>Copy</button></div>
      </div>

      <form method="post" action="/admin/clients/${c.id}/reset-password" class="inline" data-confirm="Generate a new temporary password for this client?">
        ${csrf(req)}<button class="btn btn-ghost btn-sm">Reset password</button>
      </form>
    </section>
  </div>

  <section class="card">
    <h2>Ads (${ads.length})</h2>
    ${ads.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Ad</th><th>Status</th><th>Expires</th><th>Views</th></tr></thead><tbody>
      ${ads.map((a) => html`<tr><td><a href="${adUrl(a)}" target="_blank">${a.title}</a></td><td>${pill(a.status)}</td><td>${a.expires_at ? fmtDay(a.expires_at) : '—'}</td><td>${a.views}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">No ads yet.</p>`}
    <h2>Payments (${payments.length})</h2>
    ${payments.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>
      ${payments.map((p) => html`<tr><td>${p.id}</td><td>${fmtDate(p.created_at)}</td><td>${rupees(p.amount_paise)}</td><td>${p.method === 'razorpay' ? 'Online' : `UPI ${p.utr}`}</td><td>${pill(p.status)}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">No payments yet.</p>`}
  </section>`;
}

function newClientView(req, v = {}, error) {
  return html`
  <nav class="crumbs"><a href="/admin/clients">Clients</a> › <span>Add client</span></nav>
  <section class="card form-card">
    <h1>Add a client</h1>
    <p class="muted">Use this when you onboard a client yourself (in person or on a call). Upload their documents and take a live photo with your webcam.</p>
    ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
    <form method="post" action="/admin/clients/new" enctype="multipart/form-data" class="form">
      ${csrf(req)}
      <fieldset><legend>Client details</legend>
        <div class="row2">${field('Full name *', html`<input name="name" required maxlength="80" value="${v.name}">`)}${field('Business name', html`<input name="business_name" maxlength="80" value="${v.business_name}">`)}</div>
        <div class="row2">${field('Mobile *', html`<input name="phone" required maxlength="13" value="${v.phone}">`)}${field('Email (login ID) *', html`<input name="email" type="email" required maxlength="120" value="${v.email}">`)}</div>
        ${field('Address *', html`<textarea name="address" rows="2" required maxlength="300">${v.address}</textarea>`)}
        <div class="row3">${field('City *', html`<input name="city" required list="cities" value="${v.city}">`)}${cityDatalist()}${field('State *', stateSelect(v.state))}${field('PIN *', html`<input name="pincode" required maxlength="6" value="${v.pincode}">`)}</div>
        <div class="row2">${field('Aadhaar number *', html`<input name="aadhaar_number" required maxlength="14" value="${v.aadhaar_number}">`)}${field('PAN *', html`<input name="pan_number" required maxlength="10" class="upper" value="${v.pan_number}">`)}</div>
      </fieldset>
      <fieldset><legend>Documents</legend>
        <div class="row2">${field('Aadhaar front *', html`<input type="file" name="aadhaar_file" required accept="image/*,application/pdf">`)}${field('Aadhaar back', html`<input type="file" name="aadhaar_back_file" accept="image/*,application/pdf">`)}</div>
        <div class="row2">${field('PAN card *', html`<input type="file" name="pan_file" required accept="image/*,application/pdf">`)}${field('Address proof', html`<input type="file" name="address_proof_file" accept="image/*,application/pdf">`)}</div>
        ${field('Client photo', html`<input type="file" name="photo_file" accept="image/*">`)}
      </fieldset>
      <fieldset><legend>Live photo (webcam)</legend>
        <div class="camera" data-camera data-auto="3">
          <div class="camera-stage"><video playsinline muted data-camera-video></video><img alt="" data-camera-preview hidden><div class="camera-count" data-camera-count hidden></div></div>
          <div class="camera-actions"><button type="button" class="btn" data-camera-start>📷 Start camera</button><button type="button" class="btn btn-accent" data-camera-snap hidden>Capture now</button><button type="button" class="btn btn-ghost" data-camera-retake hidden>Retake</button></div>
          <p class="hint" data-camera-status>Optional if you will verify over a video call later.</p>
          <input type="hidden" name="live_photo_data" data-camera-output>
        </div>
      </fieldset>
      <fieldset><legend>Login</legend>
        ${field('Password', html`<input name="password" type="text" minlength="8" autocomplete="off" placeholder="Leave empty to auto-generate">`)}
        <label class="check"><input type="checkbox" name="approve_now" value="1" checked> I have verified this client — approve now so they can log in and post ads</label>
      </fieldset>
      <button class="btn btn-accent btn-lg">Create client</button>
    </form>
  </section>`;
}

function paymentsView(req, rows, status) {
  const tabs = [['pending', 'To confirm'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['all', 'All']];
  return html`
  <div class="page-head"><h1>Payments</h1></div>
  <div class="tabs">${tabs.map(([k, l]) => html`<a class="tab ${status === k ? 'active' : ''}" href="/admin/payments?status=${k}">${l}</a>`)}</div>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>#</th><th>Date</th><th>Client</th><th>Ad</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((p) => html`<tr>
      <td>${p.id}</td><td>${fmtDate(p.created_at)}</td>
      <td><a href="/admin/clients/${p.client_id}">${p.client_name}</a></td>
      <td><a href="${adUrl({ id: p.ad_id, title: p.ad_title })}" target="_blank">${p.ad_title}</a></td>
      <td>${p.days} days${p.with_top ? html` <span class="pill pill-top">TOP</span>` : ''}</td>
      <td><strong>${rupees(p.amount_paise)}</strong></td>
      <td>${p.method === 'razorpay' ? html`Online<div class="small muted mono">${p.razorpay_payment_id || p.razorpay_order_id}</div>` : html`UPI <span class="mono">${p.utr}</span>${p.screenshot_file ? html`<div><a class="small" href="/admin/payment-file/${p.screenshot_file}" target="_blank">View screenshot</a></div>` : ''}`}</td>
      <td>${pill(p.status)}${p.admin_note ? html`<div class="small muted">${p.admin_note}</div>` : ''}</td>
      <td class="actions">${p.status === 'pending' ? html`
        <form method="post" action="/admin/payments/${p.id}/confirm" class="inline">${csrf(req)}<button class="btn btn-ok btn-sm">✔ Confirm & go live</button></form>
        <form method="post" action="/admin/payments/${p.id}/reject" class="inline reject-form">${csrf(req)}<input name="note" placeholder="Reason" maxlength="200"><button class="btn btn-danger btn-sm">Reject</button></form>` : ''}</td>
    </tr>`)}</tbody></table></div>` : html`<div class="card empty center"><p class="muted">Nothing here.</p></div>`}`;
}

function adsView(req, rows, f) {
  const tabs = [['active', 'Live'], ['payment_review', 'Payment review'], ['awaiting_payment', 'Unpaid'], ['expired', 'Expired'], ['blocked', 'Blocked'], ['all', 'All']];
  return html`
  <div class="page-head"><h1>Ads</h1><form method="post" action="/admin/ads/rerank" class="inline">${csrf(req)}<button class="btn btn-ghost btn-sm">↻ Re-run ranking now</button></form></div>
  <div class="tabs">${tabs.map(([k, l]) => html`<a class="tab ${f.status === k ? 'active' : ''}" href="/admin/ads?status=${k}">${l}</a>`)}</div>
  <form class="search-inline" method="get"><input type="hidden" name="status" value="${f.status}"><input type="search" name="q" value="${f.q}" placeholder="Search title or ad ID"><button class="btn">Search</button></form>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>Rank</th><th>Ad</th><th>Client</th><th>Status</th><th>Plan / paid</th><th>Expires</th><th>Views</th><th>Admin tools</th></tr></thead>
    <tbody>${rows.map((a) => html`<tr>
      <td class="mono">${a.status === 'active' ? a.rank_score.toFixed(1) : '—'}</td>
      <td><a href="${adUrl(a)}" target="_blank"><strong>${a.title}</strong></a><div class="small muted">#${a.id} · ${a.cat_name} · ${a.city}</div></td>
      <td><a href="/admin/clients/${a.client_id}">${a.client_name}</a></td>
      <td>${pill(a.status)}${a.is_top ? html` <span class="pill pill-top">TOP</span>` : ''}${a.block_reason ? html`<div class="small muted">${a.block_reason}</div>` : ''}</td>
      <td>${a.plan_name || '—'}<div class="small muted">${rupees(a.paid_total_paise)}</div></td>
      <td>${a.expires_at ? html`${fmtDay(a.expires_at)}<div class="small muted">${a.status === 'active' ? timeLeft(a.expires_at) : ''}</div>` : '—'}</td>
      <td>${a.views}</td>
      <td class="actions">
        ${a.status === 'blocked'
          ? html`<form method="post" action="/admin/ads/${a.id}/unblock" class="inline">${csrf(req)}<button class="btn btn-sm">Unblock</button></form>`
          : html`<form method="post" action="/admin/ads/${a.id}/block" class="inline reject-form">${csrf(req)}<input name="reason" placeholder="Reason" maxlength="200"><button class="btn btn-danger btn-sm">Block</button></form>`}
        ${a.status === 'active' ? html`
          <form method="post" action="/admin/ads/${a.id}/boost" class="inline boost-form">${csrf(req)}<input type="number" name="boost" min="-10" max="10" value="${a.admin_boost}" title="Manual ranking boost (-10…10)"><button class="btn btn-sm">Set boost</button></form>
          <form method="post" action="/admin/ads/${a.id}/top" class="inline">${csrf(req)}<button class="btn btn-sm">${a.is_top ? 'Remove TOP' : 'Make TOP'}</button></form>` : ''}
        ${a.status === 'active' || a.status === 'expired' ? html`<form method="post" action="/admin/ads/${a.id}/extend" class="inline boost-form">${csrf(req)}<input type="number" name="days" min="1" max="365" value="7"><button class="btn btn-sm">+ days free</button></form>` : ''}
      </td></tr>`)}
    </tbody></table></div>` : html`<div class="card empty center"><p class="muted">No ads.</p></div>`}`;
}

function reportsView(req, rows) {
  return html`
  <div class="page-head"><h1>Reports</h1></div>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>Date</th><th>Ad</th><th>Reason</th><th>Details</th><th></th></tr></thead>
    <tbody>${rows.map((r) => html`<tr class="${r.resolved ? 'dim' : ''}">
      <td>${fmtDate(r.created_at)}</td><td><a href="${adUrl({ id: r.ad_id, title: r.ad_title })}" target="_blank">${r.ad_title}</a> ${pill(r.ad_status)}</td>
      <td>${r.reason}</td><td>${r.details}</td>
      <td class="actions">${!r.resolved ? html`
        <form method="post" action="/admin/ads/${r.ad_id}/block" class="inline">${csrf(req)}<input type="hidden" name="reason" value="Reported: ${r.reason}"><input type="hidden" name="report_id" value="${r.id}"><button class="btn btn-danger btn-sm">Block ad</button></form>
        <form method="post" action="/admin/reports/${r.id}/resolve" class="inline">${csrf(req)}<button class="btn btn-sm">Dismiss</button></form>` : 'Resolved'}</td></tr>`)}
    </tbody></table></div>` : html`<div class="card empty center"><p class="muted">No reports. 👍</p></div>`}`;
}

function settingsView(req, { s, plans, cats, admins }) {
  return html`
  <div class="page-head"><h1>Settings</h1></div>
  <section class="card">
    <h2>Pricing plans</h2>
    <p class="muted small">Price and ranking level for each run period. Higher ranking level = ad appears higher. “TOP price” is the extra charge to pin the ad in the TOP section.</p>
    <form method="post" action="/admin/plans" class="form">
      ${csrf(req)}
      <div class="table-wrap"><table class="table plans-table">
        <thead><tr><th>Name</th><th>Days</th><th>Price (₹)</th><th>TOP extra (₹)</th><th>Ranking level</th><th>Active</th></tr></thead>
        <tbody>
          ${plans.map((p) => html`<tr>
            <td><input type="hidden" name="id[]" value="${p.id}"><input name="name[]" value="${p.name}" required maxlength="60"></td>
            <td><input type="number" name="days[]" value="${p.days}" min="1" max="365" required></td>
            <td><input type="number" name="price[]" value="${p.price_paise / 100}" min="0" step="1" required></td>
            <td><input type="number" name="top[]" value="${p.top_price_paise / 100}" min="0" step="1" required></td>
            <td><input type="number" name="priority[]" value="${p.priority}" min="1" max="10" required></td>
            <td><select name="active[]"><option value="1" ${p.is_active ? 'selected' : ''}>Yes</option><option value="0" ${!p.is_active ? 'selected' : ''}>No</option></select></td></tr>`)}
          <tr class="new-row">
            <td><input type="hidden" name="id[]" value="new"><input name="name[]" placeholder="+ New plan name" maxlength="60"></td>
            <td><input type="number" name="days[]" min="1" max="365" placeholder="days"></td>
            <td><input type="number" name="price[]" min="0" step="1" placeholder="₹"></td>
            <td><input type="number" name="top[]" min="0" step="1" placeholder="₹"></td>
            <td><input type="number" name="priority[]" min="1" max="10" value="1"></td>
            <td><select name="active[]"><option value="1">Yes</option><option value="0">No</option></select></td></tr>
        </tbody></table></div>
      <button class="btn btn-accent">Save plans</button>
    </form>
  </section>

  <div class="cols2">
    <section class="card">
      <h2>Site & payment details</h2>
      <form method="post" action="/admin/settings" enctype="multipart/form-data" class="form">
        ${csrf(req)}
        ${field('Site name', html`<input name="site_name" required maxlength="40" value="${s.site_name}">`)}
        ${field('Tagline', html`<input name="tagline" maxlength="120" value="${s.tagline}">`)}
        <div class="row2">${field('Your UPI ID', html`<input name="upi_id" maxlength="80" value="${s.upi_id}" placeholder="yourname@okhdfcbank">`)}${field('UPI payee name', html`<input name="upi_payee_name" maxlength="80" value="${s.upi_payee_name}">`)}</div>
        ${field('UPI QR code image', html`<input type="file" name="upi_qr" accept="image/*">`, s.upi_qr_file ? 'A QR is uploaded — choose a file to replace it.' : 'Upload the QR from your UPI / merchant app')}
        ${s.upi_qr_file ? html`<img class="upi-qr" src="${imgUrl(s.upi_qr_file)}" alt="UPI QR">` : ''}
        <div class="row2">${field('Support phone', html`<input name="support_phone" maxlength="20" value="${s.support_phone}">`)}${field('Support email', html`<input name="support_email" type="email" maxlength="120" value="${s.support_email}">`)}</div>
        <p class="small muted">Online payments (Razorpay): ${P.razorpayEnabled() ? html`<strong class="ok">enabled</strong>` : html`<strong>not configured</strong> — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env`}</p>
        <button class="btn btn-accent">Save settings</button>
      </form>
    </section>
    <section class="card">
      <h2>Categories</h2>
      <form method="post" action="/admin/categories" class="form">
        ${csrf(req)}
        <div class="table-wrap"><table class="table"><thead><tr><th>Icon</th><th>Name</th><th>Order</th><th>Active</th></tr></thead><tbody>
          ${cats.map((c) => html`<tr><td><input type="hidden" name="id[]" value="${c.id}"><input name="icon[]" value="${c.icon}" maxlength="4" class="xs"></td><td><input name="name[]" value="${c.name}" maxlength="40" required></td><td><input type="number" name="sort[]" value="${c.sort}" class="xs"></td><td><select name="active[]"><option value="1" ${c.is_active ? 'selected' : ''}>Yes</option><option value="0" ${!c.is_active ? 'selected' : ''}>No</option></select></td></tr>`)}
          <tr><td><input type="hidden" name="id[]" value="new"><input name="icon[]" maxlength="4" class="xs" placeholder="🙂"></td><td><input name="name[]" maxlength="40" placeholder="+ New category"></td><td><input type="number" name="sort[]" value="99" class="xs"></td><td><select name="active[]"><option value="1">Yes</option></select></td></tr>
        </tbody></table></div>
        <button class="btn">Save categories</button>
      </form>
      <h2>Admins</h2>
      <ul class="list">${admins.map((a) => html`<li><span><strong>${a.name}</strong> <span class="muted small">${a.email}</span></span></li>`)}</ul>
      <form method="post" action="/admin/admins" class="form">
        ${csrf(req)}
        <div class="row2">${field('Name', html`<input name="name" required maxlength="60">`)}${field('Email', html`<input name="email" type="email" required>`)}</div>
        ${field('Password', html`<input name="password" type="password" minlength="10" required autocomplete="new-password">`, 'At least 10 characters')}
        <button class="btn btn-sm">Add admin</button>
      </form>
      <h2>Change my password</h2>
      <form method="post" action="/admin/password" class="form">
        ${csrf(req)}
        ${field('Current password', html`<input name="current" type="password" required autocomplete="current-password">`)}
        ${field('New password', html`<input name="password" type="password" minlength="10" required autocomplete="new-password">`)}
        <button class="btn btn-sm">Update password</button>
      </form>
    </section>
  </div>`;
}

// ---------- routes ----------
function register(app) {
  app.get('/admin/login', (req, res) => {
    if (req.admin) { res.redirect('/admin'); return; }
    res.html(page(req, 'Admin login', loginForm(req)));
  });
  function loginForm(req, error) {
    return html`<section class="card narrow"><h1>Admin login</h1>${error ? html`<div class="flash flash-error">${error}</div>` : ''}
      <form method="post" action="/admin/login" class="form">${csrf(req)}
        ${field('Email', html`<input name="email" type="email" required autocomplete="username">`)}
        ${field('Password', html`<input name="password" type="password" required autocomplete="current-password">`)}
        <button class="btn btn-accent btn-block">Log in</button></form></section>`;
  }
  app.post('/admin/login', (req, res) => {
    const email = V.str(req.body.email, 120).toLowerCase();
    if (!rateLimit(`alogin:${req.ip}`, 10, 15 * 60_000)) { res.status(429).html(page(req, 'Admin login', loginForm(req, 'Too many attempts. Wait 15 minutes.'))); return; }
    const a = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    if (!a || !verifyPassword(req.body.password, a.password_hash)) { res.status(401).html(page(req, 'Admin login', loginForm(req, 'Incorrect email or password.'))); return; }
    req.regenerateSession();
    req.session.adminId = a.id;
    res.redirect('/admin');
  });
  app.post('/admin/logout', (req, res) => { req.regenerateSession(); res.redirect('/admin/login'); });

  app.get('/admin', requireAdmin, (req, res) => {
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const since = Date.now() - 13 * 86400_000;
    const dailyRows = db.prepare(`SELECT date(confirmed_at/1000, 'unixepoch', '+5 hours', '+30 minutes') AS day, SUM(amount_paise) AS total
      FROM payments WHERE status = 'paid' AND confirmed_at >= ? GROUP BY day`).all(since - 86400_000);
    const map = Object.fromEntries(dailyRows.map((r) => [r.day, r.total]));
    const daily = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      daily.push({ day, total: map[day] || 0 });
    }
    const d = {
      pendingKyc: req.adminCounts.kyc, pendingPay: req.adminCounts.pay,
      liveAds: db.prepare("SELECT COUNT(*) n FROM ads WHERE status = 'active'").get().n,
      approved: db.prepare("SELECT COUNT(*) n FROM clients WHERE status = 'approved'").get().n,
      revMonth: db.prepare("SELECT COALESCE(SUM(amount_paise),0) s FROM payments WHERE status='paid' AND confirmed_at >= ?").get(startMonth.getTime()).s,
      revTotal: db.prepare("SELECT COALESCE(SUM(amount_paise),0) s FROM payments WHERE status='paid'").get().s,
      kycList: db.prepare("SELECT * FROM clients WHERE status IN ('pending','video_call') ORDER BY created_at LIMIT 6").all(),
      payList: db.prepare("SELECT p.*, c.name AS client_name FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.status = 'pending' ORDER BY p.id LIMIT 6").all(),
      daily, maxDaily: Math.max(0, ...daily.map((x) => x.total)),
    };
    res.html(page(req, 'Dashboard', dashboardView(req, d)));
  });

  // ---- Clients ----
  app.get('/admin/clients', requireAdmin, (req, res) => {
    const status = ['pending', 'video_call', 'approved', 'rejected', 'suspended', 'all'].includes(req.query.status) ? req.query.status : 'pending';
    const q = V.str(req.query.q, 80);
    const where = []; const args = [];
    if (status !== 'all') { where.push('c.status = ?'); args.push(status); }
    if (q) { where.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.pan_number LIKE ? OR c.business_name LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l, l); }
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM ads a WHERE a.client_id = c.id) AS ad_count FROM clients c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 300`).all(...args);
    res.html(page(req, 'Clients', clientsView(req, rows, { status, q })));
  });

  app.get('/admin/clients/new', requireAdmin, (req, res) => res.html(page(req, 'Add client', newClientView(req), ['/public/js/camera.js'])));

  app.post('/admin/clients/new', requireAdmin, (req, res) => {
    const b = req.body;
    const v = {
      name: V.str(b.name, 80), business_name: V.str(b.business_name, 80), email: V.str(b.email, 120).toLowerCase(), phone: V.normalizePhone(b.phone),
      address: V.str(b.address, 300), city: V.str(b.city, 60), state: V.str(b.state, 60), pincode: V.str(b.pincode, 6),
      aadhaar_number: String(b.aadhaar_number || '').replace(/\s+/g, ''), pan_number: V.str(b.pan_number, 10).toUpperCase(),
    };
    const fail = (msg) => res.status(400).html(page(req, 'Add client', newClientView(req, v, msg), ['/public/js/camera.js']));
    if (v.name.length < 3) return fail('Enter the full name.');
    if (!V.isValidPhone(v.phone)) return fail('Enter a valid 10-digit mobile number.');
    if (!V.isValidEmail(v.email)) return fail('Enter a valid email.');
    if (db.prepare('SELECT 1 FROM clients WHERE email = ?').get(v.email)) return fail('A client with this email already exists.');
    if (v.address.length < 10 || !v.city || !v.state || !V.isValidPincode(v.pincode)) return fail('Enter the complete address with a valid PIN code.');
    if (!V.isValidAadhaar(v.aadhaar_number)) return fail('Aadhaar number is not valid.');
    if (!V.isValidPAN(v.pan_number)) return fail('PAN is not valid.');
    if (!req.files.aadhaar_file?.[0] || !req.files.pan_file?.[0]) return fail('Upload Aadhaar and PAN documents.');
    const password = b.password ? String(b.password) : randomToken(9);
    if (password.length < 8) return fail('Password must be at least 8 characters.');

    const saved = [];
    try {
      const up = (k, opts) => { const n = saveUpload(req.files[k]?.[0], 'kyc', opts); if (n) saved.push(n); return n; };
      const f = { a: up('aadhaar_file', { allowPdf: true }), ab: up('aadhaar_back_file', { allowPdf: true }), p: up('pan_file', { allowPdf: true }), ad: up('address_proof_file', { allowPdf: true }), ph: up('photo_file') };
      const live = b.live_photo_data ? saveDataUrl(b.live_photo_data, 'kyc') : null;
      if (live) saved.push(live);
      const now = Date.now();
      const approve = b.approve_now === '1';
      const id = tx(() => {
        const r = db.prepare(`INSERT INTO clients (name, business_name, email, phone, password_hash, address, city, state, pincode, aadhaar_last4, pan_number,
          aadhaar_file, aadhaar_back_file, pan_file, address_proof_file, photo_file, live_photo_file, status, status_token, created_by_admin, reviewed_by, reviewed_at, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`)
          .run(v.name, v.business_name, v.email, v.phone, hashPassword(password), v.address, v.city, v.state, v.pincode, v.aadhaar_number.slice(-4), v.pan_number,
            f.a, f.ab, f.p, f.ad, f.ph, live, approve ? 'approved' : 'pending', randomToken(24), approve ? req.admin.id : null, approve ? now : null, now);
        if (live) db.prepare("INSERT INTO kyc_snapshots (client_id, file, source, created_at) VALUES (?, ?, 'admin_webcam', ?)").run(r.lastInsertRowid, live, now);
        return Number(r.lastInsertRowid);
      });
      req.session.tempPassword = { id, password };
      req.flash('success', `Client created${approve ? ' and approved' : ''}.`);
      res.redirect(`/admin/clients/${id}`);
    } catch (e) {
      saved.forEach((n) => removeFile('kyc', n));
      if (e instanceof UploadError) return fail(e.message);
      throw e;
    }
  });

  app.get('/admin/clients/:id', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { req.flash('error', 'Client not found.'); res.redirect('/admin/clients'); return; }
    let tempPassword = null;
    if (req.session.tempPassword?.id === c.id) { tempPassword = req.session.tempPassword.password; delete req.session.tempPassword; }
    const snapshots = db.prepare('SELECT * FROM kyc_snapshots WHERE client_id = ? ORDER BY id DESC').all(c.id);
    const ads = db.prepare('SELECT * FROM ads WHERE client_id = ? ORDER BY id DESC').all(c.id);
    const payments = db.prepare("SELECT * FROM payments WHERE client_id = ? AND status != 'created' ORDER BY id DESC").all(c.id);
    res.html(page(req, c.name, clientDetailView(req, c, { snapshots, ads, payments, tempPassword })));
  });

  app.post('/admin/clients/:id/status', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.redirect('/admin/clients'); return; }
    const action = req.body.action;
    const note = V.str(req.body.note, 500) || null;
    const now = Date.now();
    const map = { approve: 'approved', reject: 'rejected', suspend: 'suspended', video_call: 'video_call', pending: 'pending' };
    const status = map[action];
    if (!status) { res.redirect(`/admin/clients/${c.id}`); return; }
    let callAt = null;
    if (status === 'video_call' && req.body.video_call_at) {
      // datetime-local is entered in India time
      const t = Date.parse(`${req.body.video_call_at}:00+05:30`);
      if (Number.isFinite(t)) callAt = t;
    }
    tx(() => {
      db.prepare('UPDATE clients SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = ?, video_call_at = CASE WHEN ? = \'video_call\' THEN ? ELSE video_call_at END WHERE id = ?')
        .run(status, note, req.admin.id, now, status, callAt, c.id);
      if (status === 'suspended') {
        // Hide their live ads; remaining time is kept so unblocking restores them.
        db.prepare("UPDATE ads SET status = 'blocked', block_reason = 'Seller suspended', rank_score = -1, updated_at = ? WHERE client_id = ? AND status IN ('active','payment_review','awaiting_payment')").run(now, c.id);
      }
    });
    if (status === 'rejected' || status === 'suspended') rtc.broadcast(`kyc-${c.id}`, 'client', 'signal', { type: 'hangup' });
    const label = { approved: 'Client approved — they can now log in and post ads.', rejected: 'Client rejected.', suspended: 'Client suspended and their ads hidden.', video_call: 'Video call requested. Share the call link with the client.', pending: 'Moved back to review.' }[status];
    req.flash('success', label);
    res.redirect(`/admin/clients/${c.id}`);
  });

  app.post('/admin/clients/:id/reset-password', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.redirect('/admin/clients'); return; }
    const password = randomToken(9);
    db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hashPassword(password), c.id);
    req.session.tempPassword = { id: c.id, password };
    res.redirect(`/admin/clients/${c.id}`);
  });

  // ---- KYC video call (admin side) ----
  app.get('/admin/clients/:id/call', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.redirect('/admin/clients'); return; }
    if (c.status !== 'video_call') { req.flash('error', 'Request a video call first.'); res.redirect(`/admin/clients/${c.id}`); return; }
    const body = html`<nav class="crumbs"><a href="/admin/clients/${c.id}">← Back to ${c.name}</a></nav>
      <div class="cols-call">
        ${callView(req, c, { role: 'admin', eventsUrl: `/rtc/a/${c.id}/events`, signalUrl: `/rtc/a/${c.id}/signal`, snapshotUrl: `/admin/clients/${c.id}/snapshot` })}
        <aside class="card call-side">
          <h3>Compare with documents</h3>
          <div class="docs small-docs">${docLink(c.photo_file, 'Uploaded photo')}${docLink(c.aadhaar_file, 'Aadhaar')}${docLink(c.pan_file, 'PAN')}</div>
          <dl class="facts"><div><dt>Name</dt><dd>${c.name}</dd></div><div><dt>Aadhaar</dt><dd>XXXX ${c.aadhaar_last4}</dd></div><div><dt>PAN</dt><dd>${c.pan_number}</dd></div></dl>
          <form method="post" action="/admin/clients/${c.id}/status" class="form">${csrf(req)}
            <input type="hidden" name="note" value="${c.admin_note}">
            <button class="btn btn-ok btn-block" name="action" value="approve">✔ Approve client</button>
            <button class="btn btn-danger btn-block" name="action" value="reject">✖ Reject</button>
          </form>
        </aside>
      </div>`;
    res.html(page(req, `Video call — ${c.name}`, body, ['/public/js/rtc-call.js']));
  });
  app.get('/rtc/a/:id/events', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.status(404).send('Not found'); return; }
    rtc.openStream(req, res, `kyc-${c.id}`, 'admin');
  });
  app.post('/rtc/a/:id/signal', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.status(404).json({ ok: false }); return; }
    res.json({ ok: rtc.relay(`kyc-${c.id}`, 'admin', req.body) });
  });
  app.post('/admin/clients/:id/snapshot', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.status(404).json({ ok: false }); return; }
    try {
      const file = saveDataUrl(req.body.image, 'kyc');
      db.prepare("INSERT INTO kyc_snapshots (client_id, file, source, created_at) VALUES (?, ?, 'video_call', ?)").run(c.id, file, Date.now());
      db.prepare('UPDATE clients SET live_photo_file = ? WHERE id = ?').run(file, c.id);
      rtc.broadcast(`kyc-${c.id}`, 'client', 'signal', { type: 'snapshot-taken' });
      res.json({ ok: true, url: `/admin/kyc/${file}` });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Private document files — only admins can open them.
  app.get('/admin/kyc/:file', requireAdmin, (req, res) => {
    const name = safeName(req.params.file);
    if (!name) { res.status(404).send('Not found'); return; }
    return sendFile(res, path.join(DIRS.kyc, name), { cache: 'private, no-store', download: true });
  });
  app.get('/admin/payment-file/:file', requireAdmin, (req, res) => {
    const name = safeName(req.params.file);
    if (!name) { res.status(404).send('Not found'); return; }
    return sendFile(res, path.join(DIRS.payments, name), { cache: 'private, no-store' });
  });

  // ---- Payments ----
  app.get('/admin/payments', requireAdmin, (req, res) => {
    const status = ['pending', 'paid', 'rejected', 'all'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = db.prepare(`SELECT p.*, c.name AS client_name, a.title AS ad_title FROM payments p
      JOIN clients c ON c.id = p.client_id JOIN ads a ON a.id = p.ad_id
      WHERE ${status === 'all' ? "p.status != 'created'" : 'p.status = ?'} ORDER BY p.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 300`)
      .all(...(status === 'all' ? [] : [status]));
    res.html(page(req, 'Payments', paymentsView(req, rows, status)));
  });
  app.post('/admin/payments/:id/confirm', requireAdmin, (req, res) => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!pay || pay.status !== 'pending') { req.flash('error', 'Payment is not pending.'); res.redirect(back(req, '/admin/payments')); return; }
    P.confirmPayment(pay.id, { adminId: req.admin.id });
    req.flash('success', `Payment #${pay.id} confirmed — ad is live.`);
    res.redirect(back(req, '/admin/payments'));
  });
  app.post('/admin/payments/:id/reject', requireAdmin, (req, res) => {
    const ok = P.rejectPayment(parseInt(req.params.id, 10) || 0, req.admin.id, V.str(req.body.note, 200) || 'Payment not received');
    req.flash(ok ? 'success' : 'error', ok ? 'Payment rejected.' : 'Payment is not pending.');
    res.redirect(back(req, '/admin/payments'));
  });

  // ---- Ads ----
  app.get('/admin/ads', requireAdmin, (req, res) => {
    const status = ['active', 'payment_review', 'awaiting_payment', 'expired', 'blocked', 'all'].includes(req.query.status) ? req.query.status : 'active';
    const q = V.str(req.query.q, 80);
    const where = []; const args = [];
    if (status !== 'all') { where.push('a.status = ?'); args.push(status); }
    if (q) { where.push('(a.title LIKE ? OR a.id = ?)'); args.push(`%${q}%`, parseInt(q, 10) || -1); }
    const rows = db.prepare(`SELECT a.*, c.name AS client_name, cat.name AS cat_name, p.name AS plan_name FROM ads a
      JOIN clients c ON c.id = a.client_id JOIN categories cat ON cat.id = a.category_id LEFT JOIN plans p ON p.id = a.plan_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${status === 'active' ? 'a.rank_score DESC' : 'a.updated_at DESC'} LIMIT 300`).all(...args);
    res.html(page(req, 'Ads', adsView(req, rows, { status, q })));
  });
  const adById = (id) => db.prepare('SELECT * FROM ads WHERE id = ?').get(parseInt(id, 10) || 0);

  app.post('/admin/ads/:id/block', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad) {
      db.prepare("UPDATE ads SET status = 'blocked', block_reason = ?, rank_score = -1, updated_at = ? WHERE id = ?").run(V.str(req.body.reason, 200) || 'Removed by admin', Date.now(), ad.id);
      db.prepare('UPDATE reports SET resolved = 1 WHERE ad_id = ?').run(ad.id);
      req.flash('success', `Ad #${ad.id} blocked.`);
    }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/unblock', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad && ad.status === 'blocked') {
      const now = Date.now();
      const status = ad.expires_at && ad.expires_at > now ? 'active' : ad.paid_total_paise > 0 ? 'expired' : 'awaiting_payment';
      db.prepare('UPDATE ads SET status = ?, block_reason = NULL, updated_at = ? WHERE id = ?').run(status, now, ad.id);
      rescore(ad.id);
      req.flash('success', `Ad #${ad.id} unblocked (${status.replace('_', ' ')}).`);
    }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/boost', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad) {
      const boost = Math.max(-10, Math.min(10, parseInt(req.body.boost, 10) || 0));
      db.prepare('UPDATE ads SET admin_boost = ? WHERE id = ?').run(boost, ad.id);
      rescore(ad.id);
      req.flash('success', `Boost for ad #${ad.id} set to ${boost}.`);
    }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/top', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad) { db.prepare('UPDATE ads SET is_top = ? WHERE id = ?').run(ad.is_top ? 0 : 1, ad.id); rescore(ad.id); }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/extend', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    const days = Math.max(1, Math.min(365, parseInt(req.body.days, 10) || 0));
    if (ad && (ad.status === 'active' || ad.status === 'expired')) {
      const now = Date.now();
      const base = ad.status === 'active' && ad.expires_at > now ? ad.expires_at : now;
      db.prepare("UPDATE ads SET status = 'active', starts_at = CASE WHEN status = 'expired' THEN ? ELSE starts_at END, expires_at = ?, updated_at = ? WHERE id = ?").run(now, base + days * 86400_000, now, ad.id);
      rescore(ad.id);
      req.flash('success', `Ad #${ad.id} extended by ${days} day(s).`);
    }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/rerank', requireAdmin, (req, res) => {
    const r = runMaintenance();
    req.flash('success', `Ranking refreshed. ${r.expired} ad(s) expired.`);
    res.redirect('/admin/ads');
  });

  // ---- Reports ----
  app.get('/admin/reports', requireAdmin, (req, res) => {
    const rows = db.prepare(`SELECT r.*, a.title AS ad_title, a.status AS ad_status FROM reports r JOIN ads a ON a.id = r.ad_id
      ORDER BY r.resolved, r.id DESC LIMIT 300`).all();
    res.html(page(req, 'Reports', reportsView(req, rows)));
  });
  app.post('/admin/reports/:id/resolve', requireAdmin, (req, res) => {
    db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
    res.redirect('/admin/reports');
  });

  // ---- Settings ----
  app.get('/admin/settings', requireAdmin, (req, res) => {
    res.html(page(req, 'Settings', settingsView(req, {
      s: getSettings(), plans: db.prepare('SELECT * FROM plans ORDER BY sort, days').all(),
      cats: db.prepare('SELECT * FROM categories ORDER BY sort, name').all(), admins: db.prepare('SELECT id, name, email FROM admins').all(),
    })));
  });
  app.post('/admin/settings', requireAdmin, (req, res) => {
    const b = req.body;
    for (const k of ['site_name', 'tagline', 'upi_id', 'upi_payee_name', 'support_phone', 'support_email']) setSetting(k, V.str(b[k], 120));
    if (req.files.upi_qr?.[0]) {
      try {
        const name = saveUpload(req.files.upi_qr[0], 'ads', { maxMb: 3 });
        removeFile('ads', getSettings().upi_qr_file);
        setSetting('upi_qr_file', name);
      } catch (e) { if (e instanceof UploadError) { req.flash('error', e.message); res.redirect('/admin/settings'); return; } throw e; }
    }
    req.flash('success', 'Settings saved.');
    res.redirect('/admin/settings');
  });
  app.post('/admin/plans', requireAdmin, (req, res) => {
    const b = req.body; const ids = [].concat(b.id || []);
    tx(() => {
      ids.forEach((id, i) => {
        const name = V.str([].concat(b.name)[i], 60); const days = parseInt([].concat(b.days)[i], 10);
        const price = Math.round(Number([].concat(b.price)[i]) * 100); const top = Math.round(Number([].concat(b.top)[i] || 0) * 100);
        const priority = Math.max(1, Math.min(10, parseInt([].concat(b.priority)[i], 10) || 1)); const active = [].concat(b.active)[i] === '1' ? 1 : 0;
        if (!name || !(days > 0) || !Number.isFinite(price) || price < 0 || !Number.isFinite(top) || top < 0) return;
        if (id === 'new') db.prepare('INSERT INTO plans (name, days, price_paise, top_price_paise, priority, is_active, sort) VALUES (?,?,?,?,?,?,?)').run(name, days, price, top, priority, active, days);
        else db.prepare('UPDATE plans SET name=?, days=?, price_paise=?, top_price_paise=?, priority=?, is_active=?, sort=? WHERE id=?').run(name, days, price, top, priority, active, days, parseInt(id, 10));
      });
    });
    rescore(0);
    req.flash('success', 'Plans saved.');
    res.redirect('/admin/settings');
  });
  app.post('/admin/categories', requireAdmin, (req, res) => {
    const b = req.body; const ids = [].concat(b.id || []);
    tx(() => {
      ids.forEach((id, i) => {
        const name = V.str([].concat(b.name)[i], 40); if (!name) return;
        const icon = V.str([].concat(b.icon)[i], 4) || '📦'; const sort = parseInt([].concat(b.sort)[i], 10) || 0; const active = [].concat(b.active)[i] === '0' ? 0 : 1;
        if (id === 'new') {
          let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
          if (db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug)) slug += `-${Date.now().toString(36)}`;
          db.prepare('INSERT INTO categories (name, slug, icon, sort, is_active) VALUES (?,?,?,?,?)').run(name, slug, icon, sort, active);
        } else db.prepare('UPDATE categories SET name=?, icon=?, sort=?, is_active=? WHERE id=?').run(name, icon, sort, active, parseInt(id, 10));
      });
    });
    req.flash('success', 'Categories saved.');
    res.redirect('/admin/settings');
  });
  app.post('/admin/admins', requireAdmin, (req, res) => {
    const email = V.str(req.body.email, 120).toLowerCase(); const name = V.str(req.body.name, 60);
    if (!V.isValidEmail(email) || !name || String(req.body.password || '').length < 10) { req.flash('error', 'Enter name, valid email and a password of 10+ characters.'); res.redirect('/admin/settings'); return; }
    if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(email)) { req.flash('error', 'Admin already exists.'); res.redirect('/admin/settings'); return; }
    db.prepare('INSERT INTO admins (name, email, password_hash, created_at) VALUES (?,?,?,?)').run(name, email, hashPassword(req.body.password), Date.now());
    req.flash('success', 'Admin added.');
    res.redirect('/admin/settings');
  });
  app.post('/admin/password', requireAdmin, (req, res) => {
    const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!verifyPassword(req.body.current, a.password_hash)) { req.flash('error', 'Current password is incorrect.'); res.redirect('/admin/settings'); return; }
    if (String(req.body.password || '').length < 10) { req.flash('error', 'New password must be 10+ characters.'); res.redirect('/admin/settings'); return; }
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), a.id);
    req.flash('success', 'Password updated.');
    res.redirect('/admin/settings');
  });
}

module.exports = { register };
