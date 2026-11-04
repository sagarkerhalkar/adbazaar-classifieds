'use strict';
// Client (advertiser) portal: KYC registration, status, video call, login, ads, payments.

const path = require('node:path');
const { db, tx, getSettings, parseImages, parseVideos } = require('../db');
const notify = require('../notify');
const { SLOTS, maskFrom, sanitizeMask, slotLabels, slotPrices } = require('../slots');
const { html, rupees, fmtDate, fmtDay, timeLeft, approveTimeText, PAYMENT_TIME_TEXT } = require('../lib/html');
const { renderPage } = require('../views/layout');
const { icon } = require('../views/icons');
const { csrf, pill, adUrl, imgUrl, field, cityDatalist, stateSelect, idFields, addressFields } = require('../views/components');
const { checkId, describeId } = require('../idproof');
const { hashPassword, verifyPassword, randomToken, rateLimit } = require('../lib/security');
const { saveUpload, saveVideo, saveDataUrl, removeFile, UploadError, sendFile, DIRS, safeName } = require('../lib/files');
const V = require('../validators');
const { receiptData, receiptPage } = require('../views/receipt');
const { TERMS_VERSION } = require('./legal');
const P = require('../payments');
const W = require('../wallet');
const rtc = require('../rtc');
const Cat = require('../categories');
const life = require('../lifecycle');
const Free = require('../freeads');

const MAX_IMAGES = 5;
const MAX_VIDEOS = 2;

// ---------- guards ----------
function requireClient(req, res) {
  if (!req.seller) {
    req.session.returnTo = req.method === 'GET' ? req.url : '/client';
    req.flash('info', 'Please log in to continue.');
    res.redirect('/client/login');
  }
}

// Only people aged 18+ may post or pay for ads. Accounts made before the age check are asked once.
function requireAdult(req, res) {
  if (!req.seller) return;
  const err = V.checkDob(req.seller.dob);
  if (!err) return;
  if (req.method === 'GET') { req.session.returnTo = req.url; res.redirect('/client/age'); return; }
  if (String(req.headers['content-type'] || '').startsWith('application/json')) { res.status(403).json({ error: 'Please confirm your date of birth first (18+ only).' }); return; }
  req.flash('error', 'Please confirm your date of birth first — only people aged 18 or older can post ads.');
  res.redirect('/client/age');
}

function ownAd(req, res) {
  const ad = db.prepare("SELECT * FROM ads WHERE id = ? AND client_id = ? AND status != 'deleted'").get(parseInt(req.params.id, 10) || 0, req.seller.id);
  if (!ad) { req.flash('error', 'Ad not found.'); res.redirect('/client'); return null; }
  return ad;
}

const clientByToken = (token) => (/^[A-Za-z0-9_-]{20,64}$/.test(token || '') ? db.prepare('SELECT * FROM clients WHERE status_token = ?').get(token) : null);

// ---------- views ----------
function registerView(req, v = {}, error) {
  const mins = approveTimeText(req.settings.auto_approve_minutes);
  return html`
  <div class="kyc-shell">
    <aside class="kyc-aside">
      <h2>Become a verified seller</h2>
      <p>Buyers trust sellers who are verified. It takes about 3 minutes.</p>
      <ul class="kyc-points">
        <li>${icon('id', { size: 20 })}<span><strong>One ID only</strong>Aadhaar, PAN or Passport</span></li>
        <li>${icon('camera', { size: 20 })}<span><strong>Live photo</strong>Taken by your camera</span></li>
        <li>${icon('clock', { size: 20 })}<span><strong>Login check: ${mins}</strong>We email you when it's done</span></li>
        <li>${icon('shield', { size: 20 })}<span><strong>Private</strong>Your documents are never shown on ads</span></li>
      </ul>
      <p class="small">Already registered? <a href="/client/login">Log in</a></p>
    </aside>
    <section class="card kyc-card">
      <h1>Register as a seller</h1>
      ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
      <form method="post" action="/client/register" enctype="multipart/form-data" class="form" data-kyc-form data-wizard>
        ${csrf(req)}
        <div data-step data-title="About you">
          <div class="row2">
            ${field('Full name (as on your ID)', html`<input name="name" required maxlength="80" value="${v.name}" autocomplete="name">`)}
            ${field('Date of birth', html`<input type="date" name="dob" required max="${V.maxDob()}" min="1925-01-01" value="${v.dob}">`, 'You must be 18 or older.')}
          </div>
          <div class="row2">
            ${field('Mobile number', html`<input name="phone" required inputmode="numeric" maxlength="13" pattern="[0-9+ ]{10,13}" value="${v.phone}" placeholder="98XXXXXXXX" autocomplete="tel">`)}
            ${field('Email', html`<input name="email" type="email" required maxlength="120" value="${v.email}" autocomplete="email">`, 'We send a 6-digit code here.')}
          </div>
          <div class="row2">
            ${field('Password', html`<input name="password" type="password" required minlength="6" autocomplete="new-password">`, 'At least 6 characters')}
            ${field('Confirm password', html`<input name="password2" type="password" required minlength="6" autocomplete="new-password" data-match="password">`)}
          </div>
          ${field('Business / shop name (optional)', html`<input name="business_name" maxlength="80" value="${v.business_name}">`, 'Shown on your ads')}
        </div>

        <div data-step data-title="Your ID">
          <p class="muted small" style="margin:0">Choose ONE document. We use it only to check your age and name.</p>
          ${idFields(v)}
        </div>

        <div data-step data-title="Live photo">
          <p class="muted small" style="margin:0">Look straight at the camera in good light. It clicks by itself after a 3-second countdown.</p>
          <div class="camera" data-camera data-auto="3">
            <div class="camera-stage">
              <video playsinline muted data-camera-video></video>
              <img alt="Captured live photo" data-camera-preview hidden>
              <div class="camera-count" data-camera-count hidden></div>
            </div>
            <div class="camera-actions">
              <button type="button" class="btn btn-primary" data-camera-start>${icon('camera', { size: 18 })} Start camera</button>
              <button type="button" class="btn btn-accent" data-camera-snap hidden>Capture now</button>
              <button type="button" class="btn btn-ghost" data-camera-retake hidden>Retake</button>
            </div>
            <p class="hint" data-camera-status>Your browser will ask to use the camera — tap Allow.</p>
            <input type="hidden" name="live_photo_data" data-camera-output>
          </div>
          <span data-step-check="[data-camera-output]" data-step-msg="Please take your live photo first."></span>
        </div>

        <div data-step data-title="Finish">
          ${addressFields(v)}
          <label class="check"><input type="checkbox" name="adult" value="1" required> <span>I confirm that I am <strong>18 years or older</strong>.</span></label>
          <label class="check"><input type="checkbox" name="consent" value="1" required> <span>My details are true. I agree to the <a href="/terms" target="_blank">Terms of use</a>, <a href="/privacy" target="_blank">Privacy policy</a> and <a href="/refund-policy" target="_blank">Refund policy</a>, and I allow ${req.settings.site_name} to use my ID and photo only to verify me.</span></label>
          <div class="note small">${icon('clock', { size: 16 })} Login verification takes <strong>${mins}</strong>. After you post an ad, payment confirmation takes <strong>${PAYMENT_TIME_TEXT}</strong>.</div>
        </div>
        <div class="form-actions" data-wizard-submit>
          <button class="btn btn-sell btn-lg">${icon('check', { size: 18 })} Submit for verification</button>
        </div>
      </form>
    </section>
  </div>`;
}

function verifyView(req, c) {
  const needSms = notify.phoneOtpRequired();
  const box = (channel, done, label, target) => html`
    <div class="otp-box ${done ? 'done' : ''}">
      <h3>${done ? '✅' : channel === 'sms' ? '📱' : '📧'} ${label}</h3>
      ${done ? html`<p class="ok">Verified</p>` : html`
        <p class="muted small">We sent a 6-digit code to <strong>${target}</strong>.</p>
        <form method="post" action="/kyc/verify/${c.status_token}" class="otp-form">
          ${csrf(req)}<input type="hidden" name="channel" value="${channel}">
          <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="------" required class="otp-input">
          <button class="btn btn-accent">Verify</button>
        </form>
        <form method="post" action="/kyc/verify/${c.status_token}/resend" class="inline">
          ${csrf(req)}<input type="hidden" name="channel" value="${channel}"><button class="btn btn-ghost btn-sm">Send a new code</button>
        </form>`}
    </div>`;
  return html`
  <section class="card narrow">
    <h1>Confirm your email${needSms ? ' & mobile' : ''}</h1>
    <p class="muted">One-time check — you will never need to do this again.</p>
    ${box('email', c.email_verified_at, 'Email', c.email)}
    ${needSms ? box('sms', c.phone_verified_at, 'Mobile number', `+91 ${c.phone}`) : ''}
    <p class="muted small">Didn't get it? Check your spam folder, wait a minute and tap "Send a new code". Codes are valid for 10 minutes.</p>
  </section>`;
}

function statusView(req, c) {
  const msg = {
    pending: `Login verification takes ${approveTimeText(req.settings.auto_approve_minutes)}. We will email you as soon as you can log in — this page also updates by itself.`,
    video_call: 'We would like to verify you over a short video call. Join using the button below at the scheduled time.',
    approved: 'You are verified! You can now log in and post ads.',
    rejected: 'Unfortunately your verification was not approved.',
    suspended: 'Your seller account has been blocked. Please contact support.',
    deactivated: c.deactivated_by === 'client'
      ? 'You deactivated your account. Log in any time to reactivate it — your remaining paid days are waiting for you.'
      : 'Your account has been deactivated by the admin. Please contact support.',
    deleted: 'This account has been deleted.',
  }[c.status];
  return html`
  <section class="card narrow center" data-autorefresh="${c.status === 'pending' ? 30 : ''}">
    <div class="empty-icon">${icon(c.status === 'approved' ? 'check' : c.status === 'rejected' || c.status === 'suspended' ? 'x' : c.status === 'video_call' ? 'video' : 'clock', { size: 26 })}</div>
    <h1>Verification status</h1>
    <p>${pill(c.status)}</p>
    <p>${msg}</p>
    ${c.admin_note && c.status !== 'approved' ? html`<div class="note"><strong>Message from our team:</strong> ${c.admin_note}</div>` : ''}
    ${c.status === 'video_call' ? html`
      ${c.video_call_at ? html`<p><strong>Scheduled:</strong> ${fmtDate(c.video_call_at)}</p>` : ''}
      <a class="btn btn-accent btn-lg" href="/kyc/call/${c.status_token}">🎥 Join video call</a>` : ''}
    ${c.status === 'approved' ? html`<a class="btn btn-accent btn-lg" href="/client/login">Log in</a>` : ''}
    <p class="muted small">Application #${c.id} · submitted ${fmtDate(c.created_at)} · Save this link to check your status later.</p>
  </section>`;
}

