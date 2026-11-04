'use strict';
// Owner / admin portal: verify clients (KYC + video call), confirm payments, manage ads, plans and settings.

const path = require('node:path');
const { db, tx, getSettings, setSetting, parseImages } = require('../db');
const { html, rupees, fmtDate, fmtDay, timeLeft, timeAgo, approveTimeText, PAYMENT_TIME_TEXT } = require('../lib/html');
const { icon } = require('../views/icons');
const { renderPage } = require('../views/layout');
const { csrf, pill, adUrl, imgUrl, field, cityDatalist, stateSelect, idFields, addressFields } = require('../views/components');
const { checkId, describeId, ID_TYPES } = require('../idproof');
const { hashPassword, verifyPassword, randomToken, rateLimit } = require('../lib/security');
const { saveUpload, saveDataUrl, removeFile, UploadError, sendFile, DIRS, safeName } = require('../lib/files');
const V = require('../validators');
const P = require('../payments');
const W = require('../wallet');
const rtc = require('../rtc');
const { rescore, runMaintenance } = require('../ranking');
const { callView } = require('./client');
const Cat = require('../categories');
const Ph = require('../photos');
const Free = require('../freeads');
const Staff = require('../staff');
const Brand = require('../brand');
const life = require('../lifecycle');
const notify = require('../notify');
const { SLOTS, ALL_SLOTS, slotLabels, slotPrices, maskFrom } = require('../slots');
const { sendEmail, sendSmsOtp, emailConfigured, smsConfigured, smsProvider, sendAlert, alertChannels } = require('../messaging');

const page = (req, title, body, scripts = []) => renderPage(req, { title, body, portal: 'admin', scripts });
const back = (req, fallback) => {
  const ref = String(req.headers.referer || '');
  try { const u = new URL(ref); if (u.pathname.startsWith('/admin')) return u.pathname + u.search; } catch { /* ignore */ }
  return fallback;
};

// Staff roles (src/staff.js): the OWNER can do everything; every other login has one role made by the owner
// (a name + ticked permissions, Admin → Settings → Staff & roles). Each admin page needs one permission.
const isOwner = (req) => !!(req.admin && req.admin.owner);
const can = (req, perm) => Staff.can(req, perm);