function callView(req, c, { role, eventsUrl, signalUrl, snapshotUrl }) {
  return html`
  <section class="card call-card">
    <div class="call-head">
      <h1>${role === 'admin' ? html`Video call — ${c.name}` : `Video call with ${req.settings.site_name}`}</h1>
      <span class="pill pill-muted" data-call-state>Connecting…</span>
    </div>
    <div class="call-grid" data-call
      data-role="${role}" data-events-url="${eventsUrl}" data-signal-url="${signalUrl}"
      data-snapshot-url="${snapshotUrl || ''}" data-end-url="${role === 'admin' ? `/admin/clients/${c.id}/ring/end` : ''}" data-ice='${JSON.stringify(rtc.iceServers())}'>
      <div class="call-remote">
        <video autoplay playsinline data-remote-video></video>
        <div class="call-wait" data-call-wait>${role === 'admin' ? 'Waiting for the client to join… Share the call link with them.' : 'Connecting you to our team…'}</div>
        <div class="camera-count" data-call-count hidden></div>
      </div>
      <div class="call-local"><video autoplay playsinline muted data-local-video></video><span>You</span></div>
    </div>
    <div class="call-actions">
      <button class="btn" data-call-mute>🎙️ Mute</button>
      <button class="btn" data-call-cam>📷 Camera off</button>
      ${role === 'admin' ? html`
        <button class="btn btn-accent" data-call-snap>📸 Capture live photo</button>
        <button class="btn" data-call-autosnap>⏱️ Auto-capture (3s)</button>` : ''}
      <button class="btn btn-danger" data-call-hangup>End call</button>
    </div>
    ${role === 'admin' ? html`<div class="snapshots" data-call-snapshots></div>` : html`<p class="muted small">Allow the camera and microphone when your browser asks. Keep the ID you registered with nearby in case we ask to see it.</p>`}
  </section>`;
}

const TONE_ICON = { success: 'check', error: 'x', warn: 'clock', info: 'bell' };
function messageCard(m) {
  return html`<article class="msg msg-${m.tone} ${m.read_at ? '' : 'unread'}">
    <span class="msg-ic">${icon(TONE_ICON[m.tone] || 'bell', { size: 18 })}</span>
    <div class="msg-main"><div class="msg-top"><strong>${m.title}</strong><time class="muted small">${timeAgoText(m.created_at)}</time></div>
      ${m.body ? html`<p>${m.body}</p>` : ''}
      ${m.link ? html`<a class="btn btn-sm ${m.tone === 'error' ? 'btn-primary' : ''}" href="${m.link}">${m.link_text || 'Open'}</a>` : ''}</div>
  </article>`;
}
const timeAgoText = (ms) => { const d = Date.now() - ms; if (d < 60_000) return 'just now'; if (d < 3600_000) return `${Math.floor(d / 60_000)} min ago`; if (d < 86400_000) return `${Math.floor(d / 3600_000)} hr ago`; return fmtDate(ms); };

function messagesView(req, rows) {
  return html`
  <div class="page-head"><div><h1>Messages</h1><p class="muted">Updates about your account, payments and ads.</p></div></div>
  ${rows.length ? html`<div class="msgs">${rows.map(messageCard)}</div>` : html`<div class="card empty center"><div class="empty-icon">${icon('bell', { size: 26 })}</div><h3>No messages yet</h3><p class="muted">We will post updates about your payments and ads here.</p></div>`}`;
}

const TX_LABEL = { ad_deleted: 'Unused days kept', topup: 'Money added', spent: 'Used for an ad', refund: 'Returned', admin: 'Added by our team' };
function walletView(req, { bal, rows, topups, settings }) {
  const upiLink = settings.upi_id ? `upi://pay?${new URLSearchParams({ pa: settings.upi_id, pn: settings.upi_payee_name || settings.site_name, cu: 'INR', tn: `Wallet top-up ${req.seller.id}` })}` : '';
  return html`
  <div class="page-head"><div><h1>My balance</h1><p class="muted">Money kept for your next ads — from deleted ads with paid days left, or money you add.</p></div></div>
  <div class="cols2">
    <section class="card walletcard">
      <div class="wallet-big"><span class="muted small">Balance</span><strong>${rupees(bal)}</strong></div>
      <p class="small muted">Use it on the payment screen of any ad: tick "Use my balance". If it covers the full amount, your ad goes live straight away.</p>
      <a class="btn btn-primary" href="/client/ads/new">${icon('plus', { size: 16 })} Post an ad with my balance</a>
      <h3>History</h3>
      ${rows.length ? html`<ul class="list">${rows.map((t) => html`<li><span><strong>${TX_LABEL[t.kind] || t.kind}</strong><span class="small muted" style="display:block">${t.note || ''} · ${fmtDate(t.created_at)}</span></span><strong class="${t.amount_paise > 0 ? 'ok' : ''}">${t.amount_paise > 0 ? '+' : '−'}${rupees(Math.abs(t.amount_paise))}</strong></li>`)}</ul>` : html`<p class="muted small">No changes yet.</p>`}
    </section>
    <section class="card">
      <h2>Add money</h2>
      <p class="small muted">Pay any amount to our UPI ID, then enter the UTR. Money is added after we confirm it (${PAYMENT_TIME_TEXT}). Added money is kept for ads and is not refundable as cash.</p>
      <form method="post" action="/client/wallet/topup" enctype="multipart/form-data" class="form">
        ${csrf(req)}
        <div class="upi-box">
          ${settings.upi_qr_file ? html`<img class="upi-qr" src="${imgUrl(settings.upi_qr_file)}" alt="UPI QR code">` : ''}
          <div>${settings.upi_id ? html`<p>UPI ID <strong class="mono">${settings.upi_id}</strong></p><a class="btn btn-sm only-mobile" href="${upiLink}">Open UPI app</a>` : html`<p class="muted">UPI details are not set up yet.</p>`}</div>
        </div>
        <div class="row2">
          ${field('Amount (₹)', html`<input name="amount" type="number" min="50" max="100000" step="1" required placeholder="e.g. 1000">`)}
          ${field('UPI transaction ID / UTR', html`<input name="utr" required minlength="6" maxlength="30" pattern="[A-Za-z0-9]{6,30}">`)}
        </div>
        ${field('Payment screenshot (optional)', html`<input type="file" name="screenshot" accept="image/*">`)}
        <label class="check"><input type="checkbox" name="accept_terms" value="1" required> <span>I accept the <a href="/terms#payments" target="_blank">payment terms</a>. A wrong UPI ID, amount or UTR is my own responsibility.</span></label>
        <button class="btn btn-accent">Submit for confirmation</button>
      </form>
      ${topups.length ? html`<h3>Your top-ups</h3><ul class="list">${topups.map((t) => html`<li><span>${rupees(t.amount_paise)} · UTR ${t.utr}<span class="small muted" style="display:block">${fmtDate(t.created_at)}${t.admin_note ? ` · ${t.admin_note}` : ''}</span></span>${pill(t.status === 'pending' ? 'payment_review' : t.status)}</li>`)}</ul>` : ''}
    </section>
  </div>`;
}

function dashboardView(req, ads, stats, alerts = []) {
  return html`
  ${alerts.length ? html`<div class="msgs dash-alerts">${alerts.map(messageCard)}</div>` : ''}
  <div class="page-head">
    <div><h1>My ads</h1><p class="muted">Welcome, ${req.seller.name}. Paid ads go live as soon as payment is confirmed and are shown before free ads.</p></div>
    <a class="btn btn-accent" href="/client/ads/new">+ Post a new ad</a>
  </div>
  <div class="stats">
    <div class="stat"><span>${stats.live}</span>Live ads</div>
    <div class="stat"><span>${stats.waiting}</span>Waiting for payment</div>
    <div class="stat"><span>${stats.views}</span>Total views</div>
    <div class="stat"><span>${rupees(stats.spent)}</span>Total spent</div>
    <a class="stat stat-link" href="/client/wallet"><span>${rupees(W.balance(req.seller.id))}</span>My balance — add money</a>
  </div>
  ${ads.length ? html`
  <div class="table-wrap card"><table class="table">
    <thead><tr><th>Ad</th><th>Status</th><th>Plan</th><th>Runs until</th><th>Views</th><th></th></tr></thead>
    <tbody>${ads.map((a) => {
      const imgs = parseImages(a);
      return html`<tr>
        <td><div class="cell-ad">${imgs[0] ? html`<img src="${imgUrl(imgs[0])}" alt="">` : html`<div class="thumb-ph sm">${icon('image', { size: 18 })}</div>`}<div><a href="${adUrl(a)}"><strong>${a.title}</strong></a><div class="muted small">${a.city} · #${a.id}</div></div></div></td>
        <td>${pill(a.status)}${a.top_slots && a.status === 'active' ? html` <span class="pill pill-top" title="TOP time slots">★ TOP ${slotLabels(a.top_slots).join(', ')}</span>` : ''}${a.status === 'blocked' && a.block_reason ? html`<div class="small muted">${a.block_reason}</div>` : ''}</td>
        <td>${a.is_free ? html`<span class="pill pill-muted">Free ad</span>` : a.plan_name || '—'}</td>
        <td>${a.status === 'active' ? html`${fmtDay(a.expires_at)}<div class="small muted">${timeLeft(a.expires_at)}</div>` : '—'}</td>
        <td>${a.views}</td>
        <td class="actions">
          ${a.status === 'awaiting_payment' ? html`<a class="btn btn-accent btn-sm" href="/client/ads/${a.id}/pay">Pay & publish</a>` : ''}
          ${a.status === 'expired' ? html`<a class="btn btn-accent btn-sm" href="/client/ads/${a.id}/pay">Renew</a>` : ''}
          ${a.status === 'active' ? (a.is_free ? html`<a class="btn btn-accent btn-sm" href="/client/ads/${a.id}/pay">Upgrade to paid</a>` : html`<a class="btn btn-sm" href="/client/ads/${a.id}/pay">Extend / Top</a>`) : ''}
          ${a.status !== 'blocked' ? html`<a class="btn btn-ghost btn-sm" href="/client/ads/${a.id}/edit">Edit</a>` : ''}
          ${a.status === 'paused' ? html`<div class="small muted">Hidden by admin · ${Math.ceil((a.paused_remaining_ms || 0) / 86400_000)} paid day(s) saved</div>` : ''}
        </td></tr>`;
    })}</tbody></table></div>`
  : html`<div class="card empty center"><div class="empty-icon">${icon('edit', { size: 26 })}</div><h3>You have no ads yet</h3><p class="muted">Create your first ad — it takes 2 minutes.</p><a class="btn btn-accent" href="/client/ads/new">Post an ad</a></div>`}`;
}

function adFormView(req, { ad = {}, cats, error }) {
  const isEdit = Boolean(ad.id);
  const images = isEdit ? parseImages(ad) : [];
  const priceR = ad.price_paise ? ad.price_paise / 100 : (ad.price || '');
  return html`
  <section class="card form-card">
    <h1>${isEdit ? 'Edit ad' : 'Post a new ad'}</h1>
    ${!isEdit ? html`<p class="muted">Step 1 of 2 — describe what you're selling. Next you choose: post it free, or pay to be shown first.</p>` : ''}
    <p class="small muted">${icon('shield', { size: 14 })} Your ad is your own responsibility. Not allowed: sexual or adult services of any kind, escort or "companion" services, illegal goods, fake offers. Such ads are removed and the account is blocked. <a href="/terms#ads" target="_blank">Posting rules</a></p>
    ${!isEdit && W.balance(req.seller.id) > 0 ? html`<div class="flash flash-success">${icon('card', { size: 18 })}<span>You have <strong>${rupees(W.balance(req.seller.id))}</strong> balance waiting. Use it to run this ad on the next screen.</span></div>` : ''}
    ${isEdit && ad.status === 'active' ? html`<p class="muted small">Your ad stays live while you edit. You can change the text, photos and videos any time.</p>` : ''}
    ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
    <form method="post" enctype="multipart/form-data" action="${isEdit ? `/client/ads/${ad.id}/edit` : '/client/ads/new'}" class="form">
      ${csrf(req)}
      <div class="row2">
        ${field('What are you offering? *', html`<select name="kind" required><option value="product" ${ad.kind !== 'service' ? 'selected' : ''}>A product</option><option value="service" ${ad.kind === 'service' ? 'selected' : ''}>A service</option></select>`)}
        ${field('Category *', categorySelect(cats, ad.category_id), 'Choose the main category, then the exact sub-category')}
      </div>
      ${field('Title *', html`<input name="title" required minlength="5" maxlength="90" value="${ad.title}" placeholder="e.g. iPhone 13, 128GB, excellent condition">`)}
      ${field('Description *', html`<textarea name="description" required minlength="20" maxlength="4000" rows="6" placeholder="Condition, features, what's included, timings for services…">${ad.description}</textarea>`)}
      <div class="row2">
        ${field('Price (₹)', html`<input name="price" type="number" min="0" max="1000000000" step="1" value="${priceR}">`, 'Leave empty for "Price on request"')}
        ${field('Price note', html`<input name="price_note" maxlength="40" value="${ad.price_note}" placeholder="e.g. Negotiable, per hour, per month">`)}
      </div>
      <div class="row2">
        ${field('City *', html`<input name="city" required list="cities" maxlength="60" value="${ad.city || req.seller.city}">`)}${cityDatalist()}
        ${field('Area / locality', html`<input name="locality" maxlength="80" value="${ad.locality}">`)}
      </div>
      <div class="row2">
        ${field('Contact phone *', html`<input name="contact_phone" required inputmode="numeric" maxlength="13" value="${ad.contact_phone || req.seller.phone}">`)}
        ${field('WhatsApp number', html`<input name="whatsapp" inputmode="numeric" maxlength="13" value="${ad.whatsapp ?? req.seller.phone}">`)}
      </div>
      ${images.length ? html`<div class="field"><span class="label">Current photos (tick to remove)</span><div class="img-edit">${images.map((f) => html`<label><img src="${imgUrl(f)}" alt=""><input type="checkbox" name="remove_images[]" value="${f}"> Remove</label>`)}</div></div>` : ''}
      ${field(`Photos (up to ${MAX_IMAGES})`, html`<input type="file" name="images[]" accept="image/jpeg,image/png,image/webp" multiple data-max-files="${MAX_IMAGES - images.length}">`, `JPG, PNG or WEBP, max 5 MB each. The first photo is the cover.${isEdit ? '' : ' You can add up to 2 videos (1 minute each) on the next screens — go to My ads → Edit.'}`)}
      <div class="form-actions">
        <button class="btn btn-accent btn-lg">${isEdit ? 'Save changes' : 'Continue to payment →'}</button>
        <a class="btn btn-ghost" href="/client">Cancel</a>
      </div>
    </form>
    ${isEdit ? videosSection(req, ad) : ''}
    ${isEdit && ad.status !== 'blocked' ? (() => { const v = W.unusedValue(ad); return html`<form method="post" action="/client/ads/${ad.id}/delete" class="danger-zone" data-confirm="${v ? `Delete this ad? ${rupees(v)} for the unused days goes to your balance for your next ad.` : 'Delete this ad permanently?'}">${csrf(req)}<button class="btn btn-danger btn-sm">${icon('trash', { size: 15 })} Delete ad</button>${v ? html` <span class="small muted">The unused days (${rupees(v)}) are kept as balance.</span>` : ''}</form>`; })() : ''}
  </section>`;
}

// <select> with main categories as groups and their sub-categories as options.
// A main category without sub-categories is selectable itself.
function categorySelect(cats, selected) {
  const sel = (id) => (Number(selected) === id ? 'selected' : '');
  return html`<select name="category_id" required>
    <option value="">Select category</option>
    ${cats.map((m) => (m.subs.length
    ? html`<optgroup label="${m.name}">${m.subs.map((sc) => html`<option value="${sc.id}" ${sel(sc.id)}>${sc.name}</option>`)}</optgroup>`
    : html`<option value="${m.id}" ${sel(m.id)}>${m.name}</option>`))}
  </select>`;
}

function videosSection(req, ad) {
  const videos = parseVideos(ad);
  return html`
  <section class="videos-edit" id="videos">
    <h2>Videos <small class="muted">(${videos.length}/${MAX_VIDEOS}, max 1 minute each)</small></h2>
    ${videos.length ? html`<div class="videos">${videos.map((v) => html`
      <div class="video-item">
        <video controls playsinline preload="metadata" src="/media/ads/${v.file}"></video>
        <form method="post" action="/client/ads/${ad.id}/videos/delete" data-confirm="Remove this video?">${csrf(req)}<input type="hidden" name="file" value="${v.file}"><button class="btn btn-ghost btn-sm">Remove (${v.seconds}s)</button></form>
      </div>`)}</div>` : html`<p class="muted small">No videos yet. A short video helps buyers trust your ad.</p>`}
    ${videos.length < MAX_VIDEOS ? html`
      <form method="post" action="/client/ads/${ad.id}/videos" enctype="multipart/form-data" class="form" data-video-form>
        ${csrf(req)}
        ${field('Add a video', html`<input type="file" name="video" accept="video/mp4,video/quicktime,.mp4,.mov" required data-video-input>`, 'MP4 or MOV from your phone, up to 1 minute and 90 MB. Tip: record in 720p.')}
        <p class="hint" data-video-msg></p>
        <button class="btn">Upload video</button>
      </form>` : ''}
  </section>`;
}

function freeCard(req, ad, free) {
  if (!free.cfg.enabled || ad.is_free || !['awaiting_payment', 'expired'].includes(ad.status)) return '';
  return html`<div class="freecard">
    <div><h2>${icon('tag', { size: 18 })} Post it free</h2>
      <p class="muted small">Your ad runs <strong>${free.cfg.days} days</strong> free. Free ads are shown <strong>after all paid ads</strong>, in random order, and never in TOP — there is no guarantee of a high place.
      ${free.cfg.review ? 'We check free ads before they go live.' : ''} You can upgrade to a paid plan any time.</p>
      ${free.why ? html`<p class="small bad">${free.why}</p>` : ''}</div>
    ${free.why ? '' : html`<form method="post" action="/client/ads/${ad.id}/free">${csrf(req)}
      <label class="check small"><input type="checkbox" name="accept_terms" value="1" required> <span>I accept the <a href="/terms" target="_blank">Terms of use</a>. My ad is my own responsibility.</span></label>
      <button class="btn btn-lg">Post free</button></form>`}
  </div>
  <div class="or"><span>or pay to be seen first</span></div>`;
}

function payView(req, { ad, plans, pending, settings, wallet = 0, free = null }) {
  const extending = ad.status === 'active' && !ad.is_free;
  const upiLink = settings.upi_id ? `upi://pay?${new URLSearchParams({ pa: settings.upi_id, pn: settings.upi_payee_name || settings.site_name, cu: 'INR', tn: `Ad #${ad.id}` })}` : '';
  return html`
  <section class="card form-card">
    <h1>${extending ? 'Extend or boost your ad' : ad.is_free && ad.status === 'active' ? 'Upgrade your free ad' : ad.status === 'expired' ? 'Renew your ad' : 'Publish your ad'}</h1>
    <p class="muted">Ad: <a href="${adUrl(ad)}"><strong>${ad.title}</strong></a> ${pill(ad.status)}
      ${extending ? html`<br>Currently live until <strong>${fmtDate(ad.expires_at)}</strong>. New days are added on top.` : ''}
      ${ad.is_free && ad.status === 'active' ? html`<br>Free until <strong>${fmtDate(ad.expires_at)}</strong>. A paid plan moves it above every free ad and starts today.` : ''}</p>
    ${free ? freeCard(req, ad, free) : ''}

    ${pending ? html`<div class="flash flash-info">We received your UPI payment reference <strong>${pending.utr}</strong> for ${rupees(pending.amount_paise)} on ${fmtDate(pending.created_at)}. Payment confirmation takes <strong>${PAYMENT_TIME_TEXT}</strong>; your ad goes live as soon as it is confirmed.</div>` : ''}

    <form method="post" action="/client/ads/${ad.id}/pay/upi" enctype="multipart/form-data" class="form" data-pay-form data-ad-id="${ad.id}" data-rzp="${P.razorpayEnabled() ? '1' : ''}">
      ${csrf(req)}
      <fieldset><legend>1 · How long should your ad run?</legend>
        <div class="plans">
          ${plans.map((p) => {
            const price = P.quote(p, 0);
            const def = plans.find((x) => x.days === 29) || plans[plans.length - 1];
            return html`
            <label class="plan">
              <input type="radio" name="plan_id" value="${p.id}" ${p.id === def.id ? 'checked' : ''} data-price="${p.price_paise}" data-days="${p.days}" data-discount="${p.discount_pct || 0}" required>
              <span class="plan-box">
                ${p.discount_pct ? html`<span class="plan-flag">Save ${p.discount_pct}%</span>` : p.days === 29 ? html`<span class="plan-flag">Popular</span>` : ''}
                <span class="plan-days">${p.label || (p.days === 1 ? '1 day' : `${p.days} days`)}</span>
                <span class="plan-name">${p.name}</span>
                <span class="plan-price">${p.discount_pct ? html`<s class="muted small">${rupees(p.price_paise)}</s> ` : ''}${rupees(price)}</span>
                <span class="plan-per muted small">${rupees(Math.round(price / p.days))}/day · higher price = higher place</span>
              </span>
            </label>`;
          })}
        </div>
        <div class="top-addon">
          <strong>★ Show in TOP ads (optional)</strong>
          <p class="small muted">Pick the time slots (India time) when your ad should appear at the very top. Price is per day, for every day of your plan.${extending && ad.top_slots ? html` Your current TOP slots: <strong>${slotLabels(ad.top_slots).join(', ')}</strong>.` : ''}</p>
          <div class="slots">
            ${slotPrices().filter((sl) => sl.is_active).map((sl) => html`
              <label class="slot"><input type="checkbox" name="top_slots[]" value="${sl.slot}" data-slot-price="${sl.price_per_day_paise}">
                <span><b>${sl.label}</b><small>${rupees(sl.price_per_day_paise)}/day</small></span></label>`)}
          </div>
          <div class="small muted" data-top-summary></div>
        </div>
        <div class="total">Total: <strong data-total>—</strong><div class="small muted" data-discount-note></div></div>
        ${wallet > 0 ? html`<label class="walletbox"><input type="checkbox" name="use_wallet" value="1" checked data-wallet="${wallet}">
          <span>${icon('card', { size: 18 })} Use my balance <strong>${rupees(wallet)}</strong><small class="muted" data-wallet-note></small></span></label>` : ''}
      </fieldset>

      <fieldset><legend>2 · Pay</legend>
        <div class="terms-box">
          <strong>${icon('shield', { size: 16 })} Before you pay</strong>
          <ul>
            <li>Payments for ad placement are <strong>non-refundable</strong> once your ad is live.</li>
            <li>You are responsible for paying the <strong>exact total</strong> to the <strong>UPI ID shown here</strong> and entering the <strong>correct UTR</strong>. Payments sent to a wrong UPI ID, a wrong amount or with a wrong UTR are your own responsibility.</li>
            <li>Failed, pending or delayed payments are handled by your bank, UPI app or payment gateway. If money leaves your account but the payment fails, your bank returns it — ${req.settings.site_name} does not hold that money.</li>
            <li>Payment confirmation takes ${PAYMENT_TIME_TEXT}.</li>
          </ul>
          <label class="check"><input type="checkbox" name="accept_terms" value="1" required> <span>I have read and accept the <a href="/terms#payments" target="_blank">payment terms</a> and the <a href="/refund-policy" target="_blank">refund policy</a>.</span></label>
        </div>
        ${P.razorpayEnabled() ? html`
          <button type="button" class="btn btn-accent btn-lg btn-block" data-rzp-pay>Pay online (UPI / Card / Netbanking) — goes live instantly</button>
          <div class="or"><span>or pay by UPI manually</span></div>` : ''}
        <div class="walletpay" data-wallet-only hidden>
          <p><strong>${icon('check', { size: 18 })} Your balance covers the full amount.</strong> Your ad goes live straight away — no UPI payment needed.</p>
          <button class="btn btn-ok btn-lg" name="pay_with" value="wallet">Pay from my balance & go live</button>
        </div>
        <div data-upi-part>
        <div class="upi-box">
          ${settings.upi_qr_file ? html`<img class="upi-qr" src="${imgUrl(settings.upi_qr_file)}" alt="UPI QR code">` : ''}
          <div>
            ${settings.upi_id ? html`<p>Pay <strong data-upi-amount>the total</strong> to UPI ID <strong class="mono">${settings.upi_id}</strong>${settings.upi_payee_name ? html` (${settings.upi_payee_name})` : ''}</p>
              <a class="btn btn-sm only-mobile" href="${upiLink}" data-upi-link>Open UPI app</a>`
            : html`<p class="muted">UPI details are not configured yet. Please contact support.</p>`}
            <p class="small muted">After paying, enter the 12-digit UTR / transaction ID from your UPI app. Payment confirmation takes <strong>${PAYMENT_TIME_TEXT}</strong> — your ad goes live as soon as it is confirmed.</p>
          </div>
        </div>
        <div class="row2">
          ${field('UPI transaction ID / UTR *', html`<input name="utr" required minlength="6" maxlength="30" pattern="[A-Za-z0-9]{6,30}" placeholder="e.g. 412345678901">`)}
          ${field('Payment screenshot', html`<input type="file" name="screenshot" accept="image/*">`, 'Optional, helps faster confirmation')}
        </div>
        <button class="btn btn-lg ${P.razorpayEnabled() ? '' : 'btn-accent'}" name="pay_with" value="upi">I have paid — submit for confirmation</button>
        </div>
      </fieldset>
    </form>
  </section>`;
}