function requireAdmin(req, res) {
  if (!req.admin) { res.redirect('/admin/login'); return; }
  const need = Staff.needFor(req.path);
  if (!Staff.can(req, need)) {
    req.flash('error', need === 'owner' ? 'Only the owner can do this.' : 'Your login does not have access to that page.');
    const home = Staff.homeFor(req.admin);
    res.redirect(home === req.path ? '/admin/account' : home); return;
  }
  req.adminCounts = {
    kyc: can(req, 'sellers') ? db.prepare("SELECT COUNT(*) n FROM clients WHERE status IN ('pending','video_call')").get().n : 0,
    pay: can(req, 'payments') ? db.prepare("SELECT (SELECT COUNT(*) FROM payments WHERE status = 'pending') + (SELECT COUNT(*) FROM wallet_topups WHERE status = 'pending') n").get().n : 0,
    reports: can(req, 'reports') ? db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved = 0').get().n : 0,
    free: can(req, 'ads') ? db.prepare("SELECT COUNT(*) n FROM ads WHERE status = 'free_review'").get().n : 0,
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
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' });
  const kpi = (href, ic, tone, value, label, sub = '') => html`<a class="kpi kpi-${tone}" href="${href}">
    <span class="kpi-ic">${icon(ic, { size: 20 })}</span><span class="kpi-v">${value}</span><span class="kpi-l">${label}</span>${sub ? html`<span class="kpi-sub">${sub}</span>` : ''}</a>`;
  const first = String(req.admin.name || '').split(' ')[0];
  return html`
  <div class="dash-hero">
    <div><p class="dash-date">${today}</p><h1>${hello}${first ? `, ${first}` : ''}</h1>
      <p class="muted">${d.pendingPay || d.pendingKyc ? html`You have ${can(req, 'payments') && d.pendingPay ? html`<strong>${d.pendingPay} payment${d.pendingPay === 1 ? '' : 's'}</strong> to confirm` : ''}${can(req, 'payments') && d.pendingPay && can(req, 'sellers') && d.pendingKyc ? ' and ' : ''}${can(req, 'sellers') && d.pendingKyc ? html`<strong>${d.pendingKyc} seller${d.pendingKyc === 1 ? '' : 's'}</strong> to verify` : ''}.` : 'Everything is up to date.'}</p></div>
    <div class="dash-actions">
      ${can(req, 'payments') ? html`<a class="btn btn-accent" href="/admin/payments">${icon('card', { size: 16 })} Confirm payments</a>` : ''}
      ${can(req, 'sellers') ? html`<a class="btn" href="/admin/clients/new">${icon('plus', { size: 16 })} Add client</a>` : ''}
      <a class="btn btn-ghost" href="/" target="_blank">${icon('eye', { size: 16 })} View site</a>
    </div>
  </div>
  <div class="kpis">
    ${can(req, 'payments') ? kpi('/admin/payments', 'card', 'warn', d.pendingPay, 'Payments to confirm', 'Only you can make them live') : ''}
    ${can(req, 'sellers') ? kpi('/admin/clients?status=pending', 'users', 'info', d.pendingKyc, 'Sellers to verify') : ''}
    ${can(req, 'ads') ? kpi('/admin/ads?status=active', 'layers', 'ok', d.liveAds, 'Ads live now', `${d.paidLive} paid · ${d.freeLive} free`) : ''}
    ${can(req, 'money') ? kpi('/admin/reports#money', 'chart', 'main', rupees(d.revMonth), 'Received this month', `${rupees(d.revToday)} today`) : ''}
    ${can(req, 'money') ? kpi('/admin/reports#money', 'receipt', 'main', rupees(d.revTotal), 'Received in total') : ''}
    ${can(req, 'sellers') ? kpi('/admin/clients?status=approved', 'shield', 'ok', d.approved, 'Verified sellers', `${d.newSellers} new this week`) : ''}
  </div>
  <div class="cols2">
    ${can(req, 'payments') ? html`<section class="card">
      <div class="section-head"><h2>Payments to confirm</h2><a href="/admin/payments" class="small">View all</a></div>
      ${d.payList.length ? html`<ul class="list">${d.payList.map((p) => html`<li><a href="/admin/payments"><strong>${rupees(p.amount_paise - (p.wallet_paise || 0))}</strong> <span class="muted small">${p.client_name} · UTR ${p.utr || '—'} · ${timeAgo(p.created_at)}</span></a>${pill(p.status)}</li>`)}</ul>` : html`<div class="empty-mini">${icon('check', { size: 18 })} No payments waiting.</div>`}
    </section>` : ''}
    ${can(req, 'sellers') ? html`<section class="card">
      <div class="section-head"><h2>Sellers waiting for you</h2><a href="/admin/clients?status=pending" class="small">View all</a></div>
      ${d.kycList.length ? html`<ul class="list">${d.kycList.map((c) => html`<li><a href="/admin/clients/${c.id}"><strong>${c.name}</strong> <span class="muted small">${c.city || ''} · ${timeAgo(c.created_at)}</span></a>${pill(c.status)}</li>`)}</ul>` : html`<div class="empty-mini">${icon('check', { size: 18 })} All sellers checked.</div>`}
    </section>` : ''}
  </div>
  ${can(req, 'money') ? html`<section class="card">
    <div class="section-head"><h2>Money received — last 14 days</h2><a href="/admin/reports#money" class="small">Full report</a></div>
    <div class="bars">${d.daily.map((x) => html`<div class="bar" title="${x.day}: ${rupees(x.total)}"><div style="height:${d.maxDaily ? Math.max(2, (x.total / d.maxDaily) * 100) : 2}%"></div><span>${x.day.slice(8)}</span></div>`)}</div>
  </section>` : ''}`;
}

function clientsView(req, rows, filter) {
  const tabs = [['pending', 'To verify'], ['unverified', 'OTP not done'], ['video_call', 'Video call'], ['approved', 'Approved'], ['deactivated', 'Deactivated'], ['suspended', 'Blocked'], ['rejected', 'Rejected'], ['all', 'All']];
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
  // Links sent to clients must be https (your domain) so their camera works — set BASE_URL in .env.
  const base = (process.env.BASE_URL || req.origin).replace(/\/+$/, '');
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
        <div><dt>Email</dt><dd>${c.email} ${c.email_verified_at ? html`<span class="pill pill-ok">✔ verified</span>` : html`<span class="pill pill-warn">not verified</span>`}</dd></div>
        <div><dt>Mobile OTP</dt><dd>${c.phone_verified_at ? html`<span class="pill pill-ok">✔ verified</span>` : html`<span class="pill pill-muted">${smsConfigured() ? 'not verified' : 'SMS not set up'}</span>`}</dd></div>
        ${c.auto_approved ? html`<div><dt>Approval</dt><dd><span class="pill pill-info">Auto-approved</span></dd></div>` : ''}
        <div class="wide"><dt>ID for age verification</dt><dd class="mono">${describeId(c)}</dd></div>
        <div><dt>Date of birth</dt><dd>${c.dob ? html`${fmtDay(Date.parse(`${c.dob}T00:00:00+05:30`))} <span class="pill ${V.ageFromDob(c.dob) >= 18 ? 'pill-ok' : 'pill-bad'}">${V.ageFromDob(c.dob)} yrs</span>` : html`<span class="muted">Not given yet</span>`}</dd></div>
        <div class="wide"><dt>Address (optional)</dt><dd>${[c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') || html`<span class="muted">Not given</span>`}</dd></div>
      </dl>
      <form method="post" action="/admin/clients/${c.id}/wallet" class="walletadmin">
        ${csrf(req)}
        <span><span class="muted small">Balance</span><strong>${rupees(c.wallet_paise || 0)}</strong></span>
        <input type="number" name="amount" step="1" placeholder="₹ e.g. 100 or -100" required aria-label="Amount">
        <input name="note" maxlength="120" placeholder="Note (seller sees it)" aria-label="Note">
        <button class="btn btn-sm">Add / remove</button>
      </form>
      <h3>Documents</h3>
      <div class="docs">
        ${docLink(c.id_file || c.aadhaar_file, `${(ID_TYPES[c.id_type] || ID_TYPES.aadhaar).label}`)}
        ${c.id_back_file || c.aadhaar_back_file ? docLink(c.id_back_file || c.aadhaar_back_file, 'Back side') : ''}
        ${c.pan_file && c.pan_file !== c.id_file ? docLink(c.pan_file, 'PAN card') : ''}
        ${c.address_proof_file ? docLink(c.address_proof_file, 'Address proof') : ''}
        ${c.photo_file ? docLink(c.photo_file, 'Uploaded photo') : ''}
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
          ${['pending', 'video_call', 'unverified', 'rejected'].includes(c.status) ? html`<button class="btn btn-ok" name="action" value="approve">✔ Approve</button>` : ''}
          ${c.status === 'suspended' ? html`<button class="btn btn-ok" name="action" value="approve">Unblock</button>` : ''}
          ${c.status === 'deactivated' ? html`<button class="btn btn-ok" name="action" value="reactivate">Reactivate</button>` : ''}
          ${c.status === 'pending' || c.status === 'video_call' || c.status === 'unverified' ? html`<button class="btn btn-danger" name="action" value="reject">✖ Reject</button>` : ''}
          ${c.status === 'approved' ? html`<button class="btn" name="action" value="deactivate" data-confirm="Deactivate this client? Their live ads are hidden and their remaining paid days are saved until reactivation.">Deactivate</button>` : ''}
          ${c.status === 'approved' || c.status === 'deactivated' ? html`<button class="btn btn-danger" name="action" value="suspend" data-confirm="Block this client? They cannot log in and all their ads are hidden.">Block</button>` : ''}
          ${c.status === 'rejected' || c.status === 'suspended' ? html`<button class="btn" name="action" value="pending">Move back to review</button>` : ''}
        </div>
        ${c.status === 'deactivated' ? html`<p class="small muted">Deactivated by ${c.deactivated_by === 'client' ? 'the client' : 'admin'} on ${fmtDate(c.deactivated_at)}.</p>` : ''}
      </form>
      ${c.status !== 'deleted' ? html`
      <form method="post" action="/admin/clients/${c.id}/delete" class="danger-zone" data-confirm="DELETE ${c.name} permanently? Their ID documents, photos, videos and ads are removed for good. This cannot be undone.">
        ${csrf(req)}
        <button class="btn btn-danger btn-sm">🗑 Delete client permanently</button>
        <span class="small muted">Removes personal data & documents. Payment records stay (anonymised) for your accounts.</span>
      </form>` : ''}

      <div class="callbox">
        <h3>🎥 Video call</h3>
        ${c.status !== 'deleted' && c.status !== 'suspended' ? html`
        <form method="post" action="/admin/clients/${c.id}/ring" class="callnow">
          ${csrf(req)}
          <button class="btn btn-primary">${icon('video', { size: 18 })} Video call now</button>
          <span class="small muted">${rtc.ringActive(c) ? html`<strong class="ok">Ringing now</strong> — ` : ''}Their screen rings if they have ${req.settings.site_name} open, and they get an email with the join link.</span>
        </form>` : ''}
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
  <div class="kyc-shell">
    <aside class="kyc-aside">
      <h2>Add a client yourself</h2>
      <p>For clients you meet in person or on a call.</p>
      <ul class="kyc-points">
        <li>${icon('user', { size: 20 })}<span><strong>Details</strong>Name, mobile, email, date of birth</span></li>
        <li>${icon('id', { size: 20 })}<span><strong>One ID</strong>Aadhaar, PAN or Passport</span></li>
        <li>${icon('camera', { size: 20 })}<span><strong>Live photo</strong>From your webcam — needed to approve now</span></li>
        <li>${icon('shield', { size: 20 })}<span><strong>Login</strong>Set or auto-generate a password</span></li>
      </ul>
    </aside>
    <section class="card kyc-card">
      <h1>Add a client</h1>
      ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
      <form method="post" action="/admin/clients/new" enctype="multipart/form-data" class="form" data-wizard>
        ${csrf(req)}
        <div data-step data-title="Client">
          <div class="row2">${field('Full name (as on the ID)', html`<input name="name" required maxlength="80" value="${v.name}">`)}${field('Date of birth (18+ only)', html`<input type="date" name="dob" required max="${V.maxDob()}" min="1925-01-01" value="${v.dob}">`, 'Check it against the ID')}</div>
          <div class="row2">${field('Mobile', html`<input name="phone" required maxlength="13" inputmode="numeric" value="${v.phone}">`)}${field('Email (login ID)', html`<input name="email" type="email" required maxlength="120" value="${v.email}">`)}</div>
          ${field('Business name (optional)', html`<input name="business_name" maxlength="80" value="${v.business_name}">`)}
        </div>
        <div data-step data-title="ID">
          ${idFields(v)}
        </div>
        <div data-step data-title="Live photo">
          <div class="camera" data-camera data-auto="3">
            <div class="camera-stage"><video playsinline muted data-camera-video></video><img alt="" data-camera-preview hidden><div class="camera-count" data-camera-count hidden></div></div>
            <div class="camera-actions"><button type="button" class="btn btn-primary" data-camera-start>${icon('camera', { size: 18 })} Start camera</button><button type="button" class="btn btn-accent" data-camera-snap hidden>Capture now</button><button type="button" class="btn btn-ghost" data-camera-retake hidden>Retake</button></div>
            <p class="hint" data-camera-status>Needed if you approve now. Otherwise you can take it later on a video call.</p>
            <input type="hidden" name="live_photo_data" data-camera-output>
          </div>
        </div>
        <div data-step data-title="Login">
          ${addressFields(v)}
          ${field('Password', html`<input name="password" type="text" minlength="6" autocomplete="off" placeholder="Leave empty to auto-generate">`, 'At least 6 characters. You will see it once after saving.')}
          <label class="check"><input type="checkbox" name="approve_now" value="1" checked> <span>I have verified this client — approve now so they can log in and post ads</span></label>
        </div>
        <div class="form-actions" data-wizard-submit><button class="btn btn-primary btn-lg">${icon('check', { size: 18 })} Create client</button></div>
      </form>
    </section>
  </div>`;
}

function topupsTable(req, rows) {
  return html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>#</th><th>Date</th><th>Seller</th><th>Amount</th><th>UTR</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((t) => html`<tr>
      <td>T${t.id}</td><td>${fmtDate(t.created_at)}</td><td><a href="/admin/clients/${t.client_id}">${t.client_name}</a></td>
      <td><strong>${rupees(t.amount_paise)}</strong></td>
      <td class="mono">${t.utr}${t.screenshot_file ? html`<div><a class="small" href="/admin/payment-file/${t.screenshot_file}" target="_blank">View screenshot</a></div>` : ''}</td>
      <td>${pill(t.status === 'pending' ? 'payment_review' : t.status)}${t.admin_note ? html`<div class="small muted">${t.admin_note}</div>` : ''}</td>
      <td class="actions">${t.status === 'pending' ? html`
        <form method="post" action="/admin/topups/${t.id}/confirm" class="inline">${csrf(req)}<button class="btn btn-ok btn-sm">✔ Confirm & add to balance</button></form>
        <form method="post" action="/admin/topups/${t.id}/reject" class="inline reject-form">${csrf(req)}<input name="note" placeholder="Reason" maxlength="200" list="reject-reasons"><button class="btn btn-danger btn-sm">Reject</button></form>` : ''}</td>
    </tr>`)}</tbody></table></div>`;
}

function paymentsView(req, rows, status, topups = []) {
  const tabs = !can(req, 'money') ? [] : [['pending', 'To confirm'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['failed', 'Failed later'], ['all', 'All']];
  return html`
  <div class="page-head"><div><h1>Payments</h1>${!can(req, 'money') ? html`<p class="muted">Check each payment in the bank / UPI app, then confirm or reject it. You see only payments that are waiting.</p>` : ''}</div></div>
  ${topups.length ? html`<h2>Balance top-ups ${status === 'pending' ? 'to confirm' : ''}</h2>${topupsTable(req, topups)}<h2>Ad payments</h2>` : ''}
  <div class="tabs">${tabs.map(([k, l]) => html`<a class="tab ${status === k ? 'active' : ''}" href="/admin/payments?status=${k}">${l}</a>`)}</div>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>#</th><th>Date</th><th>Client</th><th>Ad</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((p) => html`<tr>
      <td>${p.id}</td><td>${fmtDate(p.created_at)}</td>
      <td><a href="/admin/clients/${p.client_id}">${p.client_name}</a></td>
      <td><a href="${adUrl({ id: p.ad_id, title: p.ad_title })}" target="_blank">${p.ad_title}</a></td>
      <td>${p.days} days${p.top_slots ? html`<div class="small"><span class="pill pill-top">TOP ${slotLabels(p.top_slots).join(', ')}</span></div>` : ''}</td>
      <td><strong>${rupees(p.amount_paise)}</strong>${p.wallet_paise ? html`<div class="small muted">${p.method === 'wallet' ? 'all from balance' : html`UPI ${rupees(p.amount_paise - p.wallet_paise)} + balance ${rupees(p.wallet_paise)}`}</div>` : ''}</td>
      <td>${p.method === 'wallet' ? html`Balance` : p.method === 'razorpay' ? html`Online<div class="small muted mono">${p.razorpay_payment_id || p.razorpay_order_id}</div>` : html`UPI <span class="mono">${p.utr}</span>${p.screenshot_file ? html`<div><a class="small" href="/admin/payment-file/${p.screenshot_file}" target="_blank">View screenshot</a></div>` : ''}`}</td>
      <td>${pill(p.status)}${p.admin_note ? html`<div class="small muted">${p.admin_note}</div>` : ''}</td>
      <td class="actions">${p.status === 'pending' ? html`
        <form method="post" action="/admin/payments/${p.id}/confirm" class="inline">${csrf(req)}<button class="btn btn-ok btn-sm">✔ Confirm & go live</button></form>
        <form method="post" action="/admin/payments/${p.id}/reject" class="inline reject-form">${csrf(req)}<input name="note" placeholder="Reason (seller sees it)" maxlength="200" list="reject-reasons"><button class="btn btn-danger btn-sm">Reject</button></form>` : p.status === 'paid' ? html`<a class="btn btn-sm" href="/admin/payments/${p.id}/receipt" target="_blank">${icon('receipt', { size: 15 })} Receipt</a>
        <form method="post" action="/admin/payments/${p.id}/failed" class="inline reject-form" data-confirm="Mark payment #${p.id} as failed? The ad goes back to unpaid and is removed from the site until the seller pays again.">${csrf(req)}<input name="note" placeholder="Why (seller sees it)" maxlength="200" list="fail-reasons"><button class="btn btn-danger btn-sm">Payment failed</button></form>` : ''}</td>
    </tr>`)}</tbody></table><datalist id="reject-reasons"><option value="UTR not found in our bank account"><option value="Amount received is less than the total"><option value="Payment sent to a wrong UPI ID"><option value="Same UTR already used"></datalist><datalist id="fail-reasons"><option value="Payment bounced / reversed by the bank"><option value="Charge-back from the card or UPI app"><option value="Money never reached our account"></datalist></div>` : html`<div class="card empty center"><p class="muted">Nothing here.</p></div>`}`;
}


function adsView(req, rows, f) {
  const tabs = [['active', 'Live'], ['free_review', `Free ads to check${req.adminCounts && req.adminCounts.free ? ` (${req.adminCounts.free})` : ''}`], ['payment_review', 'Payment review'], ['awaiting_payment', 'Unpaid'], ['paused', 'Deactivated'], ['expired', 'Expired'], ['blocked', 'Blocked'], ['deleted', 'Deleted'], ['all', 'All']];
  return html`
  <div class="page-head"><h1>Ads</h1><form method="post" action="/admin/ads/rerank" class="inline">${csrf(req)}<button class="btn btn-ghost btn-sm">↻ Re-run ranking now</button></form></div>
  <div class="tabs">${tabs.map(([k, l]) => html`<a class="tab ${f.status === k ? 'active' : ''}" href="/admin/ads?status=${k}">${l}</a>`)}</div>
  <form class="search-inline" method="get"><input type="hidden" name="status" value="${f.status}"><input type="search" name="q" value="${f.q}" placeholder="Search title or ad ID"><button class="btn">Search</button></form>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>Ad</th><th>Seller</th><th>Status</th><th>Plan / paid</th><th>Ends</th><th>Views</th><th></th></tr></thead>
    <tbody>${rows.map((a) => { const im = parseImages(a)[0]; return html`<tr>
      <td><div class="cell-ad">${im ? html`<img src="${imgUrl(im)}" alt="" loading="lazy">` : html`<div class="avatar">${icon('image', { size: 16 })}</div>`}
        <div><a href="${adUrl(a)}" target="_blank"><strong>${a.title}</strong></a><div class="small muted">#${a.id} · ${a.cat_name} · ${a.city}</div></div></div></td>
      <td><a href="/admin/clients/${a.client_id}">${a.client_name}</a></td>
      <td><div class="pills">${pill(a.status)}${a.top_slots ? html`<span class="pill pill-top">TOP ${slotLabels(a.top_slots).join(', ')}</span>` : ''}${a.admin_top_until > Date.now() ? html`<span class="pill pill-top" title="Set by admin">★ Admin TOP till ${fmtDay(a.admin_top_until)}</span>` : ''}${a.admin_boost ? html`<span class="pill pill-info">boost ${a.admin_boost}</span>` : ''}</div>${a.block_reason ? html`<div class="small muted">${a.block_reason}</div>` : ''}${a.status === 'paused' ? html`<div class="small muted">${a.paused_by === 'account' ? 'Seller account deactivated' : 'Deactivated by admin'} · ${Math.ceil((a.paused_remaining_ms || 0) / 86400_000)} day(s) saved</div>` : ''}</td>
      <td>${a.is_free ? html`<span class="pill pill-muted">Free ad</span>` : html`${a.plan_name || '—'}<div class="small muted">${a.paid_total_paise ? `${rupees(a.paid_total_paise)} paid` : ''}</div>`}</td>
      <td>${a.expires_at ? html`${fmtDay(a.expires_at)}<div class="small muted">${a.status === 'active' ? timeLeft(a.expires_at) : ''}</div>` : '—'}</td>
      <td>${a.views}</td>
      <td class="actions"><div class="act-row">
        ${a.status === 'free_review' ? html`<form method="post" action="/admin/ads/${a.id}/free/approve" class="inline">${csrf(req)}<button class="btn btn-ok btn-sm">${icon('check', { size: 14 })} Approve</button></form>` : ''}
        ${a.status === 'active' || a.status === 'expired' ? html`<button type="button" class="btn btn-primary btn-sm" data-dialog-open="ad-promote"
          data-fill-action="/admin/ads/${a.id}/promote" data-fill-title="${a.title}" data-fill-boost="${a.admin_boost}"
          data-fill-topdays="${a.admin_top_until > Date.now() ? Math.ceil((a.admin_top_until - Date.now()) / 86400_000) : ''}">${icon('bolt', { size: 14 })} Boost & TOP</button>` : ''}
        ${a.status === 'paused' ? html`<form method="post" action="/admin/ads/${a.id}/resume" class="inline">${csrf(req)}<button class="btn btn-ok btn-sm">Reactivate</button></form>` : ''}
        ${a.status === 'blocked' ? html`<form method="post" action="/admin/ads/${a.id}/unblock" class="inline">${csrf(req)}<button class="btn btn-sm">Unblock</button></form>` : ''}
        ${a.status !== 'deleted' ? html`<details class="more-menu"><summary class="btn btn-sm btn-ghost" aria-label="More actions for ad ${a.id}">More ${icon('down', { size: 14 })}</summary><div class="more-pop">
          ${a.status === 'free_review' ? html`<form method="post" action="/admin/ads/${a.id}/free/reject" class="more-form">${csrf(req)}<input name="note" placeholder="Why not (seller sees it)" maxlength="200"><button class="btn btn-sm">Turn down free ad</button></form>` : ''}
          ${a.status === 'active' ? html`<form method="post" action="/admin/ads/${a.id}/pause">${csrf(req)}<button class="more-item" title="Hide the ad; remaining paid days are saved">${icon('eye', { size: 15 })} Deactivate (days saved)</button></form>` : ''}
          ${['active', 'paused', 'expired', 'payment_review', 'free_review'].includes(a.status) ? html`<form method="post" action="/admin/ads/${a.id}/unpaid" data-confirm="Move ad #${a.id} to unpaid? It leaves the site until the seller pays again and you confirm.">${csrf(req)}<input type="hidden" name="note" value="Payment failed"><button class="more-item">${icon('card', { size: 15 })} Move to unpaid (payment failed)</button></form>` : ''}
          ${a.status !== 'blocked' ? html`<form method="post" action="/admin/ads/${a.id}/block" class="more-form">${csrf(req)}<input name="reason" placeholder="Reason for blocking" maxlength="200"><button class="btn btn-danger btn-sm">Block</button></form>` : ''}
          <form method="post" action="/admin/ads/${a.id}/delete" data-confirm="Delete ad #${a.id} permanently? Photos and videos are removed.">${csrf(req)}<button class="more-item bad">${icon('trash', { size: 15 })} Delete permanently</button></form>
        </div></details>` : ''}
      </div></td></tr>`; })}
    </tbody></table></div>` : html`<div class="card empty center"><p class="muted">No ads.</p></div>`}
  <dialog class="modal" id="ad-promote" style="width:min(560px,calc(100vw - 32px))"><form method="post" data-fill="action">
    ${csrf(req)}
    <div class="modal-body"><h2>Boost & TOP — <span data-fill="title"></span></h2>
      <h3 style="margin:0">Put it in TOP ads</h3>
      <div class="row2">
        ${field('For how many days', html`<input type="number" name="top_days" min="0" max="365" data-fill="topdays" placeholder="e.g. 3">`, '0 or empty = no admin TOP')}
        ${field('…or until (India time)', html`<input type="datetime-local" name="top_until">`, 'Optional, overrides days')}
      </div>
      <div class="field"><span class="label">In these time slots</span>
        <div class="slots" style="margin:0">${SLOTS.map((sl) => html`<label class="slot"><input type="checkbox" name="top_slots[]" value="${sl.slot}" checked><span><b>${sl.label}</b></span></label>`)}</div>
      </div>
      <div class="row2">
        ${field('Ranking boost (−10 … +10)', html`<input type="number" name="boost" min="-10" max="10" data-fill="boost">`, 'Higher boost = above ads that paid the same')}
        ${field('Add free days to the run', html`<input type="number" name="extend_days" min="0" max="365" value="0">`)}
      </div>
    </div>
    <div class="modal-foot"><button type="button" class="btn" data-dialog-close>Cancel</button><button class="btn" name="remove_top" value="1">Remove admin TOP</button><button class="btn btn-primary">Save</button></div>
  </form></dialog>`;
}

function categoriesView(req, mains, counts) {
  const allTargets = [];
  for (const m of mains) { if (!m.subs.length) allTargets.push({ id: m.id, label: m.name }); for (const sc of m.subs) allTargets.push({ id: sc.id, label: `${m.name} › ${sc.name}` }); }
  const n = (c) => counts[c.id] || 0;
  const total = (m) => n(m) + m.subs.reduce((t, sc) => t + n(sc), 0);
  const editBtn = (c, isSub) => html`<button type="button" class="icon-btn" title="Edit ${c.name}" aria-label="Edit ${c.name}" data-dialog-open="${isSub ? 'cat-edit-sub' : 'cat-edit-main'}"
    data-fill-action="/admin/categories/${c.id}" data-fill-name="${c.name}" data-fill-sort="${c.sort}" data-fill-active="${c.is_active ? '1' : '0'}" data-fill-parent="${c.parent_id || ''}" data-fill-title="${c.name}">${icon('edit', { size: 15 })}</button>`;
  const delBtn = (c, subs = []) => {
    const ads = n(c) + subs.reduce((t, sc) => t + n(sc), 0);
    const what = [subs.length ? `Its ${subs.length} sub-categor${subs.length === 1 ? 'y' : 'ies'} will be deleted too.` : '', ads ? `${ads} ad${ads === 1 ? '' : 's'} must move to another category.` : 'It has no ads.'].filter(Boolean).join(' ');
    return html`<button type="button" class="icon-btn danger" title="Delete ${c.name}" aria-label="Delete ${c.name}" data-dialog-open="cat-delete"
    data-fill-action="/admin/categories/${c.id}/delete" data-fill-title="${c.name}" data-fill-count="${what}" data-fill-self="${[c.id, ...subs.map((sc) => sc.id)].join(',')}">${icon('trash', { size: 15 })}</button>`;
  };
  const toggle = (c) => html`<form method="post" action="/admin/categories/${c.id}" class="inline">${csrf(req)}<input type="hidden" name="is_active" value="${c.is_active ? '0' : '1'}">
    <button class="icon-btn" title="${c.is_active ? 'Hide from site' : 'Show on site'}" aria-label="${c.is_active ? 'Hide' : 'Show'} ${c.name}">${icon(c.is_active ? 'eye' : 'x', { size: 15 })}</button></form>`;
  return html`
  <div class="page-head">
    <div><h1>Categories</h1><p class="muted">Ads are posted in a sub-category. Hidden categories disappear from menus; their running ads stay live.</p></div>
    <form method="post" action="/admin/categories/add" class="cat-add card" style="margin:0;padding:10px 12px">
      ${csrf(req)}
      <input name="name" maxlength="40" required placeholder="New main category" aria-label="Main category name" style="width:200px">
      <button class="btn btn-primary">${icon('plus', { size: 16 })} Add main category</button>
    </form>
  </div>
  <div class="catgrid">
    ${mains.map((m) => html`<article class="catcard ${m.is_active ? '' : 'off'}">
      <div class="catcard-head">
        <img class="catcard-img" src="${m.image ? imgUrl(m.image) : Ph.photoUrl(Ph.categoryPhotoName(m))}" alt="">
        <div class="catcard-name"><strong>${m.name}</strong><small>${m.subs.length} sub-categor${m.subs.length === 1 ? 'y' : 'ies'} · ${total(m)} ad${total(m) === 1 ? '' : 's'}${m.is_active ? '' : ' · hidden'}</small></div>
        ${toggle(m)}${editBtn(m, false)}${delBtn(m, m.subs)}
      </div>
      <form method="post" action="/admin/categories/${m.id}/photo" enctype="multipart/form-data" class="catphoto">${csrf(req)}
        <label class="btn btn-sm btn-ghost">${icon('image', { size: 15 })} ${m.image ? 'Change photo' : 'Use my own photo'}<input type="file" name="image" accept="image/jpeg,image/png,image/webp" hidden data-autosubmit></label>
        ${m.image ? html`<button class="btn btn-sm btn-ghost" name="reset" value="1">Use built-in photo</button>` : html`<span class="small muted">Built-in photo</span>`}
      </form>
      <div class="subchips">
        ${m.subs.length ? m.subs.map((sc) => html`<span class="subchip ${sc.is_active ? '' : 'off'}">${sc.name}${n(sc) ? html` <span class="muted">${n(sc)}</span>` : ''}${editBtn(sc, true)}${delBtn(sc)}</span>`) : html`<span class="muted small">No sub-categories — ads go straight into ${m.name}.</span>`}
      </div>
      <form method="post" action="/admin/categories/add" class="addsub">
        ${csrf(req)}<input type="hidden" name="parent_id" value="${m.id}">
        <input name="name" maxlength="40" required placeholder="Add a sub-category…" aria-label="New sub-category of ${m.name}">
        <button class="btn btn-sm" aria-label="Add">${icon('plus', { size: 16 })}</button>
      </form>
    </article>`)}
  </div>

  <dialog class="modal" id="cat-edit-main"><form method="post" data-fill="action">
    ${csrf(req)}
    <div class="modal-body"><h2>Edit <span data-fill="title"></span></h2>
      <div class="row2" style="grid-template-columns:1fr 90px">
        ${field('Name', html`<input name="name" maxlength="40" required data-fill="name">`)}${field('Order', html`<input type="number" name="sort" data-fill="sort">`)}
      </div>
      ${field('Show on site', html`<select name="is_active" data-fill="active"><option value="1">Yes — visible</option><option value="0">No — hidden</option></select>`)}
    </div>
    <div class="modal-foot"><button type="button" class="btn" data-dialog-close>Cancel</button><button class="btn btn-primary">Save</button></div>
  </form></dialog>

  <dialog class="modal" id="cat-edit-sub"><form method="post" data-fill="action">
    ${csrf(req)}
    <div class="modal-body"><h2>Edit <span data-fill="title"></span></h2>
      <div class="row2" style="grid-template-columns:1fr 90px">${field('Name', html`<input name="name" maxlength="40" required data-fill="name">`)}${field('Order', html`<input type="number" name="sort" data-fill="sort">`)}</div>
      ${field('Main category', html`<select name="parent_id" data-fill="parent">${mains.map((m) => html`<option value="${m.id}">${m.name}</option>`)}</select>`, 'Move it under another main category if you like.')}
      ${field('Show on site', html`<select name="is_active" data-fill="active"><option value="1">Yes — visible</option><option value="0">No — hidden</option></select>`)}
    </div>
    <div class="modal-foot"><button type="button" class="btn" data-dialog-close>Cancel</button><button class="btn btn-primary">Save</button></div>
  </form></dialog>

  <dialog class="modal" id="cat-delete"><form method="post" data-fill="action">
    ${csrf(req)}
    <div class="modal-body"><h2>Delete <span data-fill="title"></span>?</h2>
      <p class="muted" data-fill="count"></p>
      ${field('Move its ads to', html`<select name="move_to"><option value="">— (only needed if it has ads)</option>${allTargets.map((t) => html`<option value="${t.id}" data-opt>${t.label}</option>`)}</select>`)}
    </div>
    <div class="modal-foot"><button type="button" class="btn" data-dialog-close>Cancel</button><button class="btn btn-danger">${icon('trash', { size: 16 })} Delete</button></div>
  </form></dialog>`;
}

function messagingSetupCard(req, s) {
  const prov = smsProvider();
  const host = s.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const mailProv = s.mail_provider || (/brevo|sendinblue/.test(host) ? 'brevo' : host === 'smtp.gmail.com' ? 'gmail' : 'other');
  return html`
  <section class="card setup-card">
    <h2>Email & SMS ${emailConfigured() ? html`<span class="pill pill-ok">Email ready</span>` : html`<span class="pill pill-warn">Email not set up</span>`} ${smsConfigured() ? html`<span class="pill pill-ok">SMS ready</span>` : html`<span class="pill pill-muted">SMS off</span>`}</h2>
    <div class="cols2">
      <form method="post" action="/admin/messaging/email" class="form" data-mail-form>
        ${csrf(req)}
        ${field('Email service', html`<select name="provider" data-mail-provider>
          <option value="gmail" ${mailProv === 'gmail' ? 'selected' : ''}>Gmail — needs a Google App Password</option>
          <option value="brevo" ${mailProv === 'brevo' ? 'selected' : ''}>Brevo — free 300 emails/day, no Google settings</option>
          <option value="other" ${mailProv === 'other' ? 'selected' : ''}>Other SMTP server</option></select>`)}
        <p class="small muted" data-for="gmail"><strong>Gmail:</strong> 1) turn on 2-Step Verification (with your phone) in your Google account, 2) open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>, create one named "AdBazaar", 3) paste the 16 letters below. If Google says the setting is not available, use <strong>Brevo</strong> instead.</p>
        <p class="small muted" data-for="brevo"><strong>Brevo (free):</strong> 1) sign up at <a href="https://www.brevo.com" target="_blank" rel="noopener">brevo.com</a>, 2) <em>Senders, domains &amp; IPs → Senders</em>: add your Gmail and click the link Brevo emails you, 3) <em>SMTP &amp; API → SMTP</em>: click <em>Generate a new SMTP key</em>, 4) copy the <em>Login</em> and the key below.</p>
        ${field('Login / username', html`<input name="smtp_user" value="${s.smtp_user || process.env.SMTP_USER || ''}" placeholder="Gmail: yourname@gmail.com · Brevo: the Login shown on its SMTP page" required autocomplete="off">`)}
        ${field('Password', html`<input type="password" name="smtp_pass" autocomplete="new-password" placeholder="${(s.smtp_pass || process.env.SMTP_PASS) ? '•••••••••••••••• saved — type to replace' : 'Gmail: 16-letter App Password · Brevo: SMTP key'}">`, 'Never your normal Gmail password. Spaces are fine.')}
        ${field('Send emails as (your email address)', html`<input type="email" name="mail_from" value="${s.mail_from || ''}" placeholder="yourname@gmail.com">`, 'Gmail: leave empty. Brevo: the Gmail address you verified in Brevo.')}
        <details ${mailProv === 'other' ? 'open' : ''}><summary class="small">Server & port (filled in automatically for Gmail and Brevo)</summary>
          <div class="row2">
            ${field('SMTP server', html`<input name="smtp_host" value="${s.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com'}">`)}
            ${field('Port', html`<input name="smtp_port" type="number" value="${s.smtp_port || process.env.SMTP_PORT || '465'}">`, '465 (SSL) or 587')}
          </div>
        </details>
        <div class="btn-row"><button class="btn btn-accent">Save email settings</button></div>
      </form>
      <form method="post" action="/admin/messaging/sms" class="form">
        ${csrf(req)}
        <p class="small muted"><strong>Free SMS:</strong> install "SMS Gateway for Android" (sms-gate.app) on a spare Android phone with a SIM, turn on <em>Cloud server</em> in the app and copy its username & password here. OTPs are sent from that phone's SIM.</p>
        ${field('SMS service', html`<select name="sms_provider">
          <option value="" ${!prov ? 'selected' : ''}>Off (email OTP only)</option>
          <option value="android" ${prov === 'android' ? 'selected' : ''}>Android phone — free (SMS Gateway app)</option>
          <option value="fast2sms" ${prov === 'fast2sms' ? 'selected' : ''}>Fast2SMS — paid</option>
          <option value="msg91" ${prov === 'msg91' ? 'selected' : ''}>MSG91 — paid</option></select>`)}
        <div class="row2">
          ${field('Username / API key', html`<input name="sms_user" value="${s.sms_gateway_user || s.fast2sms_api_key || s.msg91_auth_key || ''}" autocomplete="off">`, 'Android: app username · Fast2SMS: API key · MSG91: auth key')}
          ${field('Password / template ID', html`<input name="sms_pass" type="password" autocomplete="new-password" placeholder="${s.sms_gateway_pass || s.msg91_template_id ? '•••••• saved' : ''}">`, 'Android: app password · MSG91: template ID')}
        </div>
        <div class="btn-row"><button class="btn btn-accent">Save SMS settings</button></div>
      </form>
    </div>
    <div class="btn-row">
      <form method="post" action="/admin/test-email" class="inline">${csrf(req)}<button class="btn btn-sm">📧 Send test email to me</button></form>
      <form method="post" action="/admin/test-sms" class="inline reject-form">${csrf(req)}<input name="phone" placeholder="10-digit mobile" maxlength="10"><button class="btn btn-sm">📱 Send test SMS</button></form>
      <a class="btn btn-ghost btn-sm" href="/admin/messages">View sent messages</a>
    </div>
  </section>`;
}

function settingsView(req, { s, plans, cats, admins }) {
  return html`
  <div class="page-head"><div><h1>Settings</h1><p class="muted">Pick a section. Each one saves on its own.</p></div></div>
  <div data-tab-scope>
  <div class="tabs" data-tabs data-tabs-hash role="tablist">
    <button type="button" class="tab active" data-tab="plans">${icon('card', { size: 16 })} Plans</button>
    <button type="button" class="tab" data-tab="slots">${icon('star', { size: 16 })} TOP slots</button>
    <button type="button" class="tab" data-tab="approvals">${icon('clock', { size: 16 })} Approvals</button>
    <button type="button" class="tab" data-tab="email">${icon('mail', { size: 16 })} Email & SMS ${emailConfigured() ? '' : html`<span class="badge-count">!</span>`}</button>
    <button type="button" class="tab" data-tab="alerts">${icon('bell', { size: 16 })} Alerts ${alertChannels().length ? html`<span class="pill pill-ok">${alertChannels().length}</span>` : ''}</button>
    <button type="button" class="tab" data-tab="site">${icon('settings', { size: 16 })} Site & payments</button>
    <button type="button" class="tab" data-tab="legal">${icon('id', { size: 16 })} Business & legal ${!s.legal_name || !(s.grievance_email || s.support_email) ? html`<span class="badge-count">!</span>` : ''}</button>
    <button type="button" class="tab" data-tab="admins">${icon('shield', { size: 16 })} ${isOwner(req) ? 'Staff & brand' : 'My password'}</button>
  </div>
  <div class="tab-panel" data-panel="email">${messagingSetupCard(req, s)}</div>
  <section class="card tab-panel" data-panel="alerts">
    <h2>Instant alerts on your phone</h2>
    <p class="muted small">Get a message the moment a payment, a new seller or a complaint comes in. Set up one or more — all are free. Emails also go to the address in the Approvals tab. Every alert is kept in <a href="/admin/messages">Messages</a>.</p>
    <form method="post" action="/admin/alerts" class="form">
      ${csrf(req)}
      <div class="field"><span class="label">Send me alerts for</span><div class="switch-list">
        ${[['payment', 'Payments and balance top-ups to confirm'], ['seller', 'New sellers to verify'], ['complaint', 'Complaints about ads (and automatic blocks)'], ['sponsor', 'Enquiries from advertisers'], ['free_ad', 'Free ads to check']].map(([k, l]) => html`<label class="check switch-line"><input type="checkbox" class="switch" name="alert_events[]" value="${k}" ${String(s.alert_events || 'payment,seller,complaint,sponsor,free_ad').split(',').includes(k) ? 'checked' : ''}><span>${l}</span></label>`)}
      </div></div>
      <div class="cols2">
        <fieldset><legend>WhatsApp</legend>
          ${field('How', html`<select name="alert_wa_mode"><option value="">Off</option><option value="callmebot" ${s.alert_wa_mode === 'callmebot' ? 'selected' : ''}>My own WhatsApp (free, CallMeBot)</option><option value="cloud" ${s.alert_wa_mode === 'cloud' ? 'selected' : ''}>WhatsApp Business (Cloud API)</option></select>`)}
          ${field('Your WhatsApp number', html`<input name="alert_wa_phone" value="${s.alert_wa_phone}" placeholder="98XXXXXXXX">`)}
          ${field('CallMeBot API key', html`<input name="alert_wa_apikey" value="${s.alert_wa_apikey}" autocomplete="off">`, 'Own WhatsApp: open callmebot.com → WhatsApp, save the bot number shown there in your contacts, send it "I allow callmebot to send me messages" on WhatsApp, and paste the API key it replies with.')}
          <details><summary class="small">WhatsApp Business (Cloud API) details</summary>
            ${field('Access token', html`<input name="alert_wa_token" type="password" placeholder="${s.alert_wa_token ? '•••••• saved' : ''}" autocomplete="new-password">`)}
            ${field('Phone number ID', html`<input name="alert_wa_phone_id" value="${s.alert_wa_phone_id}">`, 'From Meta for Developers → WhatsApp → API setup. Free-form messages arrive only within 24 hours after you message your business number.')}
          </details>
        </fieldset>
        <fieldset><legend>Telegram & Google Chat</legend>
          ${field('Telegram bot token', html`<input name="alert_telegram_token" type="password" placeholder="${s.alert_telegram_token ? '•••••• saved' : '123456:ABC…'}" autocomplete="new-password">`, 'In Telegram, chat with @BotFather → /newbot → copy the token.')}
          ${field('Telegram chat ID', html`<input name="alert_telegram_chat" value="${s.alert_telegram_chat}" placeholder="e.g. 123456789">`, 'Send any message to your new bot, then open @userinfobot to see your ID.')}
          ${field('Google Chat webhook URL', html`<input name="alert_gchat_webhook" value="${s.alert_gchat_webhook}" placeholder="https://chat.googleapis.com/v1/spaces/…">`, 'Google Chat space → Apps & integrations → Webhooks → Add. Needs a Google Workspace account.')}
        </fieldset>
      </div>
      <div class="btn-row"><button class="btn btn-primary">Save alerts</button><button class="btn" formaction="/admin/alerts/test">Save & send a test alert</button></div>
    </form>
  </section>
  <section class="card tab-panel" data-panel="plans">
    <h2>Pricing plans</h2>
    <p class="muted small">Price and run period of each plan. Ads that pay more are shown higher; ads that paid the same are shuffled fairly on every visit. A discount (e.g. 20% on monthly and yearly subscriptions) applies to the plan and its TOP slots.</p>
    <form method="post" action="/admin/plans" class="form">
      ${csrf(req)}
      <div class="table-wrap"><table class="table plans-table">
        <thead><tr><th>Name</th><th>Days</th><th>Price (₹)</th><th>Discount %</th><th>Customer pays</th><th>Active</th></tr></thead>
        <tbody>
          ${plans.map((p) => html`<tr>
            <td><input type="hidden" name="id[]" value="${p.id}"><input name="name[]" value="${p.name}" required maxlength="60"></td>
            <td><input type="number" name="days[]" value="${p.days}" min="1" max="365" required></td>
            <td><input type="number" name="price[]" value="${p.price_paise / 100}" min="0" step="1" required></td>
            <td><input type="hidden" name="priority[]" value="${p.priority}"><input type="number" name="discount[]" value="${p.discount_pct || 0}" min="0" max="90"></td>
            <td class="mono">${rupees(P.quote(p, 0))}</td>
            <td><select name="active[]"><option value="1" ${p.is_active ? 'selected' : ''}>Yes</option><option value="0" ${!p.is_active ? 'selected' : ''}>No</option></select></td></tr>`)}
          <tr class="new-row">
            <td><input type="hidden" name="id[]" value="new"><input name="name[]" placeholder="+ New plan name" maxlength="60"></td>
            <td><input type="number" name="days[]" min="1" max="365" placeholder="days"></td>
            <td><input type="number" name="price[]" min="0" step="1" placeholder="₹"></td>
            <td><input type="hidden" name="priority[]" value="1"><input type="number" name="discount[]" min="0" max="90" value="0"></td><td></td>
            <td><select name="active[]"><option value="1">Yes</option><option value="0">No</option></select></td></tr>
        </tbody></table></div>
      <button class="btn btn-accent">Save plans</button>
    </form>
  </section>

    <section class="card tab-panel narrow-ish" data-panel="slots">
      <h2>★ TOP ad time slots</h2>
      <p class="muted small">Clients choose the 3-hour slots (India time) when their ad is pinned in TOP. They pay this price per day × the days of their plan.</p>
      <form method="post" action="/admin/slots" class="form">
        ${csrf(req)}
        <div class="table-wrap"><table class="table"><thead><tr><th>Slot</th><th>Price per day (₹)</th><th>On sale</th></tr></thead><tbody>
          ${slotPrices().map((sl) => html`<tr><td><strong>${sl.label}</strong></td>
            <td><input type="number" name="price_${sl.slot}" value="${sl.price_per_day_paise / 100}" min="0" step="1" required></td>
            <td><select name="active_${sl.slot}"><option value="1" ${sl.is_active ? 'selected' : ''}>Yes</option><option value="0" ${!sl.is_active ? 'selected' : ''}>No</option></select></td></tr>`)}
        </tbody></table></div>
        <button class="btn btn-accent">Save slot prices</button>
      </form>
    </section>
    <section class="card tab-panel narrow-ish" data-panel="approvals">
      <h2>Approvals & notifications</h2>
      <form method="post" action="/admin/automation" class="form">
        ${csrf(req)}
        ${field('Auto-approve clients after (minutes)', html`<input type="number" name="auto_approve_minutes" min="0" max="10080" value="${s.auto_approve_minutes}">`, 'If you don\'t approve or reject a verified client in this time, they are approved automatically and you get an email. 0 = off (always wait for you).')}
        <label class="check"><input type="checkbox" name="require_mobile_otp" value="1" ${s.require_mobile_otp !== '0' ? 'checked' : ''}> <span>Mobile number must be verified by SMS code (needs SMS set up above)</span></label>
        <p class="small muted">Payments are never confirmed automatically — only you (or another admin) can confirm a payment.</p>
        ${field('Send admin notifications to', html`<input type="email" name="notify_email" value="${s.notify_email}" placeholder="you@gmail.com">`)}
        ${field('Block a seller automatically after complaints from', html`<input type="number" name="complaint_block_threshold" min="0" max="100000" value="${s.complaint_block_threshold}">`, 'different people about the same ad. The ad is removed and the seller cannot post again. 0 = off (you decide).')}
        ${field('Sponsored card in listings after every', html`<input type="number" name="sponsor_every" min="3" max="50" value="${s.sponsor_every}">`, 'ads (see Sponsors)')}
        <h3>Free ads</h3>
        <label class="check"><input type="checkbox" name="free_ads" value="1" ${s.free_ads !== '0' ? 'checked' : ''}> <span>Sellers may post ads <strong>free</strong> (shown after all paid ads, random order, never in TOP)</span></label>
        <div class="row3">
          ${field('Free ad runs for (days)', html`<input type="number" name="free_ad_days" min="1" max="365" value="${s.free_ad_days || 15}">`)}
          ${field('Free ads per seller at a time', html`<input type="number" name="free_ads_per_seller" min="1" max="50" value="${s.free_ads_per_seller || 2}">`)}
          <label class="field"><span class="label">Check before live</span><span class="switch-row"><input type="checkbox" class="switch" name="free_ads_review" value="1" ${s.free_ads_review === '1' ? 'checked' : ''}> Admin checks each free ad (off = live at once)</span></label>
        </div>
        <button class="btn btn-accent">Save</button>
      </form>
      <p class="small muted">Sellers see: login check takes ${approveTimeText(s.auto_approve_minutes)}; payment confirmation takes ${PAYMENT_TIME_TEXT}.</p>
    </section>

    <section class="card tab-panel narrow-ish" data-panel="site">
      <h2>Site & payment details</h2>
      <form method="post" action="/admin/settings" enctype="multipart/form-data" class="form">
        ${csrf(req)}
        <p class="small muted">Site name: <strong>${s.site_name}</strong> — ${isOwner(req) ? html`change it in <a href="#admins">Staff & brand</a>.` : 'only the owner can change it.'}</p>
        <div class="row2">${field('Your UPI ID', html`<input name="upi_id" maxlength="80" value="${s.upi_id}" placeholder="yourname@okhdfcbank">`)}${field('UPI payee name', html`<input name="upi_payee_name" maxlength="80" value="${s.upi_payee_name}">`)}</div>
        ${field('UPI QR code image', html`<input type="file" name="upi_qr" accept="image/*">`, s.upi_qr_file ? 'A QR is uploaded — choose a file to replace it.' : 'Upload the QR from your UPI / merchant app')}
        ${s.upi_qr_file ? html`<img class="upi-qr" src="${imgUrl(s.upi_qr_file)}" alt="UPI QR">` : ''}
        <div class="row2">${field('Support phone', html`<input name="support_phone" maxlength="20" value="${s.support_phone}">`)}${field('Support email', html`<input name="support_email" type="email" maxlength="120" value="${s.support_email}">`)}</div>
        <p class="small muted">Online payments (Razorpay): ${P.razorpayEnabled() ? html`<strong class="ok">enabled</strong>` : html`<strong>not configured</strong> — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env`}</p>
        <button class="btn btn-accent">Save settings</button>
      </form>
    </section>
    <section class="card tab-panel narrow-ish" data-panel="legal">
      <h2>Business & legal details</h2>
      <p class="muted small">Shown on receipts, the Contact page and in the Terms, Privacy and Refund policies. Indian law asks every website like this to show a Grievance Officer with contact details. Payment gateways (Razorpay etc.) check these pages before going live.</p>
      <form method="post" action="/admin/legal" class="form">
        ${csrf(req)}
        ${field('Business / legal name', html`<input name="legal_name" maxlength="120" value="${s.legal_name}" placeholder="e.g. Sagar Enterprises (Proprietor: …)">`, 'Your registered business name, or your own name if you run it yourself')}
        ${field('Business address', html`<textarea name="legal_address" rows="2" maxlength="300" placeholder="Full postal address with PIN code">${s.legal_address}</textarea>`)}
        <div class="row2">
          ${field('GSTIN (optional)', html`<input name="gstin" maxlength="15" value="${s.gstin}" class="upper" placeholder="22AAAAA0000A1Z5">`, 'If you have GST registration, receipts become tax invoices')}
          ${field('City for courts & arbitration', html`<input name="jurisdiction_city" maxlength="60" value="${s.jurisdiction_city}" placeholder="e.g. Pune">`)}
        </div>
        ${field('Where the server is (shown in the Privacy policy)', html`<input name="data_location" maxlength="60" value="${s.data_location}" placeholder="e.g. India, or Switzerland">`)}
        <h3>Grievance Officer</h3>
        <div class="row3">
          ${field('Name', html`<input name="grievance_name" maxlength="80" value="${s.grievance_name}">`)}
          ${field('Email', html`<input name="grievance_email" type="email" maxlength="120" value="${s.grievance_email}">`)}
          ${field('Phone', html`<input name="grievance_phone" maxlength="20" value="${s.grievance_phone}">`)}
        </div>
        <p class="small muted">These are standard policy templates. Before going public, have a lawyer read <a href="/terms" target="_blank">Terms</a>, <a href="/privacy" target="_blank">Privacy</a> and <a href="/refund-policy" target="_blank">Refund policy</a>.</p>
        <button class="btn btn-primary">Save business details</button>
      </form>
    </section>
    <section class="tab-panel" data-panel="admins">
     ${isOwner(req) ? staffAndBrand(req, s, admins) : ''}
     <div class="cols2">
     <div class="card">
      <h2>Change my password</h2>
      <form method="post" action="/admin/password" class="form">
        ${csrf(req)}
        ${field('Current password', html`<input name="current" type="password" required autocomplete="current-password">`)}
        ${field('New password', html`<input name="password" type="password" minlength="6" required autocomplete="new-password">`)}
        <button class="btn btn-primary">Update password</button>
      </form>
     </div>
    </div></section>
  </div>`;
}

// Owner only: staff logins, roles (name + ticked permissions) and brand (name, tagline, logo, colours).
function staffAndBrand(req, s, admins) {
  const roles = Staff.listRoles();
  const roleOptions = (sel) => roles.map((r) => html`<option value="${r.id}" ${Number(sel) === r.id ? 'selected' : ''}>${r.name}</option>`);
  const permBoxes = (set) => html`<div class="permgrid">${Staff.PERMS.map(([k, l, d]) => html`<label class="perm"><input type="checkbox" name="perms[]" value="${k}" ${set && set.has(k) ? 'checked' : ''}><span><strong>${l}</strong><span class="small muted">${d}</span></span></label>`)}</div>`;
  const theme = s.brand_theme || 'peacock';
  return html`
  <div class="cols2">
   <div class="card">
    <h2>Staff logins</h2>
    <p class="small muted">Give each person their own login and a role. They only see the pages their role allows. Only you (the owner) can change staff, roles and the brand.</p>
    <ul class="list staff-list">${admins.map((a) => html`<li><span class="staff-who"><span class="avatar sm">${a.name.slice(0, 1)}</span><span><strong>${a.name}</strong> ${a.role === 'owner' ? html`<span class="pill pill-top">Owner</span>` : html`<span class="pill pill-info">${(roles.find((r) => r.id === a.role_id) || {}).name || 'No role'}</span>`}${a.is_active ? '' : html` <span class="pill pill-bad">Removed</span>`}<span class="muted small" style="display:block">${a.email}</span></span></span>
      ${a.role !== 'owner' ? html`<form method="post" action="/admin/admins/${a.id}" class="inline staff-actions">${csrf(req)}
        ${a.is_active ? html`<select name="role_id" data-autosubmit aria-label="Role of ${a.name}">${roleOptions(a.role_id)}</select>
        <button class="btn btn-sm btn-danger" name="action" value="remove" data-confirm="Remove ${a.name}? They can no longer log in.">Remove</button>` : html`<button class="btn btn-sm" name="action" value="enable">Allow login again</button>`}</form>` : ''}</li>`)}</ul>
    <form method="post" action="/admin/admins" class="form">
      ${csrf(req)}
      <h3>Add a staff login</h3>
      <div class="row2">${field('Name', html`<input name="name" required maxlength="60">`)}${field('Email (their login)', html`<input name="email" type="email" required>`)}</div>
      <div class="row2">${field('Password', html`<input name="password" type="password" minlength="6" required autocomplete="new-password">`, 'At least 6 characters. They can change it in "My login".')}
        ${field('Role', html`<select name="role_id" required>${roleOptions(roles[roles.length - 1] && roles.find((r) => r.name === 'Payment checker') ? roles.find((r) => r.name === 'Payment checker').id : 0)}</select>`, 'Make new roles on the right.')}</div>
      <button class="btn btn-primary">${icon('plus', { size: 16 })} Add staff login</button>
    </form>
   </div>
   <div class="card">
    <h2>Roles</h2>
    <p class="small muted">A role is a name plus what it can do. Make as many as you like, for example "Ad checker" (only Ads) or "Accountant" (payments and money).</p>
    ${roles.map((r) => html`<details class="role-card">
      <summary><strong>${r.name}</strong><span class="muted small">${r.permSet.size} of ${Staff.PERMS.length} permissions · ${r.people} ${r.people === 1 ? 'person' : 'people'}</span></summary>
      <form method="post" action="/admin/roles/${r.id}" class="form">${csrf(req)}
        ${field('Role name', html`<input name="name" required maxlength="40" value="${r.name}">`)}
        ${permBoxes(r.permSet)}
        <div class="btn-row"><button class="btn btn-primary">Save role</button>
        ${r.people ? html`<span class="small muted">Move its ${r.people} ${r.people === 1 ? 'person' : 'people'} to another role before deleting it.</span>` : html`<button class="btn btn-danger" name="action" value="delete" data-confirm="Delete the role ${r.name}?">Delete role</button>`}</div>
      </form>
    </details>`)}
    <details class="role-card role-new">
      <summary><strong>${icon('plus', { size: 16 })} New role</strong></summary>
      <form method="post" action="/admin/roles" class="form">${csrf(req)}
        ${field('Role name', html`<input name="name" required maxlength="40" placeholder="e.g. Ad checker">`)}
        ${permBoxes(new Set())}
        <button class="btn btn-primary">Create role</button>
      </form>
    </details>
   </div>
  </div>
  <div class="card">
    <h2>Brand</h2>
    <p class="small muted">Your site name, logo and colours show everywhere: header, footer, emails, receipts and legal pages. Change them any time — for example when you choose your final brand name.</p>
    <form method="post" action="/admin/brand" class="form" enctype="multipart/form-data">
      ${csrf(req)}
      <div class="row2">${field('Site name', html`<input name="site_name" required maxlength="40" value="${s.site_name}">`)}${field('Tagline', html`<input name="tagline" maxlength="120" value="${s.tagline}">`)}</div>
      <div class="brand-logo-row">
        <div class="brand-preview" aria-hidden="true">${s.brand_logo ? html`<img src="/media/ads/${s.brand_logo}" alt="">` : html`<span class="logo-mark">${icon('tag', { size: 22 })}</span>`}<strong>${s.site_name}</strong></div>
        ${field('Logo (square, PNG/JPG/WEBP, max 2 MB)', html`<input type="file" name="logo" accept="image/png,image/jpeg,image/webp">`, s.brand_logo ? html`<label class="check small"><input type="checkbox" name="remove_logo" value="1"> Remove my logo</label>` : 'Without a logo, the tag symbol is used.')}
      </div>
      <fieldset class="theme-pick"><legend class="label">Colours</legend>
        ${Object.entries(Brand.THEMES).map(([k, t]) => html`<label class="theme-opt"><input type="radio" name="brand_theme" value="${k}" ${theme === k ? 'checked' : ''}><span class="theme-sw" style="--a:${t.main};--b:${t.acc}"></span><span class="small">${t.label}</span></label>`)}
      </fieldset>
      <button class="btn btn-primary">Save brand</button>
    </form>
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
    const a = db.prepare('SELECT * FROM admins WHERE email = ? AND is_active = 1').get(email);
    if (!a || !verifyPassword(req.body.password, a.password_hash)) { res.status(401).html(page(req, 'Admin login', loginForm(req, 'Incorrect email or password.'))); return; }
    req.regenerateSession();
    req.session.adminId = a.id;
    res.redirect(Staff.homeFor(Staff.load(a)));
  });
  app.post('/admin/logout', (req, res) => { req.regenerateSession(); res.redirect('/admin/login'); });

  app.get('/admin', requireAdmin, (req, res) => {
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const since = Date.now() - 13 * 86400_000;
    const dailyRows = db.prepare(`SELECT date(confirmed_at/1000, 'unixepoch', '+5 hours', '+30 minutes') AS day, SUM(amount_paise - wallet_paise) AS total
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
      // Money actually received: ad payments (minus the part paid from balance) + confirmed balance top-ups
      revMonth: db.prepare("SELECT COALESCE(SUM(amount_paise - wallet_paise),0) s FROM payments WHERE status='paid' AND confirmed_at >= ?").get(startMonth.getTime()).s
        + db.prepare("SELECT COALESCE(SUM(amount_paise),0) s FROM wallet_topups WHERE status='paid' AND confirmed_at >= ?").get(startMonth.getTime()).s,
      revTotal: db.prepare("SELECT COALESCE(SUM(amount_paise - wallet_paise),0) s FROM payments WHERE status='paid'").get().s
        + db.prepare("SELECT COALESCE(SUM(amount_paise),0) s FROM wallet_topups WHERE status='paid'").get().s,
      paidLive: db.prepare("SELECT COUNT(*) n FROM ads WHERE status = 'active' AND is_free = 0").get().n,
      freeLive: db.prepare("SELECT COUNT(*) n FROM ads WHERE status = 'active' AND is_free = 1").get().n,
      revToday: (() => { // since midnight India time
        const IST = 19_800_000; const start = Math.floor((Date.now() + IST) / 86400_000) * 86400_000 - IST;
        return db.prepare("SELECT COALESCE(SUM(amount_paise - wallet_paise),0) s FROM payments WHERE status='paid' AND confirmed_at >= ?").get(start).s
          + db.prepare("SELECT COALESCE(SUM(amount_paise),0) s FROM wallet_topups WHERE status='paid' AND confirmed_at >= ?").get(start).s; })(),
      newSellers: db.prepare("SELECT COUNT(*) n FROM clients WHERE status = 'approved' AND created_at >= ?").get(Date.now() - 7 * 86400_000).n,
      kycList: db.prepare("SELECT * FROM clients WHERE status IN ('pending','video_call') ORDER BY created_at LIMIT 6").all(),
      payList: db.prepare("SELECT p.*, c.name AS client_name FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.status = 'pending' ORDER BY p.id LIMIT 6").all(),
      daily, maxDaily: Math.max(0, ...daily.map((x) => x.total)),
    };
    res.html(page(req, 'Dashboard', dashboardView(req, d)));
  });

  // ---- Clients ----
  app.get('/admin/clients', requireAdmin, (req, res) => {
    const status = ['pending', 'unverified', 'video_call', 'approved', 'deactivated', 'rejected', 'suspended', 'all'].includes(req.query.status) ? req.query.status : 'pending';
    const q = V.str(req.query.q, 80);
    const where = []; const args = [];
    if (status !== 'all') { where.push('c.status = ?'); args.push(status); } else where.push("c.status != 'deleted'");
    if (q) { where.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.pan_number LIKE ? OR c.id_number LIKE ? OR c.business_name LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l, l, l); }
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM ads a WHERE a.client_id = c.id) AS ad_count FROM clients c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 300`).all(...args);
    res.html(page(req, 'Clients', clientsView(req, rows, { status, q })));
  });

  app.get('/admin/clients/new', requireAdmin, (req, res) => res.html(page(req, 'Add client', newClientView(req), ['/public/js/camera.js'])));

  app.post('/admin/clients/new', requireAdmin, (req, res) => {
    const b = req.body;
    const v = {
      name: V.str(b.name, 80), business_name: V.str(b.business_name, 80), email: V.str(b.email, 120).toLowerCase(), phone: V.normalizePhone(b.phone),
      dob: V.str(b.dob, 10), id_type: V.str(b.id_type, 10), id_number: V.str(b.id_number, 20).toUpperCase(),
      address: V.str(b.address, 300), city: V.str(b.city, 60), state: V.str(b.state, 60), pincode: V.str(b.pincode, 6),
    };
    const fail = (msg) => res.status(400).html(page(req, 'Add client', newClientView(req, v, msg), ['/public/js/camera.js']));
    const approve = b.approve_now === '1';
    if (v.name.length < 3) return fail('Enter the full name.');
    const dobErr = V.checkDob(v.dob); if (dobErr) return fail(dobErr.replace('you must be', 'the client must be'));
    if (!V.isValidPhone(v.phone)) return fail('Enter a valid 10-digit mobile number.');
    if (!V.isValidEmail(v.email)) return fail('Enter a valid email.');
    if (db.prepare('SELECT 1 FROM clients WHERE email = ?').get(v.email)) return fail('A client with this email already exists.');
    const idc = checkId(v.id_type, v.id_number); if (idc.error) return fail(idc.error);
    if (!req.files.id_file?.[0]) return fail('Upload a photo of the ID document.');
    if (v.pincode && !V.isValidPincode(v.pincode)) return fail('The PIN code should be 6 digits (or leave it empty).');
    if (approve && !b.live_photo_data) return fail('Take the live photo with the webcam before approving (or untick "approve now" and verify on a video call).');
    const password = b.password ? String(b.password) : randomToken(9);
    if (password.length < 6) return fail('Password must be at least 6 characters.');

    const saved = [];
    try {
      const up = (k, opts) => { const n = saveUpload(req.files[k]?.[0], 'kyc', opts); if (n) saved.push(n); return n; };
      const f = { id: up('id_file', { allowPdf: true }), idBack: up('id_back_file', { allowPdf: true }) };
      const live = b.live_photo_data ? saveDataUrl(b.live_photo_data, 'kyc') : null;
      if (live) saved.push(live);
      const now = Date.now();
      const id = tx(() => {
        const r = db.prepare(`INSERT INTO clients (email_verified_at, phone_verified_at, submitted_at, name, business_name, email, phone, password_hash, address, city, state, pincode, aadhaar_last4, pan_number,
          id_type, id_number, id_file, id_back_file, live_photo_file, status, status_token, created_by_admin, reviewed_by, reviewed_at, created_at, dob)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`)
          .run(now, now, now, v.name, v.business_name, v.email, v.phone, hashPassword(password), v.address, v.city, v.state, v.pincode, idc.last4, idc.pan,
            v.id_type, idc.stored, f.id, f.idBack, live, approve ? 'approved' : 'pending', randomToken(24), approve ? req.admin.id : null, approve ? now : null, now, v.dob);
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
    if (action === 'deactivate' || action === 'reactivate') {
      if (action === 'deactivate') {
        const r = life.deactivateClient(c.id, 'admin');
        db.prepare('UPDATE clients SET admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(note, req.admin.id, now, c.id);
        notify.deactivated(c, 'admin');
        req.flash('success', `Client deactivated${r && r.paused ? ` — ${r.paused} live ad(s) hidden, remaining paid days saved` : ''}.`);
      } else {
        const r = life.reactivateClient(c.id);
        notify.reactivated(c);
        req.flash('success', `Client reactivated${r && r.resumed ? ` — ${r.resumed} ad(s) live again` : ''}.`);
      }
      res.redirect(`/admin/clients/${c.id}`);
      return;
    }
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
        db.prepare("UPDATE ads SET status = 'blocked', block_reason = 'Seller suspended', rank_score = -1, updated_at = ? WHERE client_id = ? AND status IN ('active','payment_review','awaiting_payment','paused','free_review')").run(now, c.id);
      }
      if (status === 'approved' && c.status === 'suspended') {
        // Unblock: ads that were hidden because of the block come back (live if their paid time is not over).
        for (const a of db.prepare("SELECT * FROM ads WHERE client_id = ? AND status = 'blocked' AND block_reason = 'Seller suspended'").all(c.id)) {
          const st = a.paused_remaining_ms ? 'paused' : a.expires_at && a.expires_at > now ? 'active' : a.paid_total_paise > 0 ? 'expired' : 'awaiting_payment';
          db.prepare('UPDATE ads SET status = ?, block_reason = NULL, updated_at = ? WHERE id = ?').run(st, now, a.id);
        }
        if (c.deactivated_by) db.prepare('UPDATE clients SET deactivated_by = NULL, deactivated_at = NULL WHERE id = ?').run(c.id);
      }
    });
    if (status === 'rejected' || status === 'suspended') rtc.broadcast(`kyc-${c.id}`, 'client', 'signal', { type: 'hangup' });
    if (status === 'approved' && c.status !== 'approved') notify.approved(c);
    if (status === 'rejected') notify.rejected(c, note);
    if (status === 'suspended') notify.suspended(c, note);
    if (status === 'video_call') notify.videoCall(c, callAt);
    if (status === 'approved' || status === 'pending') db.prepare('UPDATE clients SET submitted_at = COALESCE(submitted_at, ?), auto_approved = 0 WHERE id = ?').run(now, c.id);
    if (status === 'approved' && c.status === 'suspended') rescore(0);
    const label = { approved: c.status === 'suspended' ? 'Client unblocked — their ads are back.' : 'Client approved — they can now log in and post ads.', rejected: 'Client rejected.', suspended: 'Client blocked and their ads hidden.', video_call: 'Video call requested. Share the call link with the client.', pending: 'Moved back to review.' }[status];
    req.flash('success', label);
    res.redirect(`/admin/clients/${c.id}`);
  });

  app.post('/admin/clients/:id/wallet', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    const amount = Math.round(Number(req.body.amount) * 100);
    if (!c || !Number.isFinite(amount) || !amount) { req.flash('error', 'Enter an amount, e.g. 100 or -100.'); res.redirect(back(req, '/admin/clients')); return; }
    const note = V.str(req.body.note, 120) || (amount > 0 ? 'Added by our team' : 'Removed by our team');
    const ok = amount > 0 ? W.credit(c.id, amount, 'admin', note) : W.debit(c.id, -amount, note);
    if (!ok) { req.flash('error', 'The balance is lower than that amount.'); res.redirect(`/admin/clients/${c.id}`); return; }
    if (amount > 0) notify.inbox(c.id, { kind: 'wallet', tone: 'success', title: `${rupees(amount)} added to your balance`, body: note, link: '/client/wallet', linkText: 'My balance' });
    req.flash('success', `Balance ${amount > 0 ? 'increased' : 'reduced'} by ${rupees(Math.abs(amount))}.`);
    res.redirect(`/admin/clients/${c.id}`);
  });

  app.post('/admin/clients/:id/delete', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.redirect('/admin/clients'); return; }
    rtc.broadcast(`kyc-${c.id}`, 'client', 'signal', { type: 'hangup' });
    life.deleteClient(c.id);
    req.flash('success', `${c.name} was deleted permanently.`);
    res.redirect('/admin/clients?status=all');
  });

  app.post('/admin/clients/:id/reset-password', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.redirect('/admin/clients'); return; }
    const password = randomToken(9);
    db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hashPassword(password), c.id);
    req.session.tempPassword = { id: c.id, password };
    res.redirect(`/admin/clients/${c.id}`);
  });

  // ---- Call any seller now: their open page rings, and they get an email ----
  app.post('/admin/clients/:id/ring', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c || c.status === 'deleted' || c.status === 'suspended') { req.flash('error', 'This client cannot be called.'); res.redirect('/admin/clients'); return; }
    db.prepare('UPDATE clients SET call_ring_at = ? WHERE id = ?').run(Date.now(), c.id);
    notify.videoCall(c, null);
    res.redirect(`/admin/clients/${c.id}/call`);
  });
  app.post('/admin/clients/:id/ring/end', requireAdmin, (req, res) => {
    db.prepare('UPDATE clients SET call_ring_at = NULL WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
    res.json({ ok: true });
  });

  // ---- KYC video call (admin side) ----
  app.get('/admin/clients/:id/call', requireAdmin, (req, res) => {
    const c = getClient(req.params.id);
    if (!c) { res.redirect('/admin/clients'); return; }
    if (!rtc.callAllowed(c)) { req.flash('error', 'Click "Video call now" first.'); res.redirect(`/admin/clients/${c.id}`); return; }
    const body = html`<nav class="crumbs"><a href="/admin/clients/${c.id}">← Back to ${c.name}</a></nav>
      <div class="cols-call">
        ${callView(req, c, { role: 'admin', eventsUrl: `/rtc/a/${c.id}/events`, signalUrl: `/rtc/a/${c.id}/signal`, snapshotUrl: `/admin/clients/${c.id}/snapshot` })}
        <aside class="card call-side">
          <h3>Compare with documents</h3>
          <div class="docs small-docs">${docLink(c.id_file || c.aadhaar_file, (ID_TYPES[c.id_type] || ID_TYPES.aadhaar).label)}${c.live_photo_file ? docLink(c.live_photo_file, 'Live photo') : ''}</div>
          <dl class="facts"><div><dt>Name</dt><dd>${c.name}</dd></div><div><dt>ID</dt><dd>${describeId(c)}</dd></div><div><dt>Date of birth</dt><dd>${c.dob || '—'}${c.dob ? ` (${V.ageFromDob(c.dob)} yrs)` : ''}</dd></div></dl>
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
    const status = !can(req, 'money') ? 'pending' : ['pending', 'paid', 'rejected', 'failed', 'all'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = db.prepare(`SELECT p.*, c.name AS client_name, a.title AS ad_title FROM payments p
      JOIN clients c ON c.id = p.client_id JOIN ads a ON a.id = p.ad_id
      WHERE ${status === 'all' ? "p.status != 'created'" : 'p.status = ?'} ORDER BY p.id ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 300`)
      .all(...(status === 'all' ? [] : [status]));
    const topups = db.prepare(`SELECT t.*, c.name AS client_name FROM wallet_topups t JOIN clients c ON c.id = t.client_id
      WHERE ${status === 'all' ? '1' : 't.status = ?'} ORDER BY t.id DESC LIMIT 100`).all(...(status === 'all' ? [] : [status]));
    res.html(page(req, 'Payments', paymentsView(req, rows, status, topups)));
  });
  // Balance top-ups: admin confirms the UPI money arrived → balance goes up (never automatic).
  app.post('/admin/topups/:id/confirm', requireAdmin, (req, res) => {
    const t = db.prepare("SELECT * FROM wallet_topups WHERE id = ? AND status = 'pending'").get(parseInt(req.params.id, 10) || 0);
    if (t) {
      tx(() => {
        db.prepare("UPDATE wallet_topups SET status = 'paid', confirmed_by = ?, confirmed_at = ? WHERE id = ?").run(req.admin.id, Date.now(), t.id);
        W.credit(t.client_id, t.amount_paise, 'topup', `UPI top-up (UTR ${t.utr})`);
      });
      notify.inbox(t.client_id, { kind: 'topup_ok', tone: 'success', title: `${rupees(t.amount_paise)} added to your balance`, body: 'Your top-up is confirmed. Use your balance on any ad.', link: '/client/ads/new', linkText: 'Post an ad' });
      req.flash('success', `Top-up of ${rupees(t.amount_paise)} confirmed and added to the seller's balance.`);
    }
    res.redirect(back(req, '/admin/payments'));
  });
  app.post('/admin/topups/:id/reject', requireAdmin, (req, res) => {
    const t = db.prepare("SELECT * FROM wallet_topups WHERE id = ? AND status = 'pending'").get(parseInt(req.params.id, 10) || 0);
    if (t) {
      const note = V.str(req.body.note, 200) || 'Payment not found';
      db.prepare("UPDATE wallet_topups SET status = 'rejected', confirmed_by = ?, confirmed_at = ?, admin_note = ? WHERE id = ?").run(req.admin.id, Date.now(), note, t.id);
      notify.inbox(t.client_id, { kind: 'topup_rejected', tone: 'error', title: `Top-up of ${rupees(t.amount_paise)} rejected`, body: `We could not find this payment (UTR ${t.utr}). Reason: ${note}. Check your UPI app and try again.`, link: '/client/wallet', linkText: 'My balance' });
      req.flash('success', 'Top-up rejected. The seller sees the reason in their messages.');
    }
    res.redirect(back(req, '/admin/payments'));
  });
  app.get('/admin/payments/:id/receipt', requireAdmin, (req, res) => {
    const { receiptData, receiptPage } = require('../views/receipt');
    const p = receiptData(parseInt(req.params.id, 10) || 0);
    if (!p || p.status !== 'paid') { req.flash('error', 'A receipt is available only for confirmed payments.'); res.redirect('/admin/payments'); return; }
    res.html(receiptPage(req, p));
  });
  app.post('/admin/payments/:id/confirm', requireAdmin, (req, res) => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!pay || pay.status !== 'pending') { req.flash('error', 'Payment is not pending.'); res.redirect(back(req, '/admin/payments')); return; }
    P.confirmPayment(pay.id, { adminId: req.admin.id });
    notify.paymentConfirmed(pay.id);
    req.flash('success', `Payment #${pay.id} confirmed — ad is live.`);
    res.redirect(back(req, '/admin/payments'));
  });
  app.post('/admin/payments/:id/reject', requireAdmin, (req, res) => {
    const payId = parseInt(req.params.id, 10) || 0;
    const ok = P.rejectPayment(payId, req.admin.id, V.str(req.body.note, 200) || 'Payment not received');
    if (ok) notify.paymentRejected(payId);
    req.flash(ok ? 'success' : 'error', ok ? 'Payment rejected.' : 'Payment is not pending.');
    res.redirect(back(req, '/admin/payments'));
  });

  // A confirmed payment failed later (bounced, reversed, fake UTR): ad back to unpaid, seller told.
  app.post('/admin/payments/:id/failed', requireAdmin, (req, res) => {
    if (!can(req, 'money')) { req.flash('error', 'Your role cannot change confirmed payments.'); res.redirect('/admin/payments'); return; }
    const note = V.str(req.body.note, 200) || 'The payment failed after it was confirmed';
    const pay = P.failPayment(parseInt(req.params.id, 10) || 0, req.admin.id, note);
    if (pay) {
      const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(pay.ad_id);
      notify.paymentFailed(pay.client_id, ad, `Your payment of ${rupees(pay.amount_paise)} for this ad failed after we confirmed it (${note}), so the ad is off the site for now.`);
      req.flash('success', `Payment #${pay.id} marked as failed. Ad #${pay.ad_id} is now unpaid; it goes live again after the seller pays and you confirm.`);
    } else req.flash('error', 'Only a confirmed payment can be marked as failed.');
    res.redirect(back(req, '/admin/payments?status=paid'));
  });

  // ---- Ads ----
  app.post('/admin/ads/:id/unpaid', requireAdmin, (req, res) => {
    const note = V.str(req.body.note, 200) || 'Payment failed';
    const ad = P.moveAdToUnpaid(parseInt(req.params.id, 10) || 0);
    if (ad) {
      notify.paymentFailed(ad.client_id, ad, `${note}. Your ad is off the site until the payment is made again.`);
      req.flash('success', `Ad #${ad.id} moved to unpaid. It goes live again after the seller pays and you confirm.`);
    }
    res.redirect(back(req, '/admin/ads'));
  });

  app.get('/admin/ads', requireAdmin, (req, res) => {
    const status = ['active', 'free_review', 'payment_review', 'awaiting_payment', 'paused', 'expired', 'blocked', 'deleted', 'all'].includes(req.query.status) ? req.query.status : 'active';
    const q = V.str(req.query.q, 80);
    const where = []; const args = [];
    if (status !== 'all') { where.push('a.status = ?'); args.push(status); } else where.push("a.status != 'deleted'");
    if (q) { where.push('(a.title LIKE ? OR a.id = ?)'); args.push(`%${q}%`, parseInt(q, 10) || -1); }
    const rows = db.prepare(`SELECT a.*, c.name AS client_name, COALESCE(pc.name || ' › ' || cat.name, cat.name) AS cat_name, p.name AS plan_name FROM ads a
      JOIN clients c ON c.id = a.client_id JOIN categories cat ON cat.id = a.category_id LEFT JOIN categories pc ON pc.id = cat.parent_id LEFT JOIN plans p ON p.id = a.plan_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${status === 'active' ? 'a.rank_score DESC' : 'a.updated_at DESC'} LIMIT 300`).all(...args);
    res.html(page(req, 'Ads', adsView(req, rows, { status, q })));
  });
  const adById = (id) => db.prepare('SELECT * FROM ads WHERE id = ?').get(parseInt(id, 10) || 0);

  // Free ads waiting for the admin's check
  app.post('/admin/ads/:id/free/approve', requireAdmin, (req, res) => {
    const ad = Free.approve(parseInt(req.params.id, 10) || 0);
    if (ad) {
      notify.inbox(ad.client_id, { kind: 'free_live', tone: 'success', title: `Your free ad is live — ${ad.title}`, body: `It runs for ${Free.config().days} days and is shown after paid ads. Upgrade any time to be seen first.`, link: `/client/ads/${ad.id}/pay`, linkText: 'Upgrade to paid' });
      req.flash('success', `Free ad #${ad.id} is live.`);
    }
    res.redirect(back(req, '/admin/ads?status=free_review'));
  });
  app.post('/admin/ads/:id/free/reject', requireAdmin, (req, res) => {
    const note = V.str(req.body.note, 200) || 'It does not follow our posting rules';
    const ad = Free.reject(parseInt(req.params.id, 10) || 0);
    if (ad) {
      notify.inbox(ad.client_id, { kind: 'free_rejected', tone: 'warn', title: `Free ad not approved — ${ad.title}`, body: `Reason: ${note}. Edit the ad and try again, or publish it with a paid plan.`, link: `/client/ads/${ad.id}/edit`, linkText: 'Edit ad' });
      req.flash('success', `Free ad #${ad.id} turned down. The seller sees the reason.`);
    }
    res.redirect(back(req, '/admin/ads?status=free_review'));
  });
  app.post('/admin/ads/:id/block', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad) {
      db.prepare("UPDATE ads SET status = 'blocked', block_reason = ?, rank_score = -1, updated_at = ? WHERE id = ?").run(V.str(req.body.reason, 200) || 'Removed by admin', Date.now(), ad.id);
      db.prepare('UPDATE reports SET resolved = 1 WHERE ad_id = ?').run(ad.id);
      notify.adBlocked(ad, V.str(req.body.reason, 200));
      req.flash('success', `Ad #${ad.id} blocked.`);
    }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/unblock', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad && ad.status === 'blocked') {
      const now = Date.now();
      const status = ad.paused_remaining_ms ? 'paused' : ad.expires_at && ad.expires_at > now ? 'active' : ad.paid_total_paise > 0 ? 'expired' : 'awaiting_payment';
      db.prepare('UPDATE ads SET status = ?, block_reason = NULL, updated_at = ? WHERE id = ?').run(status, now, ad.id);
      rescore(ad.id);
      req.flash('success', `Ad #${ad.id} unblocked (${status.replace('_', ' ')}).`);
    }
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/pause', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad && life.pauseAd(ad.id, 'admin')) req.flash('success', `Ad #${ad.id} deactivated — its remaining paid days are saved.`);
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/resume', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad && ad.paused_by === 'account') { req.flash('error', 'This ad is hidden because the seller account is deactivated. Reactivate the client instead.'); res.redirect(back(req, '/admin/ads')); return; }
    if (ad && life.resumeAd(ad.id)) req.flash('success', `Ad #${ad.id} is live again.`);
    res.redirect(back(req, '/admin/ads'));
  });
  app.post('/admin/ads/:id/delete', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (ad && life.deleteAd(ad.id)) req.flash('success', `Ad #${ad.id} deleted.`);
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
    if (ad) { const m = ad.top_slots ? 0 : ALL_SLOTS; db.prepare('UPDATE ads SET is_top = ?, top_slots = ? WHERE id = ?').run(m ? 1 : 0, m, ad.id); rescore(ad.id); }
    res.redirect(back(req, '/admin/ads'));
  });
  // One place for the admin's promotion tools: scheduled TOP (days or until a date, in chosen slots), boost, free days.
  app.post('/admin/ads/:id/promote', requireAdmin, (req, res) => {
    const ad = adById(req.params.id);
    if (!ad) { res.redirect('/admin/ads'); return; }
    const now = Date.now();
    const msgs = [];
    if (req.body.remove_top === '1') {
      db.prepare('UPDATE ads SET admin_top_until = NULL WHERE id = ?').run(ad.id); msgs.push('admin TOP removed');
    } else {
      let until = null;
      if (req.body.top_until) { const t = Date.parse(`${req.body.top_until}:00+05:30`); if (Number.isFinite(t) && t > now) until = t; }
      const days = Math.max(0, Math.min(365, parseInt(req.body.top_days, 10) || 0));
      if (!until && days) until = now + days * 86400_000;
      const mask = (maskFrom(req.body.top_slots) & ALL_SLOTS) || ALL_SLOTS;
      if (until) { db.prepare('UPDATE ads SET admin_top_until = ?, admin_top_slots = ? WHERE id = ?').run(until, mask, ad.id); msgs.push(`TOP until ${fmtDate(until)} (${slotLabels(mask).join(', ')})`); }
    }
    if (req.body.boost !== undefined && req.body.boost !== '') {
      const boost = Math.max(-10, Math.min(10, parseInt(req.body.boost, 10) || 0));
      db.prepare('UPDATE ads SET admin_boost = ? WHERE id = ?').run(boost, ad.id); msgs.push(`boost ${boost}`);
    }
    const extra = Math.max(0, Math.min(365, parseInt(req.body.extend_days, 10) || 0));
    if (extra && (ad.status === 'active' || ad.status === 'expired')) {
      const base = ad.status === 'active' && ad.expires_at > now ? ad.expires_at : now;
      db.prepare("UPDATE ads SET status = 'active', starts_at = CASE WHEN status = 'expired' THEN ? ELSE starts_at END, expires_at = ?, updated_at = ? WHERE id = ?").run(now, base + extra * 86400_000, now, ad.id);
      msgs.push(`+${extra} free day(s)`);
    }
    rescore(ad.id);
    req.flash('success', `Ad #${ad.id}: ${msgs.join(' · ') || 'no change'}.`);
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
  // Live counters for the admin pages (polled every few seconds): new payments, sellers and complaints show up without refreshing.
  app.get('/admin/live', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.admin) { res.status(401).json({ ok: false }); return; }
    const payOnly = !can(req, 'sellers');
    const last = db.prepare(`SELECT p.id, p.amount_paise, p.wallet_paise, c.name FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.status = 'pending' ORDER BY p.id DESC LIMIT 1`).get();
    const lastTop = db.prepare(`SELECT t.id, t.amount_paise, c.name FROM wallet_topups t JOIN clients c ON c.id = t.client_id WHERE t.status = 'pending' ORDER BY t.id DESC LIMIT 1`).get();
    const lastSeller = db.prepare("SELECT id, name FROM clients WHERE status IN ('pending','video_call') ORDER BY id DESC LIMIT 1").get();
    res.json({
      ok: true,
      kyc: !can(req, 'sellers') ? 0 : db.prepare("SELECT COUNT(*) n FROM clients WHERE status IN ('pending','video_call')").get().n,
      pay: db.prepare("SELECT (SELECT COUNT(*) FROM payments WHERE status = 'pending') + (SELECT COUNT(*) FROM wallet_topups WHERE status = 'pending') n").get().n,
      reports: !can(req, 'reports') ? 0 : db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved = 0').get().n,
      payKey: `${last ? last.id : 0}-${lastTop ? lastTop.id : 0}`,
      payText: last ? `New payment ${rupees(last.amount_paise - (last.wallet_paise || 0))} from ${last.name}` : lastTop ? `Balance top-up ${rupees(lastTop.amount_paise)} from ${lastTop.name}` : '',
      sellerKey: payOnly ? 0 : lastSeller ? lastSeller.id : 0, sellerText: payOnly ? '' : lastSeller ? `New seller to verify: ${lastSeller.name}` : '',
      free: !can(req, 'ads') ? 0 : db.prepare("SELECT COUNT(*) n FROM ads WHERE status = 'free_review'").get().n,
    });
  });
  require('./reports').register(app, { requireAdmin, page });
  require('./homeadmin').register(app, { requireAdmin, page });
  require('./sponsors').register(app, { requireAdmin, page, renderPage });
  app.post('/admin/reports/:id/resolve', requireAdmin, (req, res) => {
    db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(parseInt(req.params.id, 10) || 0);
    res.redirect('/admin/reports#ad-reports');
  });

  // ---- Settings ----
  app.get('/admin/settings', requireAdmin, (req, res) => {
    res.html(page(req, 'Settings', settingsView(req, {
      s: getSettings(), plans: db.prepare('SELECT * FROM plans ORDER BY sort, days').all(),
      cats: db.prepare('SELECT * FROM categories ORDER BY sort, name').all(), admins: db.prepare('SELECT id, name, email, role, role_id, is_active FROM admins ORDER BY role = \'owner\' DESC, id').all(),
    })));
  });
  app.post('/admin/settings', requireAdmin, (req, res) => {
    const b = req.body;
    for (const k of ['upi_id', 'upi_payee_name', 'support_phone', 'support_email']) setSetting(k, V.str(b[k], 120));
    if (req.files.upi_qr?.[0]) {
      try {
        const name = saveUpload(req.files.upi_qr[0], 'ads', { maxMb: 3 });
        removeFile('ads', getSettings().upi_qr_file);
        setSetting('upi_qr_file', name);
      } catch (e) { if (e instanceof UploadError) { req.flash('error', e.message); res.redirect('/admin/settings#site'); return; } throw e; }
    }
    req.flash('success', 'Settings saved.');
    res.redirect('/admin/settings#site');
  });
  app.post('/admin/legal', requireAdmin, (req, res) => {
    const b = req.body;
    for (const [k, n] of [['legal_name', 120], ['legal_address', 300], ['jurisdiction_city', 60], ['grievance_name', 80], ['grievance_phone', 20], ['data_location', 60]]) setSetting(k, V.str(b[k], n));
    const gstin = V.str(b.gstin, 15).toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) { req.flash('error', 'GSTIN should look like 22AAAAA0000A1Z5 (15 characters).'); res.redirect('/admin/settings#legal'); return; }
    setSetting('gstin', gstin);
    const em = V.str(b.grievance_email, 120);
    if (em && !V.isValidEmail(em)) { req.flash('error', 'Enter a valid grievance email.'); res.redirect('/admin/settings#legal'); return; }
    setSetting('grievance_email', em);
    req.flash('success', 'Business details saved — they now show on receipts and policy pages.');
    res.redirect('/admin/settings#legal');
  });
  app.post('/admin/plans', requireAdmin, (req, res) => {
    const b = req.body; const ids = [].concat(b.id || []);
    tx(() => {
      ids.forEach((id, i) => {
        const name = V.str([].concat(b.name)[i], 60); const days = parseInt([].concat(b.days)[i], 10);
        const price = Math.round(Number([].concat(b.price)[i]) * 100); const top = Math.round(Number([].concat(b.top)[i] || 0) * 100);
        const priority = Math.max(1, Math.min(10, parseInt([].concat(b.priority)[i], 10) || 1)); const active = [].concat(b.active)[i] === '1' ? 1 : 0;
        const discount = Math.max(0, Math.min(90, parseInt([].concat(b.discount || [])[i], 10) || 0));
        if (!name || !(days > 0) || !Number.isFinite(price) || price < 0 || !Number.isFinite(top) || top < 0) return;
        if (id === 'new') db.prepare('INSERT INTO plans (name, days, price_paise, top_price_paise, priority, is_active, sort, discount_pct) VALUES (?,?,?,?,?,?,?,?)').run(name, days, price, top, priority, active, days, discount);
        else db.prepare('UPDATE plans SET name=?, days=?, price_paise=?, top_price_paise=?, priority=?, is_active=?, sort=?, discount_pct=? WHERE id=?').run(name, days, price, top, priority, active, days, discount, parseInt(id, 10));
      });
    });
    rescore(0);
    req.flash('success', 'Plans saved.');
    res.redirect('/admin/settings#plans');
  });
  // ---- Categories: main → sub ----
  const catCounts = () => Object.fromEntries(db.prepare("SELECT category_id, COUNT(*) n FROM ads WHERE status != 'deleted' GROUP BY category_id").all().map((r) => [r.category_id, r.n]));
  app.get('/admin/categories', requireAdmin, (req, res) => {
    res.html(page(req, 'Categories', categoriesView(req, Cat.tree({ includeInactive: true }), catCounts())));
  });
  app.post('/admin/categories/add', requireAdmin, (req, res) => {
    const name = V.str(req.body.name, 40);
    const parent = req.body.parent_id ? Cat.byId(req.body.parent_id) : null;
    if (!name) { req.flash('error', 'Enter a name.'); res.redirect('/admin/categories'); return; }
    if (req.body.parent_id && (!parent || parent.parent_id)) { req.flash('error', 'Choose a main category.'); res.redirect('/admin/categories'); return; }
    const icon = V.str(req.body.icon, 4) || (parent ? parent.icon : '📦');
    const sort = parseInt(req.body.sort, 10) || 99;
    db.prepare('INSERT INTO categories (name, slug, icon, sort, is_active, parent_id) VALUES (?,?,?,?,1,?)')
      .run(name, Cat.makeSlug(name, parent ? parent.slug : ''), icon, sort, parent ? parent.id : null);
    req.flash('success', parent ? `Sub-category "${name}" added under ${parent.name}.` : `Main category "${name}" added.`);
    res.redirect('/admin/categories');
  });
  app.post('/admin/categories/:id', requireAdmin, (req, res) => {
    const c = Cat.byId(req.params.id);
    if (!c) { res.redirect('/admin/categories'); return; }
    const name = V.str(req.body.name, 40) || c.name;
    const icon = V.str(req.body.icon, 4) || c.icon;
    const sort = Number.isFinite(parseInt(req.body.sort, 10)) ? parseInt(req.body.sort, 10) : c.sort;
    const active = req.body.is_active === '0' ? 0 : 1;
    let parentId = c.parent_id;
    if (c.parent_id && req.body.parent_id) {       // a sub-category can be moved under another main category
      const p = Cat.byId(req.body.parent_id);
      if (p && !p.parent_id) parentId = p.id;
    }
    db.prepare('UPDATE categories SET name = ?, icon = ?, sort = ?, is_active = ?, parent_id = ? WHERE id = ?').run(name, icon, sort, active, parentId, c.id);
    req.flash('success', `"${name}" saved${active ? '' : ' — deactivated (hidden from the site menus and new ads; existing ads keep running)'}.`);
    res.redirect('/admin/categories');
  });
  // Category tile photo: the admin's own picture, or back to the built-in photo.
  app.post('/admin/categories/:id/photo', requireAdmin, (req, res) => {
    const c = Cat.byId(req.params.id);
    if (!c) { res.redirect('/admin/categories'); return; }
    const file = req.files && req.files.image && req.files.image[0];
    if (req.body.reset === '1') {
      if (c.image) removeFile('ads', c.image);
      db.prepare('UPDATE categories SET image = NULL WHERE id = ?').run(c.id);
      req.flash('success', `"${c.name}" uses the built-in photo again.`);
    } else if (file && file.data && file.data.length) {
      try {
        const name = saveUpload(file, 'ads', { maxMb: 4 });
        if (c.image) removeFile('ads', c.image);
        db.prepare('UPDATE categories SET image = ? WHERE id = ?').run(name, c.id);
        req.flash('success', `New photo saved for "${c.name}".`);
      } catch (e) { if (!(e instanceof UploadError)) throw e; req.flash('error', e.message); }
    } else req.flash('error', 'Choose a photo first.');
    res.redirect('/admin/categories');
  });
  app.post('/admin/categories/:id/delete', requireAdmin, (req, res) => {
    const c = Cat.byId(req.params.id);
    if (!c) { res.redirect('/admin/categories'); return; }
    // A main category is deleted together with its sub-categories. Their ads move to the category you choose.
    const ids = [c.id, ...db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(c.id).map((r) => r.id)];
    const marks = ids.map(() => '?').join(',');
    const used = db.prepare(`SELECT COUNT(*) n FROM ads WHERE category_id IN (${marks})`).get(...ids).n;
    let to = null;
    if (used) {
      to = Cat.byId(req.body.move_to);
      if (!to || ids.includes(to.id)) { req.flash('error', `"${c.name}" has ${used} ad(s). Choose where to move them, then delete.`); res.redirect('/admin/categories'); return; }
    }
    tx(() => {
      if (used) db.prepare(`UPDATE ads SET category_id = ? WHERE category_id IN (${marks})`).run(to.id, ...ids);
      db.prepare(`DELETE FROM categories WHERE id IN (${marks})`).run(...ids);
    });
    req.flash('success', `"${c.name}" deleted${ids.length > 1 ? ` with ${ids.length - 1} sub-categor${ids.length === 2 ? 'y' : 'ies'}` : ''}${used ? ` — ${used} ad(s) moved to ${Cat.label(to.id)}` : ''}.`);
    res.redirect('/admin/categories');
  });
  app.post('/admin/slots', requireAdmin, (req, res) => {
    tx(() => {
      for (const sl of SLOTS) {
        const price = Math.round(Number(req.body[`price_${sl.slot}`]) * 100);
        if (!Number.isFinite(price) || price < 0) continue;
        db.prepare('INSERT INTO top_slots (slot, price_per_day_paise, is_active) VALUES (?, ?, ?) ON CONFLICT(slot) DO UPDATE SET price_per_day_paise = excluded.price_per_day_paise, is_active = excluded.is_active')
          .run(sl.slot, price, req.body[`active_${sl.slot}`] === '0' ? 0 : 1);
      }
    });
    req.flash('success', 'TOP slot prices saved.');
    res.redirect('/admin/settings#slots');
  });
  app.post('/admin/automation', requireAdmin, (req, res) => {
    const num = (v) => String(Math.max(0, Math.min(10080, parseInt(v, 10) || 0)));
    setSetting('auto_approve_minutes', num(req.body.auto_approve_minutes));
    setSetting('require_mobile_otp', req.body.require_mobile_otp === '1' ? '1' : '0');
    setSetting('complaint_block_threshold', String(Math.max(0, Math.min(100000, parseInt(req.body.complaint_block_threshold, 10) || 0))));
    setSetting('sponsor_every', String(Math.max(3, Math.min(50, parseInt(req.body.sponsor_every, 10) || 8))));
    setSetting('free_ads', req.body.free_ads === '1' ? '1' : '0');
    setSetting('free_ads_review', req.body.free_ads_review === '1' ? '1' : '0');
    setSetting('free_ad_days', String(Math.max(1, Math.min(365, parseInt(req.body.free_ad_days, 10) || 15))));
    setSetting('free_ads_per_seller', String(Math.max(1, Math.min(50, parseInt(req.body.free_ads_per_seller, 10) || 2))));
    const em = V.str(req.body.notify_email, 120);
    if (!em || V.isValidEmail(em)) setSetting('notify_email', em);
    req.flash('success', 'Saved.');
    res.redirect('/admin/settings#approvals');
  });
  const saveAlerts = (b) => {
    const ev = [].concat(b['alert_events[]'] || b.alert_events || []).filter((k) => ['payment', 'seller', 'complaint', 'sponsor', 'free_ad'].includes(k));
    setSetting('alert_events', ev.join(',') || 'none');
    setSetting('alert_wa_mode', ['callmebot', 'cloud'].includes(b.alert_wa_mode) ? b.alert_wa_mode : '');
    setSetting('alert_wa_phone', V.str(b.alert_wa_phone, 20).replace(/[^0-9+]/g, ''));
    setSetting('alert_wa_apikey', V.str(b.alert_wa_apikey, 80));
    setSetting('alert_wa_phone_id', V.str(b.alert_wa_phone_id, 40));
    if (String(b.alert_wa_token || '').trim()) setSetting('alert_wa_token', String(b.alert_wa_token).trim().slice(0, 600));
    if (String(b.alert_telegram_token || '').trim()) setSetting('alert_telegram_token', String(b.alert_telegram_token).trim().slice(0, 120));
    setSetting('alert_telegram_chat', V.str(b.alert_telegram_chat, 40));
    setSetting('alert_gchat_webhook', V.str(b.alert_gchat_webhook, 500));
  };
  app.post('/admin/alerts', requireAdmin, (req, res) => {
    saveAlerts(req.body);
    req.flash('success', `Alerts saved. ${alertChannels().length ? `Active: ${alertChannels().join(', ')}.` : 'No channel is set up yet.'}`);
    res.redirect('/admin/settings#alerts');
  });
  app.post('/admin/alerts/test', requireAdmin, async (req, res) => {
    saveAlerts(req.body);
    if (!alertChannels().length) { req.flash('error', 'Fill in at least one channel (WhatsApp, Telegram or Google Chat) first.'); res.redirect('/admin/settings#alerts'); return; }
    const out = await sendAlert(`✅ Test alert from ${getSettings().site_name}. Alerts are working!`);
    const bad = out.filter((o) => !o.ok);
    req.flash(bad.length ? 'error' : 'success', bad.length ? `Not sent: ${bad.map((o) => `${o.channel} (${String(o.error).slice(0, 120)})`).join('; ')}. ${out.filter((o) => o.ok).map((o) => o.channel).join(', ')} OK.` : `Test alert sent to ${out.map((o) => o.channel).join(', ')}. Check your phone.`);
    res.redirect('/admin/settings#alerts');
  });
  app.post('/admin/messaging/email', requireAdmin, (req, res) => {
    const provider = ['gmail', 'brevo', 'other'].includes(req.body.provider) ? req.body.provider : 'gmail';
    const user = V.str(req.body.smtp_user, 120);
    const mailFrom = V.str(req.body.mail_from, 120).toLowerCase();
    const back = '/admin/settings#email';
    if (!user) { req.flash('error', 'Enter the login / username.'); res.redirect(back); return; }
    if (provider === 'gmail' && !V.isValidEmail(user)) { req.flash('error', 'Enter your full Gmail address as the login.'); res.redirect(back); return; }
    if (mailFrom && !V.isValidEmail(mailFrom)) { req.flash('error', '"Send emails as" must be an email address.'); res.redirect(back); return; }
    if (provider === 'brevo' && !mailFrom) { req.flash('error', 'For Brevo, fill in "Send emails as" with the email address you verified in Brevo.'); res.redirect(back); return; }
    setSetting('mail_provider', provider);
    setSetting('smtp_user', provider === 'gmail' ? user.toLowerCase() : user);
    const pass = String(req.body.smtp_pass || '').trim();
    if (pass) setSetting('smtp_pass', pass);
    const presets = { gmail: ['smtp.gmail.com', 465], brevo: ['smtp-relay.brevo.com', 587] };
    const [host, port] = provider === 'other' ? [V.str(req.body.smtp_host, 120), parseInt(req.body.smtp_port, 10) || 587] : presets[provider];
    if (!host) { req.flash('error', 'Enter the SMTP server.'); res.redirect(back); return; }
    setSetting('smtp_host', host);
    setSetting('smtp_port', String(port));
    setSetting('mail_from', provider === 'gmail' ? '' : mailFrom);
    if (!getSettings().notify_email) setSetting('notify_email', mailFrom || (V.isValidEmail(user) ? user.toLowerCase() : ''));
    req.flash('success', 'Email settings saved. Now click "Send test email to me" to check them.');
    res.redirect('/admin/settings#email');
  });
  app.post('/admin/messaging/sms', requireAdmin, (req, res) => {
    const prov = ['android', 'fast2sms', 'msg91'].includes(req.body.sms_provider) ? req.body.sms_provider : '';
    const user = V.str(req.body.sms_user, 200);
    const pass = String(req.body.sms_pass || '').trim();
    setSetting('sms_provider', prov);
    if (prov === 'android') { if (user) setSetting('sms_gateway_user', user); if (pass) setSetting('sms_gateway_pass', pass); }
    if (prov === 'fast2sms' && user) setSetting('fast2sms_api_key', user);
    if (prov === 'msg91') { if (user) setSetting('msg91_auth_key', user); if (pass) setSetting('msg91_template_id', pass); }
    req.flash('success', prov ? 'SMS settings saved. Send a test SMS to check them.' : 'SMS turned off — sellers verify by email only.');
    res.redirect('/admin/settings#email');
  });
  app.post('/admin/test-email', requireAdmin, async (req, res) => {
    const to = getSettings().notify_email || req.admin.email;
    const r = await sendEmail(to, `Test email from ${getSettings().site_name}`, ['It works! Your email settings are correct.']);
    let msg = `Test email sent to ${to}. Check the inbox (and Spam folder).`;
    if (!r.ok && r.status === 'not_configured') msg = 'Email is not set up yet — fill in your Gmail and App Password above.';
    else if (!r.ok && /535|534|Username and Password|BadCredentials|auth/i.test(r.error || '')) {
      const mp = getSettings().mail_provider;
      msg = mp === 'brevo'
        ? 'Brevo refused the login. Copy the "Login" and a new SMTP key from Brevo → SMTP & API → SMTP (not your Brevo password).'
        : mp === 'other' ? 'The email server refused the login. Check the username and password.'
        : 'Gmail refused the login. Use an App Password (16 letters from myaccount.google.com/apppasswords), not your normal Gmail password, and make sure 2-Step Verification is ON. If App Passwords are not available for your account, choose Brevo instead.';
    } else if (!r.ok && /sender|not.*(valid|verified)|550|553/i.test(r.error || '')) msg = `The email service refused the sender address. In Brevo, verify the "Send emails as" address first. (${r.error})`;
    else if (!r.ok) msg = `Email failed: ${r.error}. Check the internet connection and the SMTP server/port.`;
    req.flash(r.ok ? 'success' : 'error', msg);
    res.redirect('/admin/settings#email');
  });
  app.post('/admin/test-sms', requireAdmin, async (req, res) => {
    const phone = V.normalizePhone(req.body.phone);
    if (!V.isValidPhone(phone)) { req.flash('error', 'Enter a valid 10-digit mobile number.'); res.redirect('/admin/settings#email'); return; }
    const r = await sendSmsOtp(phone, '123456');
    req.flash(r.ok ? 'success' : 'error', r.ok ? `Test SMS sent to ${phone}.` : r.status === 'not_configured' ? 'SMS is not set up yet — choose an SMS service above.' : `SMS failed: ${r.error}`);
    res.redirect('/admin/settings#email');
  });
  app.get('/admin/messages', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 200').all();
    res.html(page(req, 'Messages', html`
      <div class="page-head"><div><h1>Messages</h1><p class="muted">Every email and SMS the site sent. When email/SMS is not set up yet, messages (including OTP codes) are kept here so you can still test.</p></div></div>
      ${rows.length ? html`<div class="table-wrap card"><table class="table">
        <thead><tr><th>Time</th><th>Type</th><th>To</th><th>Subject / message</th><th>Status</th></tr></thead>
        <tbody>${rows.map((m) => html`<tr>
          <td>${fmtDate(m.created_at)}</td><td>${({ sms: '📱 SMS', email: '📧 Email', telegram: '✈️ Telegram', whatsapp: '🟢 WhatsApp', gchat: '💬 Google Chat' })[m.channel] || m.channel}</td><td>${m.to_addr}</td>
          <td><details><summary>${m.subject || m.body.slice(0, 60)}</summary><pre class="msg-body">${m.body}</pre></details></td>
          <td>${m.status === 'sent' ? html`<span class="pill pill-ok">Sent</span>` : m.status === 'failed' ? html`<span class="pill pill-bad" title="${m.error}">Failed</span><div class="small muted">${String(m.error || '').slice(0, 80)}</div>` : html`<span class="pill pill-warn">Not set up</span>`}</td></tr>`)}
        </tbody></table></div>` : html`<div class="card empty center"><p class="muted">No messages yet.</p></div>`}`));
  });

  // Staff accounts — only the owner can add, change or remove them.
  const ownerOnly = (req, res) => { if (isOwner(req)) return true; req.flash('error', 'Only the owner can do this.'); res.redirect('/admin/settings#admins'); return false; };
  const roleFrom = (v) => Staff.roleById(parseInt(v, 10) || 0);
  app.post('/admin/admins', requireAdmin, (req, res) => {
    if (!ownerOnly(req, res)) return;
    const email = V.str(req.body.email, 120).toLowerCase(); const name = V.str(req.body.name, 60);
    const role = roleFrom(req.body.role_id);
    if (!V.isValidEmail(email) || !name || String(req.body.password || '').length < 6 || !role) { req.flash('error', 'Enter name, valid email, a password of 6+ characters, and choose a role.'); res.redirect('/admin/settings#admins'); return; }
    if (db.prepare('SELECT 1 FROM admins WHERE email = ?').get(email)) { req.flash('error', 'Someone with this email already has a staff login.'); res.redirect('/admin/settings#admins'); return; }
    db.prepare("INSERT INTO admins (name, email, password_hash, created_at, role, role_id) VALUES (?,?,?,?, 'staff', ?)").run(name, email, hashPassword(req.body.password), Date.now(), role.id);
    req.flash('success', `Login added for ${name} (${role.name}). Give them the email and password.`);
    res.redirect('/admin/settings#admins');
  });
  const endSessions = (adminId) => {
    db.prepare('DELETE FROM sessions WHERE data LIKE ?').run(`%"adminId":${adminId},%`);
    db.prepare('DELETE FROM sessions WHERE data LIKE ?').run(`%"adminId":${adminId}}%`);
  };
  app.post('/admin/admins/:id', requireAdmin, (req, res) => {
    if (!ownerOnly(req, res)) return;
    const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
    if (!a || a.role === 'owner') { req.flash('error', 'The owner account cannot be changed here.'); res.redirect('/admin/settings#admins'); return; }
    if (req.body.action === 'remove') {
      db.prepare('UPDATE admins SET is_active = 0 WHERE id = ?').run(a.id); endSessions(a.id);
      req.flash('success', `${a.name} can no longer log in.`);
    } else if (req.body.action === 'enable') {
      db.prepare('UPDATE admins SET is_active = 1 WHERE id = ?').run(a.id);
      req.flash('success', `${a.name} can log in again.`);
    } else {
      const role = roleFrom(req.body.role_id);
      if (role) { db.prepare("UPDATE admins SET role = 'staff', role_id = ? WHERE id = ?").run(role.id, a.id); req.flash('success', `${a.name} is now: ${role.name}.`); }
    }
    res.redirect('/admin/settings#admins');
  });
  // Roles: a name + the permissions the owner ticks (src/staff.js)
  const perms = (b) => (Array.isArray(b['perms[]']) ? b['perms[]'] : Array.isArray(b.perms) ? b.perms : [b['perms[]'] || b.perms].filter(Boolean));
  app.post('/admin/roles', requireAdmin, (req, res) => {
    if (!ownerOnly(req, res)) return;
    const name = V.str(req.body.name, 40);
    if (!name) { req.flash('error', 'Give the role a name.'); res.redirect('/admin/settings#admins'); return; }
    if (db.prepare('SELECT 1 FROM roles WHERE name = ? COLLATE NOCASE').get(name)) { req.flash('error', `A role called "${name}" already exists.`); res.redirect('/admin/settings#admins'); return; }
    Staff.saveRole({ name, perms: perms(req.body) });
    req.flash('success', `Role "${name}" created. Choose it when you add a staff login.`);
    res.redirect('/admin/settings#admins');
  });
  app.post('/admin/roles/:id', requireAdmin, (req, res) => {
    if (!ownerOnly(req, res)) return;
    const r = Staff.roleById(req.params.id);
    if (!r) { res.redirect('/admin/settings#admins'); return; }
    if (req.body.action === 'delete') {
      const n = db.prepare("SELECT COUNT(*) n FROM admins WHERE role_id = ? AND role != 'owner'").get(r.id).n;
      if (n) req.flash('error', `Move the ${n} ${n === 1 ? 'person' : 'people'} with this role to another role first.`);
      else { db.prepare('DELETE FROM roles WHERE id = ?').run(r.id); req.flash('success', `Role "${r.name}" deleted.`); }
      res.redirect('/admin/settings#admins'); return;
    }
    const name = V.str(req.body.name, 40) || r.name;
    Staff.saveRole({ id: r.id, name, perms: perms(req.body) });
    req.flash('success', `Role "${name}" saved. It applies at once to everyone with this role.`);
    res.redirect('/admin/settings#admins');
  });
  // Brand: name, tagline, logo and colours — owner only (the name can change later, e.g. if "AdBazaar" is taken).
  app.post('/admin/brand', requireAdmin, (req, res) => {
    if (!ownerOnly(req, res)) return;
    const name = V.str(req.body.site_name, 40);
    if (!name) { req.flash('error', 'Enter the site name.'); res.redirect('/admin/settings#admins'); return; }
    setSetting('site_name', name); setSetting('tagline', V.str(req.body.tagline, 120));
    if (Brand.THEMES[req.body.brand_theme]) setSetting('brand_theme', req.body.brand_theme);
    const old = getSettings().brand_logo || '';
    if (req.body.remove_logo === '1' && old) { removeFile('ads', old); setSetting('brand_logo', ''); }
    const file = req.files && req.files.logo && req.files.logo[0];
    if (file && file.data && file.data.length) {
      try {
        const saved = saveUpload(file, 'ads', { maxMb: 2 });
        if (old) removeFile('ads', old);
        setSetting('brand_logo', saved);
      } catch (e) { if (e instanceof UploadError) { req.flash('error', e.message); res.redirect('/admin/settings#admins'); return; } throw e; }
    }
    req.flash('success', `Brand saved: "${name}". It shows everywhere — header, emails, receipts and legal pages.`);
    res.redirect('/admin/settings#admins');
  });
  // Own password (every staff member, including the payment checker)
  app.get('/admin/account', requireAdmin, (req, res) => res.html(page(req, 'My login', html`
    <div class="page-head"><div><h1>My login</h1><p class="muted">${req.admin.name} · ${req.admin.email} · ${req.admin.roleName}</p></div></div>
    <form method="post" action="/admin/password" class="card form narrow">${csrf(req)}
      <h2>Change my password</h2>
      ${field('Current password', html`<input type="password" name="current" required autocomplete="current-password">`)}
      ${field('New password', html`<input type="password" name="password" required minlength="6" autocomplete="new-password">`)}
      <button class="btn btn-primary">Save new password</button></form>`)));
  app.post('/admin/password', requireAdmin, (req, res) => {
    const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    const to = isOwner(req) ? '/admin/settings#admins' : '/admin/account';
    if (!verifyPassword(req.body.current, a.password_hash)) { req.flash('error', 'Current password is incorrect.'); res.redirect(to); return; }
    if (String(req.body.password || '').length < 6) { req.flash('error', 'New password must be 6+ characters.'); res.redirect(to); return; }
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), a.id);
    req.flash('success', 'Password updated.');
    res.redirect(to);
  });
}

module.exports = { register };