function paymentsView(req, rows) {
  return html`
  <div class="page-head"><h1>Payments</h1></div>
  ${rows.length ? html`<div class="table-wrap card"><table class="table">
    <thead><tr><th>#</th><th>Date</th><th>Ad</th><th>Plan</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((p) => html`<tr>
      <td>${p.id}</td><td>${fmtDate(p.created_at)}</td><td>${p.ad_title}</td>
      <td>${p.days} days${p.top_slots ? html`<div class="small muted">TOP: ${slotLabels(p.top_slots).join(', ')}</div>` : ''}</td><td>${rupees(p.amount_paise)}</td>
      <td>${p.method === 'razorpay' ? 'Online' : `UPI ${p.utr || ''}`}</td>
      <td>${pill(p.status)}${p.admin_note && (p.status === 'rejected' || p.status === 'failed') ? html`<div class="small muted">${p.admin_note}</div>` : ''}</td>
      <td>${p.status === 'paid' ? html`<a class="btn btn-sm" href="/client/payments/${p.id}/receipt">${icon('receipt', { size: 15 })} Receipt</a>` : p.status === 'rejected' || p.status === 'failed' ? html`<a class="btn btn-sm btn-primary" href="/client/ads/${p.ad_id}/pay">Pay again</a>` : ''}</td></tr>`)}
    </tbody></table></div>` : html`<div class="card empty center"><p class="muted">No payments yet.</p></div>`}`;
}

function postChoiceView(req) {
  return html`
  <div class="choice">
    <section class="card choice-card">
      <span class="choice-ic">${icon('user', { size: 26 })}</span>
      <h2>I already sell here</h2>
      <p class="muted">Log in and post your ad straight away.</p>
      <form method="post" action="/client/login" class="form">
        ${csrf(req)}<input type="hidden" name="next" value="/client/ads/new">
        ${field('Email', html`<input name="email" type="email" required autocomplete="username">`)}
        ${field('Password', html`<input name="password" type="password" required autocomplete="current-password">`)}
        <button class="btn btn-primary btn-lg btn-block">${icon('logout', { size: 18 })} Log in & post</button>
      </form>
    </section>
    <section class="card choice-card choice-new">
      <span class="choice-ic">${icon('plus', { size: 26 })}</span>
      <h2>I'm new here</h2>
      <p class="muted">Create your free seller account in about 3 minutes. Login check takes ${approveTimeText(req.settings.auto_approve_minutes)}.</p>
      <ul class="kyc-points dark">
        <li>${icon('check', { size: 18 })}<span>Name, mobile and email</span></li>
        <li>${icon('check', { size: 18 })}<span>One ID and a live photo</span></li>
        <li>${icon('check', { size: 18 })}<span>Plans from 1 day to 1 year</span></li>
      </ul>
      <a class="btn btn-sell btn-lg btn-block" href="/client/register">Create my account</a>
    </section>
  </div>`;
}

function loginView(req, error, email = '') {
  return html`
  <section class="card narrow">
    <h1>Seller login</h1>
    ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
    <form method="post" action="/client/login" class="form">
      ${csrf(req)}
      ${field('Email', html`<input name="email" type="email" required value="${email}" autocomplete="username">`)}
      ${field('Password', html`<input name="password" type="password" required autocomplete="current-password">`)}
      <button class="btn btn-accent btn-block">Log in</button>
    </form>
    <p class="muted small center">New seller? <a href="/client/register">Register & get verified</a></p>
  </section>`;
}

// ---------- helpers ----------
function readAdForm(req) {
  const b = req.body;
  const priceRaw = String(b.price ?? '').trim();
  const ad = {
    kind: b.kind === 'service' ? 'service' : 'product',
    category_id: parseInt(b.category_id, 10) || 0,
    title: V.str(b.title, 90), description: V.str(b.description, 4000),
    price: priceRaw, price_paise: priceRaw === '' ? null : Math.round(Number(priceRaw) * 100),
    price_note: V.str(b.price_note, 40), city: V.str(b.city, 60), locality: V.str(b.locality, 80),
    contact_phone: V.normalizePhone(b.contact_phone), whatsapp: b.whatsapp ? V.normalizePhone(b.whatsapp) : '',
  };
  let error = null;
  const catErr = Cat.checkForAd(ad.category_id);
  if (catErr) error = catErr;
  else if (ad.title.length < 5) error = 'Title must be at least 5 characters.';
  else if (ad.description.length < 20) error = 'Description must be at least 20 characters.';
  else if (ad.price_paise != null && (!Number.isFinite(ad.price_paise) || ad.price_paise < 0)) error = 'Price must be a valid amount.';
  else if (!ad.city) error = 'City is required.';
  else if (!V.isValidPhone(ad.contact_phone)) error = 'Enter a valid 10-digit contact phone number.';
  else if (ad.whatsapp && !V.isValidPhone(ad.whatsapp)) error = 'Enter a valid 10-digit WhatsApp number.';
  else if (V.bannedAdText(ad.title, ad.description, ad.price_note)) error = `This ad cannot be posted: "${V.bannedAdText(ad.title, ad.description, ad.price_note)}" is not allowed. Sexual or adult services of any kind are not allowed on this site (see Terms, section 3).`;
  return { ad, error };
}

function saveImages(req, existing = []) {
  const files = (req.files.images || []).slice(0, MAX_IMAGES);
  if (existing.length + files.length > MAX_IMAGES) throw new UploadError(`You can add up to ${MAX_IMAGES} photos.`);
  const saved = [];
  try {
    for (const f of files) saved.push(saveUpload(f, 'ads', { maxMb: 5 }));
  } catch (e) { saved.forEach((n) => removeFile('ads', n)); throw e; }
  return saved;
}

// ---------- routes ----------
function register(app) {
  // Registration with KYC
  app.get('/client/register', (req, res) => {
    if (req.seller) { res.redirect('/client'); return; }
    res.html(renderPage(req, { title: 'Register as seller', body: registerView(req), scripts: ['/public/js/camera.js'] }));
  });

  app.post('/client/register', (req, res) => {
    const b = req.body;
    const v = {
      name: V.str(b.name, 80), business_name: V.str(b.business_name, 80), email: V.str(b.email, 120).toLowerCase(),
      phone: V.normalizePhone(b.phone), dob: V.str(b.dob, 10),
      id_type: V.str(b.id_type, 10), id_number: V.str(b.id_number, 20).toUpperCase(),
      address: V.str(b.address, 300), city: V.str(b.city, 60), state: V.str(b.state, 60), pincode: V.str(b.pincode, 6),
    };
    const fail = (msg) => res.status(400).html(renderPage(req, { title: 'Register as seller', body: registerView(req, v, msg), scripts: ['/public/js/camera.js'] }));

    if (!rateLimit(`register:${req.ip}`, 10, 3600_000)) return fail('Too many attempts. Please try again later.');
    if (v.name.length < 3) return fail('Please enter your full name.');
    const dobErr = V.checkDob(v.dob); if (dobErr) return fail(dobErr);
    if (!b.adult) return fail('Please confirm that you are 18 years or older.');
    if (!V.isValidPhone(v.phone)) return fail('Enter a valid 10-digit Indian mobile number.');
    if (!V.isValidEmail(v.email)) return fail('Enter a valid email address.');
    const pwErr = V.validatePassword(b.password); if (pwErr) return fail(pwErr);
    if (b.password !== b.password2) return fail('Passwords do not match.');
    const id = checkId(v.id_type, v.id_number); if (id.error) return fail(id.error);
    if (!req.files.id_file?.[0]) return fail('Please upload a photo of your ID document.');
    if (v.pincode && !V.isValidPincode(v.pincode)) return fail('The PIN code should be 6 digits (or leave it empty).');
    if (!b.live_photo_data) return fail('Please capture your live photo using the camera.');
    if (!b.consent) return fail('Please accept the declaration to continue.');
    if (db.prepare('SELECT 1 FROM clients WHERE email = ?').get(v.email)) return fail('An account with this email already exists. Please log in.');
    // A blocked seller cannot come back with a new account: same mobile, or same PAN / passport number.
    const blockedMatch = db.prepare("SELECT 1 FROM clients WHERE status = 'suspended' AND (phone = ? OR (id_type IN ('pan','passport') AND id_type = ? AND id_number = ?)) LIMIT 1").get(V.normalizePhone(v.phone), v.id_type, id.stored);
    if (blockedMatch) return fail('This mobile number or ID belongs to an account that was blocked. Please contact support.');

    const saved = [];
    try {
      const up = (k, opts) => { const n = saveUpload(req.files[k]?.[0], 'kyc', opts); if (n) saved.push(n); return n; };
      const idFile = up('id_file', { allowPdf: true });
      const idBack = up('id_back_file', { allowPdf: true });
      const live = saveDataUrl(b.live_photo_data, 'kyc'); saved.push(live);
      const now = Date.now();
      const token = randomToken(24);
      const newId = tx(() => {
        const r = db.prepare(`INSERT INTO clients (name, business_name, email, phone, password_hash, address, city, state, pincode,
          aadhaar_last4, pan_number, id_type, id_number, id_file, id_back_file, live_photo_file,
          status, status_token, created_at, dob) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'unverified', ?, ?, ?)`)
          .run(v.name, v.business_name, v.email, v.phone, hashPassword(b.password), v.address, v.city, v.state, v.pincode,
            id.last4, id.pan, v.id_type, id.stored, idFile, idBack, live, token, now, v.dob);
        db.prepare("INSERT INTO kyc_snapshots (client_id, file, source, created_at) VALUES (?, ?, 'selfie', ?)").run(r.lastInsertRowid, live, now);
        db.prepare('UPDATE clients SET terms_accepted_at = ?, terms_version = ? WHERE id = ?').run(now, TERMS_VERSION, r.lastInsertRowid);
        return Number(r.lastInsertRowid);
      });
      // One-time verification: send the email code (and SMS code if SMS is set up).
      const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(newId);
      notify.sendEmailOtp(created).catch((e) => console.error('[otp email]', e.message));
      if (notify.phoneOtpRequired()) notify.sendPhoneOtp(created).catch((e) => console.error('[otp sms]', e.message));
      res.redirect(`/kyc/verify/${token}`);
    } catch (e) {
      saved.forEach((n) => removeFile('kyc', n));
      if (e instanceof UploadError) return fail(e.message);
      throw e;
    }
  });

  // ---- One-time email + SMS verification (OTP) ----
  app.get('/kyc/verify/:token', (req, res) => {
    const c = clientByToken(req.params.token);
    if (!c) { res.redirect('/'); return; }
    if (c.status !== 'unverified') { res.redirect(`/kyc/status/${c.status_token}`); return; }
    res.html(renderPage(req, { title: 'Verify email & phone', body: verifyView(req, c) }));
  });
  app.post('/kyc/verify/:token', (req, res) => {
    const c = clientByToken(req.params.token);
    if (!c) { res.redirect('/'); return; }
    const back = `/kyc/verify/${c.status_token}`;
    if (!rateLimit(`otp:${c.id}:${req.ip}`, 20, 15 * 60_000)) { req.flash('error', 'Too many attempts. Please wait 15 minutes.'); res.redirect(back); return; }
    const channel = req.body.channel === 'sms' ? 'sms' : 'email';
    const col = channel === 'sms' ? 'phone_verified_at' : 'email_verified_at';
    if (c[col]) { res.redirect(back); return; }
    const r = notify.checkOtp(c.id, channel, req.body.code);
    const what = channel === 'sms' ? 'mobile' : 'email';
    if (r === 'ok') {
      db.prepare(`UPDATE clients SET ${col} = ? WHERE id = ?`).run(Date.now(), c.id);
      if (channel === 'email') notify.emailConfirmed(c);
      req.flash('success', `Your ${what} is verified ✔`);
      const after = notify.maybeSubmit(c.id);
      res.redirect(after && after.status !== 'unverified' ? `/kyc/status/${c.status_token}` : back);
      return;
    }
    req.flash('error', {
      wrong: `That ${what} code is not correct. Please check and try again.`,
      expired: `The ${what} code has expired. Tap "Send a new code".`,
      too_many: `Too many wrong tries. Tap "Send a new code".`,
    }[r]);
    res.redirect(back);
  });
  app.post('/kyc/verify/:token/resend', async (req, res) => {
    const c = clientByToken(req.params.token);
    if (!c) { res.redirect('/'); return; }
    const back = `/kyc/verify/${c.status_token}`;
    const channel = req.body.channel === 'sms' ? 'sms' : 'email';
    const r = channel === 'sms' ? await notify.sendPhoneOtp(c) : await notify.sendEmailOtp(c);
    if (r.error === 'wait') req.flash('info', `Please wait ${r.waitSeconds} seconds before asking for a new code.`);
    else if (r.error === 'limit') req.flash('error', 'Too many codes requested. Please try again in an hour.');
    else if (r.status === 'failed') req.flash('error', `We could not send the ${channel === 'sms' ? 'SMS' : 'email'} right now. Please try again in a minute.`);
    else req.flash('success', channel === 'sms' ? `A new code was sent by SMS to ${c.phone}.` : `A new code was sent to ${c.email}.`);
    res.redirect(back);
  });

  app.get('/kyc/status/:token', (req, res) => {
    const c = clientByToken(req.params.token);
    if (c && c.status === 'unverified') { res.redirect(`/kyc/verify/${c.status_token}`); return; }
    if (!c) { res.status(404).html(renderPage(req, { title: 'Not found', body: html`<section class="card narrow center"><h1>Link not valid</h1><p class="muted">Please check the link or register again.</p></section>` })); return; }
    res.html(renderPage(req, { title: 'Verification status', body: statusView(req, c) }));
  });

  // Client side of the KYC video call (no login needed — secret link)
  app.get('/kyc/call/:token', (req, res) => {
    const c = clientByToken(req.params.token);
    if (!rtc.callAllowed(c)) { res.redirect(c ? `/kyc/status/${c.status_token}` : '/'); return; }
    res.html(renderPage(req, {
      title: 'Video verification',
      body: callView(req, c, { role: 'client', eventsUrl: `/rtc/c/${c.status_token}/events`, signalUrl: `/rtc/c/${c.status_token}/signal` }),
      scripts: ['/public/js/rtc-call.js'],
    }));
  });
  app.get('/rtc/c/:token/events', (req, res) => {
    const c = clientByToken(req.params.token);
    if (!rtc.callAllowed(c)) { res.status(403).send('Forbidden'); return; }
    rtc.openStream(req, res, `kyc-${c.id}`, 'client');
  });
  app.post('/rtc/c/:token/signal', (req, res) => {
    const c = clientByToken(req.params.token);
    if (!rtc.callAllowed(c)) { res.status(403).json({ ok: false }); return; }
    res.json({ ok: rtc.relay(`kyc-${c.id}`, 'client', req.body) });
  });

  // Is the admin calling this seller right now? Polled by the seller's pages (logged in, or the status link).
  const ringInfo = (c) => (rtc.ringActive(c) && rtc.callAllowed(c)
    ? { ringing: true, at: c.call_ring_at, live: rtc.adminInRoom(c.id), url: `/kyc/call/${c.status_token}`, from: req0name() }
    : { ringing: false });
  const req0name = () => getSettings().site_name;
  // Live updates for the seller portal: new messages (payment confirmed / rejected …) show up without refreshing.
  app.get('/client/live', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.seller) { res.json({ ok: false }); return; }
    const last = db.prepare('SELECT id, title, tone FROM inbox WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(req.seller.id);
    res.json({ ok: true, unread: notify.unreadCount(req.seller.id), lastId: last ? last.id : 0, lastTitle: last ? last.title : '', lastTone: last ? last.tone : '' });
  });
  app.get('/client/ring', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.seller) { res.json({ ringing: false }); return; }
    res.json(ringInfo(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.seller.id)));
  });
  app.get('/kyc/ring/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(ringInfo(clientByToken(req.params.token)));
  });

  // Login / logout
  app.get('/client/login', (req, res) => {
    if (req.seller) { res.redirect('/client'); return; }
    res.html(renderPage(req, { title: 'Seller login', body: loginView(req) }));
  });
  // "Post ad" button: new sellers register, existing sellers log in right here.
  app.get('/post', (req, res) => {
    if (req.seller) { res.redirect('/client/ads/new'); return; }
    res.html(renderPage(req, { title: 'Post your ad', body: postChoiceView(req) }));
  });
  app.post('/client/login', (req, res) => {
    const email = V.str(req.body.email, 120).toLowerCase();
    const fail = (msg) => res.status(401).html(renderPage(req, { title: 'Seller login', body: loginView(req, msg, email) }));
    if (!rateLimit(`clogin:${req.ip}:${email}`, 8, 15 * 60_000)) return fail('Too many attempts. Please wait 15 minutes.');
    const c = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
    if (!c || !verifyPassword(req.body.password, c.password_hash)) return fail('Incorrect email or password.');
    if (c.status === 'deactivated' && c.deactivated_by === 'client') {
      // The client deactivated their own account: offer to reactivate it.
      req.session.reactivateId = c.id;
      res.redirect('/client/reactivate');
      return;
    }
    if (c.status !== 'approved') {
      req.flash('info', c.status === 'deactivated' || c.status === 'suspended'
        ? 'Your account is not active. Please contact support.'
        : 'Your account is not active yet — see your verification status below.');
      res.redirect(`/kyc/status/${c.status_token}`);
      return;
    }
    const nextUrl = String(req.body.next || '');
    const returnTo = nextUrl.startsWith('/client/') ? nextUrl : req.session.returnTo;
    req.regenerateSession();
    req.session.clientId = c.id;
    db.prepare('UPDATE clients SET last_login_at = ? WHERE id = ?').run(Date.now(), c.id);
    res.redirect(returnTo && returnTo.startsWith('/client') ? returnTo : '/client');
  });
  app.post('/client/logout', (req, res) => { delete req.session.clientId; req.regenerateSession(); res.redirect('/'); });

  // ---- Reactivate an account the client deactivated themselves ----
  app.get('/client/reactivate', (req, res) => {
    const c = req.session.reactivateId && db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.reactivateId);
    if (!c || c.status !== 'deactivated' || c.deactivated_by !== 'client') { res.redirect('/client/login'); return; }
    const paused = db.prepare("SELECT COUNT(*) n FROM ads WHERE client_id = ? AND status = 'paused' AND paused_by = 'account'").get(c.id).n;
    res.html(renderPage(req, { title: 'Reactivate account', body: html`
      <section class="card narrow center">
        <div class="empty-icon">${icon('user', { size: 26 })}</div>
        <h1>Welcome back, ${c.name}</h1>
        <p>Your account is deactivated since ${fmtDate(c.deactivated_at)}.</p>
        ${paused ? html`<p>${paused} ad${paused === 1 ? '' : 's'} will go live again with the paid days that were left.</p>` : ''}
        <form method="post" action="/client/reactivate">${csrf(req)}<button class="btn btn-accent btn-lg">Reactivate my account</button></form>
        <p><a class="muted small" href="/">Not now</a></p>
      </section>` }));
  });
  app.post('/client/reactivate', (req, res) => {
    const id = req.session.reactivateId;
    const c = id && db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!c || c.status !== 'deactivated' || c.deactivated_by !== 'client') { res.redirect('/client/login'); return; }
    const r = life.reactivateClient(c.id);
    notify.reactivated(c);
    req.regenerateSession();
    req.session.clientId = c.id;
    req.flash('success', `Welcome back! Your account is active again${r && r.resumed ? ` and ${r.resumed} ad(s) are live` : ''}.`);
    res.redirect('/client');
  });

  // ---- Age confirmation (18+) for accounts that don't have a date of birth yet ----
  app.get('/client/age', requireClient, (req, res) => {
    if (!V.checkDob(req.seller.dob)) { res.redirect('/client'); return; }
    res.html(renderPage(req, { title: 'Confirm your age', portal: 'client', body: html`
      <section class="card narrow">
        <h1>Confirm your age</h1>
        <p class="muted">Only people aged <strong>18 or older</strong> can post ads. Please enter your date of birth as on your ID (Aadhaar, PAN or Passport) — we ask this only once.</p>
        <form method="post" action="/client/age" class="form">
          ${csrf(req)}
          ${field('Date of birth', html`<input type="date" name="dob" required max="${V.maxDob()}" min="1925-01-01">`)}
          <label class="check"><input type="checkbox" name="adult" value="1" required> <span>I confirm that I am 18 years or older.</span></label>
          <button class="btn btn-accent">Continue</button>
        </form>
      </section>` }));
  });
  app.post('/client/age', requireClient, (req, res) => {
    const dob = V.str(req.body.dob, 10);
    const err = V.checkDob(dob) || (req.body.adult ? null : 'Please tick the box to confirm you are 18 or older.');
    if (err) { req.flash('error', err); res.redirect('/client/age'); return; }
    db.prepare('UPDATE clients SET dob = ? WHERE id = ?').run(dob, req.seller.id);
    const to = req.session.returnTo; delete req.session.returnTo;
    req.flash('success', 'Thank you — age confirmed.');
    res.redirect(to && to.startsWith('/client/') ? to : '/client/ads/new');
  });

  // ---- Client deactivates their own account ----
  app.post('/client/account/deactivate', requireClient, (req, res) => {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.seller.id);
    if (!verifyPassword(req.body.password, c.password_hash)) { req.flash('error', 'Password is incorrect — account NOT deactivated.'); res.redirect('/client/account'); return; }
    const r = life.deactivateClient(c.id, 'client');
    notify.deactivated(c, 'client');
    delete req.session.clientId;
    req.regenerateSession();
    req.flash('success', `Your account is deactivated${r && r.paused ? ` and ${r.paused} live ad(s) are hidden — their remaining paid days are saved` : ''}. Log in any time to reactivate.`);
    res.redirect('/');
  });

  // Dashboard
  app.get('/client', requireClient, (req, res) => {
    const ads = db.prepare(`SELECT a.*, p.name AS plan_name FROM ads a LEFT JOIN plans p ON p.id = a.plan_id
      WHERE a.client_id = ? AND a.status != 'deleted' ORDER BY CASE a.status WHEN 'active' THEN 0 WHEN 'payment_review' THEN 1 WHEN 'free_review' THEN 1 WHEN 'awaiting_payment' THEN 2 ELSE 3 END, a.updated_at DESC`).all(req.seller.id);
    const stats = {
      live: ads.filter((a) => a.status === 'active').length,
      waiting: ads.filter((a) => ['awaiting_payment', 'payment_review', 'free_review'].includes(a.status)).length,
      views: ads.reduce((s, a) => s + a.views, 0),
      spent: db.prepare("SELECT COALESCE(SUM(amount_paise),0) AS s FROM payments WHERE client_id = ? AND status = 'paid'").get(req.seller.id).s,
    };
    // Unread warnings (payment rejected / failed, ad removed …) are shown on top of the dashboard.
    const alerts = db.prepare("SELECT * FROM inbox WHERE client_id = ? AND read_at IS NULL AND tone IN ('error','warn') ORDER BY id DESC LIMIT 3").all(req.seller.id);
    res.html(renderPage(req, { title: 'My ads', portal: 'client', body: dashboardView(req, ads, stats, alerts) }));
  });

  // Create / edit ads (no admin approval needed — only payment)
  const cats = () => Cat.tree();

  app.get('/client/ads/new', requireClient, requireAdult, (req, res) => {
    res.html(renderPage(req, { title: 'Post ad', portal: 'client', body: adFormView(req, { cats: cats() }) }));
  });
  app.post('/client/ads/new', requireClient, requireAdult, (req, res) => {
    const { ad, error } = readAdForm(req);
    const fail = (msg) => res.status(400).html(renderPage(req, { title: 'Post ad', portal: 'client', body: adFormView(req, { ad, cats: cats(), error: msg }) }));
    if (error) return fail(error);
    let images;
    try { images = saveImages(req); } catch (e) { if (e instanceof UploadError) return fail(e.message); throw e; }
    const now = Date.now();
    const r = db.prepare(`INSERT INTO ads (client_id, category_id, kind, title, description, price_paise, price_note, city, locality,
      contact_phone, whatsapp, images, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'awaiting_payment', ?, ?)`)
      .run(req.seller.id, ad.category_id, ad.kind, ad.title, ad.description, ad.price_paise, ad.price_note, ad.city, ad.locality,
        ad.contact_phone, ad.whatsapp, JSON.stringify(images), now, now);
    req.flash('success', Free.config().enabled ? 'Ad saved. Post it free, or choose a paid plan to be shown first.' : 'Ad saved. Choose a plan to publish it.');
    res.redirect(`/client/ads/${r.lastInsertRowid}/pay`);
  });

  app.get('/client/ads/:id/edit', requireClient, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    res.html(renderPage(req, { title: 'Edit ad', portal: 'client', body: adFormView(req, { ad, cats: cats() }) }));
  });
  app.post('/client/ads/:id/edit', requireClient, (req, res) => {
    const current = ownAd(req, res); if (!current) return;
    if (current.status === 'blocked') { req.flash('error', 'This ad was blocked by the admin and cannot be edited.'); res.redirect('/client'); return; }
    const { ad, error } = readAdForm(req);
    const merged = { ...current, ...ad, id: current.id };
    const fail = (msg) => res.status(400).html(renderPage(req, { title: 'Edit ad', portal: 'client', body: adFormView(req, { ad: merged, cats: cats(), error: msg }) }));
    if (error) return fail(error);
    const existing = parseImages(current);
    const remove = new Set([].concat(req.body.remove_images || []));
    const keep = existing.filter((f) => !remove.has(f));
    let added;
    try { added = saveImages(req, keep); } catch (e) { if (e instanceof UploadError) return fail(e.message); throw e; }
    existing.filter((f) => remove.has(f)).forEach((f) => removeFile('ads', f));
    db.prepare(`UPDATE ads SET category_id=?, kind=?, title=?, description=?, price_paise=?, price_note=?, city=?, locality=?,
      contact_phone=?, whatsapp=?, images=?, updated_at=? WHERE id=?`)
      .run(ad.category_id, ad.kind, ad.title, ad.description, ad.price_paise, ad.price_note, ad.city, ad.locality,
        ad.contact_phone, ad.whatsapp, JSON.stringify([...keep, ...added]), Date.now(), current.id);
    req.flash('success', 'Ad updated.');
    res.redirect('/client');
  });

  app.post('/client/ads/:id/delete', requireClient, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    if (ad.status === 'blocked') { req.flash('error', 'This ad was blocked by the admin. Please contact support.'); res.redirect('/client'); return; }
    // Paid days that are left are not lost: their value goes to the seller's balance for the next ad.
    const kept = tx(() => { const v = W.creditDeletedAd(ad); life.deleteAd(ad.id); return v; });
    if (kept) notify.inbox(req.seller.id, { kind: 'wallet', tone: 'success', title: `${rupees(kept)} added to your balance`, body: `The unused paid days of "${ad.title}" were kept as balance. Use it to run your next ad.`, link: '/client/ads/new', linkText: 'Post a new ad' });
    req.flash('success', kept ? `Ad deleted. ${rupees(kept)} for the unused days was added to your balance — use it on your next ad.` : 'Ad deleted.');
    res.redirect('/client');
  });

  // Ad videos: up to 2, max 1 minute each, can be changed any time.
  app.post('/client/ads/:id/videos', requireClient, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    const back = `/client/ads/${ad.id}/edit#videos`;
    if (ad.status === 'blocked') { req.flash('error', 'This ad was blocked by the admin.'); res.redirect('/client'); return; }
    const videos = parseVideos(ad);
    if (videos.length >= MAX_VIDEOS) { req.flash('error', `You can add up to ${MAX_VIDEOS} videos. Remove one first.`); res.redirect(back); return; }
    try {
      const v = saveVideo(req.files.video?.[0], { maxMb: 90, maxSeconds: 60 });
      db.prepare('UPDATE ads SET videos = ?, updated_at = ? WHERE id = ?').run(JSON.stringify([...videos, v]), Date.now(), ad.id);
      req.flash('success', `Video added (${v.seconds} seconds).`);
    } catch (e) {
      if (!(e instanceof UploadError)) throw e;
      req.flash('error', e.message);
    }
    res.redirect(back);
  });
  app.post('/client/ads/:id/videos/delete', requireClient, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    const videos = parseVideos(ad);
    const keep = videos.filter((v) => v.file !== req.body.file);
    if (keep.length !== videos.length) {
      removeFile('ads', req.body.file);
      db.prepare('UPDATE ads SET videos = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(keep), Date.now(), ad.id);
      req.flash('success', 'Video removed.');
    }
    res.redirect(`/client/ads/${ad.id}/edit#videos`);
  });

  // Payment page
  const activePlans = () => db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY sort, days').all();

  app.get('/client/ads/:id/pay', requireClient, requireAdult, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    if (ad.status === 'blocked') { req.flash('error', 'This ad was blocked by the admin.'); res.redirect('/client'); return; }
    if (ad.status === 'paused') { req.flash('error', 'This ad is deactivated by the admin. Please contact support.'); res.redirect('/client'); return; }
    const pending = db.prepare("SELECT * FROM payments WHERE ad_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(ad.id);
    res.html(renderPage(req, { title: 'Pay', portal: 'client', body: payView(req, { ad, plans: activePlans(), pending, settings: getSettings(), wallet: W.balance(req.seller.id), free: { cfg: Free.config(), why: Free.whyNot(ad) } }), scripts: P.razorpayEnabled() ? ['https://checkout.razorpay.com/v1/checkout.js', '/public/js/pay.js'] : ['/public/js/pay.js'] }));
  });

  // Publish free (no payment): shown after paid ads; may need the admin's check first.
  app.post('/client/ads/:id/free', requireClient, requireAdult, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    const back = `/client/ads/${ad.id}/pay`;
    if (req.body.accept_terms !== '1') { req.flash('error', 'Please tick the box to accept the Terms of use.'); res.redirect(back); return; }
    const why = Free.whyNot(ad);
    if (why) { req.flash('error', why); res.redirect(back); return; }
    const r = Free.publish(ad);
    if (r === 'review') {
      notify.adminAlert('free_ad', `🆓 Free ad to check: "${ad.title}" by ${req.seller.name} (#${ad.id}). Admin → Ads → Free ads to check.`);
      notify.inbox(req.seller.id, { kind: 'free_review', tone: 'info', title: `Free ad sent for checking — ${ad.title}`, body: 'We check free ads before they go live, usually within a few hours. Want it live now and above free ads? Choose a paid plan.', link: back, linkText: 'See paid plans' });
      req.flash('success', 'Thank you! Your free ad is being checked and goes live once approved.');
    } else {
      notify.inbox(req.seller.id, { kind: 'free_live', tone: 'success', title: `Your free ad is live — ${ad.title}`, body: `It runs for ${Free.config().days} days and is shown after paid ads. Upgrade any time to be seen first.`, link: back, linkText: 'Upgrade to paid' });
      req.flash('success', `Your free ad is live for ${Free.config().days} days. Free ads show after paid ads — upgrade any time to be seen first.`);
    }
    res.redirect('/client');
  });

  function readPlan(req) {
    const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').get(parseInt(req.body.plan_id, 10) || 0);
    const topMask = sanitizeMask(maskFrom(req.body.top_slots));
    return { plan, topMask };
  }

  // Manual UPI: client submits UTR → admin confirms → ad goes live.
  app.post('/client/ads/:id/pay/upi', requireClient, requireAdult, (req, res) => {
    const ad = ownAd(req, res); if (!ad) return;
    const back = `/client/ads/${ad.id}/pay`;
    if (ad.status === 'blocked') { res.redirect('/client'); return; }
    const { plan, topMask } = readPlan(req);
    const utr = V.str(req.body.utr, 30).replace(/\s+/g, '');
    if (!plan) { req.flash('error', 'Please choose a plan.'); res.redirect(back); return; }
    if (req.body.accept_terms !== '1') { req.flash('error', 'Please tick the box to accept the payment terms.'); res.redirect(back); return; }
    const total = P.quote(plan, topMask);
    const walletPart = req.body.use_wallet === '1' ? Math.min(W.balance(req.seller.id), total) : 0;
    // Balance covers everything: pay from the wallet and go live straight away.
    if (walletPart >= total) {
      let payId = 0;
      let ok = false;
      try { ok = tx(() => {
        const r = db.prepare(`INSERT INTO payments (client_id, ad_id, plan_id, days, with_top, top_slots, amount_paise, wallet_paise, method, status, created_at, terms_accepted_at)
          VALUES (?,?,?,?,?,?,?,?, 'wallet', 'pending', ?, ?)`).run(req.seller.id, ad.id, plan.id, plan.days, topMask ? 1 : 0, topMask, total, total, Date.now(), Date.now());
        payId = Number(r.lastInsertRowid);
        if (!W.debit(req.seller.id, total, `Paid for "${ad.title}" (${plan.days} days)`, { adId: ad.id, paymentId: payId })) throw new Error('low balance');
        return true;
      }); } catch { ok = false; }
      if (!ok) { req.flash('error', 'Your balance is too low.'); res.redirect(back); return; }
      P.confirmPayment(payId, { note: 'Paid from wallet balance' });
      notify.paymentConfirmed(payId);
      notify.adminAlert('payment', `💳 Wallet payment ${rupees(total)} — ${req.seller.name} · "${ad.title}" is live`);
      req.flash('success', `Paid ${rupees(total)} from your balance — your ad is live now.`);
      res.redirect('/client');
      return;
    }
    if (!/^[A-Za-z0-9]{6,30}$/.test(utr)) { req.flash('error', 'Please enter the UPI transaction ID / UTR.'); res.redirect(back); return; }
    if (db.prepare("SELECT 1 FROM payments WHERE utr = ? AND status IN ('pending','paid')").get(utr) || db.prepare("SELECT 1 FROM wallet_topups WHERE utr = ? AND status IN ('pending','paid')").get(utr)) { req.flash('error', 'This transaction ID was already submitted.'); res.redirect(back); return; }
    let shot = null;
    try { shot = saveUpload(req.files.screenshot?.[0], 'payments', { maxMb: 5 }); } catch (e) { if (e instanceof UploadError) { req.flash('error', e.message); res.redirect(back); return; } throw e; }
    let payRowId = 0;
    try {
      tx(() => {
        const r = db.prepare(`INSERT INTO payments (client_id, ad_id, plan_id, days, with_top, top_slots, amount_paise, wallet_paise, method, status, utr, screenshot_file, created_at, terms_accepted_at)
          VALUES (?,?,?,?,?,?,?,?, 'upi_manual', 'pending', ?, ?, ?, ?)`).run(req.seller.id, ad.id, plan.id, plan.days, topMask ? 1 : 0, topMask, total, walletPart, utr, shot, Date.now(), Date.now());
        payRowId = Number(r.lastInsertRowid);
        if (walletPart > 0 && !W.debit(req.seller.id, walletPart, `Part payment for "${ad.title}"`, { adId: ad.id, paymentId: payRowId })) throw new Error('Balance changed — please try again.');
        if (ad.status !== 'active') db.prepare("UPDATE ads SET status = 'payment_review', updated_at = ? WHERE id = ?").run(Date.now(), ad.id);
      });
    } catch (e) { req.flash('error', e.message || 'Please try again.'); res.redirect(back); return; }
    notify.upiSubmitted(db.prepare('SELECT * FROM payments WHERE id = ?').get(payRowId), req.seller, ad);
    req.flash('success', `Payment submitted. Confirmation takes ${PAYMENT_TIME_TEXT} — your ad goes live as soon as it is confirmed.`);
    notify.upiReceived(req.seller, ad);
    res.redirect('/client');
  });

  // Razorpay: create order (amount is always computed on the server)
  app.post('/client/ads/:id/pay/razorpay', requireClient, requireAdult, async (req, res) => {
    if (!P.razorpayEnabled()) { res.status(400).json({ error: 'Online payments are not enabled.' }); return; }
    const ad = db.prepare('SELECT * FROM ads WHERE id = ? AND client_id = ?').get(parseInt(req.params.id, 10) || 0, req.seller.id);
    if (!ad || ad.status === 'blocked') { res.status(404).json({ error: 'Ad not found' }); return; }
    const { plan, topMask } = readPlan(req);
    if (!plan) { res.status(400).json({ error: 'Choose a plan' }); return; }
    if (req.body.accept_terms !== '1') { res.status(400).json({ error: 'Please tick the box to accept the payment terms.' }); return; }
    const amount = P.quote(plan, topMask);
    const r = db.prepare(`INSERT INTO payments (client_id, ad_id, plan_id, days, with_top, top_slots, amount_paise, method, status, created_at, terms_accepted_at)
      VALUES (?,?,?,?,?,?,?, 'razorpay', 'created', ?, ?)`).run(req.seller.id, ad.id, plan.id, plan.days, topMask ? 1 : 0, topMask, amount, Date.now(), Date.now());
    const payId = Number(r.lastInsertRowid);
    try {
      const order = await P.createRazorpayOrder(amount, `pay_${payId}`, { payment_id: String(payId), ad_id: String(ad.id) });
      db.prepare('UPDATE payments SET razorpay_order_id = ? WHERE id = ?').run(order.id, payId);
      const s = getSettings();
      res.json({
        key: P.RZP_KEY_ID, order_id: order.id, amount, currency: 'INR', name: s.site_name,
        description: `${plan.days} days${topMask ? ' + TOP' : ''} — Ad #${ad.id}`,
        prefill: { name: req.seller.name, email: req.seller.email, contact: req.seller.phone },
      });
    } catch (e) {
      console.error('[razorpay] order failed', e.message);
      db.prepare("UPDATE payments SET status = 'failed', admin_note = ? WHERE id = ?").run(String(e.message).slice(0, 200), payId);
      notify.paymentFailed(req.seller.id, ad, 'We could not start the online payment.');
      res.status(502).json({ error: 'Could not start the payment. Please try again or pay by UPI.' });
    }
  });

  // Online payment failed in the checkout window: record it and tell the seller in their portal.
  app.post('/client/payments/razorpay/failed', requireClient, (req, res) => {
    const pay = db.prepare("SELECT * FROM payments WHERE razorpay_order_id = ? AND client_id = ? AND status = 'created'").get(String((req.body || {}).order_id || ''), req.seller.id);
    if (pay) {
      const why = V.str((req.body || {}).reason, 200) || 'Payment failed';
      db.prepare("UPDATE payments SET status = 'failed', admin_note = ? WHERE id = ?").run(why, pay.id);
      notify.paymentFailed(req.seller.id, db.prepare('SELECT * FROM ads WHERE id = ?').get(pay.ad_id), `The online payment failed: ${why}.`);
    }
    res.json({ ok: true });
  });

  app.post('/client/payments/razorpay/verify', requireClient, (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = req.body || {};
    const pay = orderId && db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ? AND client_id = ?').get(String(orderId), req.seller.id);
    if (!pay || !P.verifyCheckoutSignature(orderId, String(paymentId || ''), String(sig || ''))) {
      res.status(400).json({ ok: false, error: 'Payment verification failed. If money was deducted, contact support with your payment ID.' });
      return;
    }
    const done = P.confirmPayment(pay.id, { razorpayPaymentId: String(paymentId) });
    if (!done.already) notify.paymentConfirmed(pay.id);
    req.flash('success', 'Payment successful — your ad is live!');
    res.json({ ok: true, redirect: '/client' });
  });

  app.get('/client/wallet', requireClient, (req, res) => {
    res.html(renderPage(req, { title: 'My balance', portal: 'client', body: walletView(req, {
      bal: W.balance(req.seller.id), rows: W.history(req.seller.id),
      topups: db.prepare('SELECT * FROM wallet_topups WHERE client_id = ? ORDER BY id DESC LIMIT 20').all(req.seller.id), settings: getSettings(),
    }) }));
  });
  app.post('/client/wallet/topup', requireClient, (req, res) => {
    const amount = Math.round(Number(req.body.amount) * 100);
    const utr = V.str(req.body.utr, 30).replace(/\s+/g, '');
    const back = '/client/wallet';
    if (!(amount >= 5000 && amount <= 10000000)) { req.flash('error', 'Enter an amount between ₹50 and ₹1,00,000.'); res.redirect(back); return; }
    if (!/^[A-Za-z0-9]{6,30}$/.test(utr)) { req.flash('error', 'Enter the UPI transaction ID / UTR.'); res.redirect(back); return; }
    if (req.body.accept_terms !== '1') { req.flash('error', 'Please accept the payment terms.'); res.redirect(back); return; }
    if (db.prepare("SELECT 1 FROM payments WHERE utr = ? AND status IN ('pending','paid')").get(utr) || db.prepare("SELECT 1 FROM wallet_topups WHERE utr = ? AND status IN ('pending','paid')").get(utr)) { req.flash('error', 'This transaction ID was already submitted.'); res.redirect(back); return; }
    let shot = null;
    try { shot = saveUpload(req.files.screenshot?.[0], 'payments', { maxMb: 5 }); } catch (e) { if (e instanceof UploadError) { req.flash('error', e.message); res.redirect(back); return; } throw e; }
    db.prepare('INSERT INTO wallet_topups (client_id, amount_paise, utr, screenshot_file, created_at) VALUES (?,?,?,?,?)').run(req.seller.id, amount, utr, shot, Date.now());
    notify.adminAlert('payment', `💰 Balance top-up to confirm: ${rupees(amount)} from ${req.seller.name} (${req.seller.phone}). UTR ${utr}`);
    notify.inbox(req.seller.id, { kind: 'topup', tone: 'info', title: `Top-up of ${rupees(amount)} received for review`, body: `We are checking your UPI payment. Confirmation takes ${PAYMENT_TIME_TEXT}.`, link: '/client/wallet', linkText: 'My balance' });
    req.flash('success', `Thanks! We will add ${rupees(amount)} to your balance after confirming the payment (${PAYMENT_TIME_TEXT}).`);
    res.redirect(back);
  });

  app.get('/client/messages', requireClient, (req, res) => {
    const rows = db.prepare('SELECT * FROM inbox WHERE client_id = ? ORDER BY id DESC LIMIT 200').all(req.seller.id);
    const body = messagesView(req, rows);
    db.prepare('UPDATE inbox SET read_at = ? WHERE client_id = ? AND read_at IS NULL').run(Date.now(), req.seller.id);
    req.sellerUnread = 0;
    res.html(renderPage(req, { title: 'Messages', portal: 'client', body }));
  });

  app.get('/client/payments/:id/receipt', requireClient, (req, res) => {
    const p = receiptData(parseInt(req.params.id, 10) || 0);
    if (!p || p.client_id !== req.seller.id || p.status !== 'paid') { res.status(404).html(renderPage(req, { title: 'Receipt not found', portal: 'client', body: html`<section class="card narrow center"><h1>Receipt not found</h1><p class="muted">A receipt is available once a payment is confirmed.</p><a class="btn btn-primary" href="/client/payments">My payments</a></section>` })); return; }
    res.html(receiptPage(req, p));
  });

  app.get('/client/payments', requireClient, (req, res) => {
    const rows = db.prepare(`SELECT p.*, a.title AS ad_title FROM payments p JOIN ads a ON a.id = p.ad_id
      WHERE p.client_id = ? AND p.status != 'created' ORDER BY p.id DESC LIMIT 200`).all(req.seller.id);
    res.html(renderPage(req, { title: 'Payments', portal: 'client', body: paymentsView(req, rows) }));
  });

  // Account
  app.get('/client/account', requireClient, (req, res) => {
    const c = req.seller;
    res.html(renderPage(req, { title: 'Account', portal: 'client', body: html`
      <section class="card form-card">
        <h1>Account</h1>
        <dl class="facts">
          <div><dt>Name</dt><dd>${c.name}</dd></div><div><dt>Business</dt><dd>${c.business_name || '—'}</dd></div>
          <div><dt>Email</dt><dd>${c.email}</dd></div><div><dt>Phone</dt><dd>${c.phone}</dd></div>
          <div><dt>ID</dt><dd>${describeId(c)}</dd></div><div><dt>KYC</dt><dd>${pill(c.status)}</dd></div>
          ${c.city ? html`<div><dt>City</dt><dd>${c.city}${c.state ? `, ${c.state}` : ''}</dd></div>` : ''}
        </dl>
        <p class="muted small">To change verified details, contact support.</p>
        <h2>Change password</h2>
        <form method="post" action="/client/account/password" class="form">
          ${csrf(req)}
          ${field('Current password', html`<input type="password" name="current" required autocomplete="current-password">`)}
          <div class="row2">
            ${field('New password', html`<input type="password" name="password" required minlength="6" autocomplete="new-password">`)}
            ${field('Confirm new password', html`<input type="password" name="password2" required minlength="6" autocomplete="new-password">`)}
          </div>
          <button class="btn">Update password</button>
        </form>
        <div class="danger-zone">
          <h2>Deactivate my account</h2>
          <p class="muted small">Your profile and all live ads are hidden right away. The paid days your ads still had are <strong>saved</strong> — log in any time and choose "Reactivate" to bring everything back. Need your data deleted completely? Contact support.</p>
          <form method="post" action="/client/account/deactivate" class="form" data-confirm="Deactivate your account? Your ads will be hidden until you reactivate.">
            ${csrf(req)}
            ${field('Enter your password to confirm', html`<input type="password" name="password" required autocomplete="current-password">`)}
            <button class="btn btn-danger">Deactivate my account</button>
          </form>
        </div>
      </section>` }));
  });
  app.post('/client/account/password', requireClient, (req, res) => {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.seller.id);
    const err = !verifyPassword(req.body.current, c.password_hash) ? 'Current password is incorrect.'
      : V.validatePassword(req.body.password) || (req.body.password !== req.body.password2 ? 'New passwords do not match.' : null);
    if (err) { req.flash('error', err); res.redirect('/client/account'); return; }
    db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), c.id);
    req.flash('success', 'Password updated.');
    res.redirect('/client/account');
  });

  // Razorpay webhook (backup confirmation if the browser closes before verify)
  app.post('/webhooks/razorpay', (req, res) => {
    if (!P.verifyWebhookSignature(req.rawBody || Buffer.alloc(0), String(req.headers['x-razorpay-signature'] || ''))) { res.status(400).send('bad signature'); return; }
    const ev = req.body || {};
    const entity = ev.payload?.payment?.entity;
    if ((ev.event === 'payment.captured' || ev.event === 'order.paid') && entity?.order_id) {
      const pay = db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(entity.order_id);
      if (pay && entity.amount === pay.amount_paise) {
        const done = P.confirmPayment(pay.id, { razorpayPaymentId: entity.id });
        if (!done.already) notify.paymentConfirmed(pay.id);
      }
    }
    res.json({ ok: true });
  });

  // Payment screenshots (private)
  app.get('/media/payments/:file', requireClient, (req, res) => {
    // Clients may only view their own screenshots.
    const name = safeName(req.params.file);
    const own = name && db.prepare('SELECT 1 FROM payments WHERE screenshot_file = ? AND client_id = ?').get(name, req.seller.id);
    if (!own) { res.status(404).send('Not found'); return; }
    return sendFile(res, path.join(DIRS.payments, name), { cache: 'private, no-store' });
  });
}

module.exports = { register, callView, requireClient };
