'use strict';
// One-time verification codes (OTP) and all notification emails.

const crypto = require('node:crypto');
const { db, getSettings, setSetting } = require('./db');
const { sendEmail, sendSmsOtp, smsConfigured } = require('./messaging');
const { rupees, fmtDate, approveTimeText, PAYMENT_TIME_TEXT } = require('./lib/html');

// ---------------- base URL for links in emails ----------------
let lastOrigin = null;
function rememberOrigin(req) {
  // Prefer an https (domain) address over localhost / LAN addresses.
  if (!req.headers.host || (lastOrigin && lastOrigin.startsWith('https') && !req.secure)) return;
  if (req.origin !== lastOrigin) { lastOrigin = req.origin; try { setSetting('last_origin', lastOrigin); } catch { /* ignore */ } }
}
function baseUrl() {
  return (process.env.BASE_URL || lastOrigin || getSettings().last_origin || `http://localhost:${process.env.PORT || 4780}`).replace(/\/+$/, '');
}
const adminEmail = () => getSettings().notify_email || process.env.ADMIN_EMAIL || '';
// Mobile OTP is compulsory whenever SMS sending is set up (Admin → Settings can switch it off).
const phoneOtpRequired = () => smsConfigured() && getSettings().require_mobile_otp !== '0';

// ---------------- OTP ----------------
const OTP_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 60_000;
const hash = (clientId, channel, code) => crypto.createHash('sha256').update(`${clientId}:${channel}:${code}`).digest('hex');

/** Create a new code. Returns { code } or { error, waitSeconds }. */
function issueOtp(clientId, channel) {
  const now = Date.now();
  const last = db.prepare('SELECT created_at FROM otps WHERE client_id = ? AND channel = ? ORDER BY id DESC LIMIT 1').get(clientId, channel);
  if (last && now - last.created_at < RESEND_AFTER_MS) {
    return { error: 'wait', waitSeconds: Math.ceil((RESEND_AFTER_MS - (now - last.created_at)) / 1000) };
  }
  const recent = db.prepare('SELECT COUNT(*) n FROM otps WHERE client_id = ? AND channel = ? AND created_at > ?').get(clientId, channel, now - 3600_000).n;
  if (recent >= 6) return { error: 'limit' };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('UPDATE otps SET expires_at = ? WHERE client_id = ? AND channel = ? AND used_at IS NULL').run(now, clientId, channel);
  db.prepare('INSERT INTO otps (client_id, channel, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(clientId, channel, hash(clientId, channel, code), now + OTP_TTL_MS, now);
  return { code };
}

/** Returns 'ok' | 'wrong' | 'expired' | 'too_many'. */
function checkOtp(clientId, channel, code) {
  const row = db.prepare('SELECT * FROM otps WHERE client_id = ? AND channel = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(clientId, channel);
  const now = Date.now();
  if (!row || row.expires_at < now) return 'expired';
  if (row.attempts >= 5) return 'too_many';
  const clean = String(code || '').replace(/\D/g, '');
  const a = Buffer.from(hash(clientId, channel, clean));
  const b = Buffer.from(row.code_hash);
  if (clean.length !== 6 || !crypto.timingSafeEqual(a, b)) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return row.attempts + 1 >= 5 ? 'too_many' : 'wrong';
  }
  db.prepare('UPDATE otps SET used_at = ? WHERE id = ?').run(now, row.id);
  return 'ok';
}

async function sendEmailOtp(client) {
  const r = issueOtp(client.id, 'email');
  if (r.error) return r;
  const site = getSettings().site_name;
  const res = await sendEmail(client.email, `${r.code} is your ${site} email code`, [
    `Hello ${client.name},`,
    'Use this code to confirm your email address:',
    r.code,
    'The code is valid for 10 minutes. If you did not register, ignore this email.',
  ]);
  return { sent: res.ok, status: res.status };
}

async function sendPhoneOtp(client) {
  const r = issueOtp(client.id, 'sms');
  if (r.error) return r;
  const res = await sendSmsOtp(client.phone, r.code);
  return { sent: res.ok, status: res.status };
}

// ---------------- notifications ----------------
const fire = (p) => { Promise.resolve(p).catch((e) => console.error('[notify]', e.message)); };

// ---------------- admin alerts (WhatsApp / Telegram / Google Chat) ----------------
// kind: payment | seller | complaint | sponsor | free_ad. Admin chooses which kinds to receive in Settings → Alerts.
function adminAlert(kind, text) {
  try {
    const s = getSettings();
    const on = String(s.alert_events || 'payment,seller,complaint,sponsor,free_ad').split(',');
    if (!on.includes(kind)) return;
    const { sendAlert } = require('./messaging');
    fire(sendAlert(`${text}\n${baseUrl()}/admin`));
  } catch (e) { console.error('[alert]', e.message); }
}

// ---------------- seller inbox (messages inside the portal) ----------------
function inbox(clientId, { kind, tone = 'info', title, body = '', link = '', linkText = '' }) {
  try {
    db.prepare('INSERT INTO inbox (client_id, kind, tone, title, body, link, link_text, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(clientId, kind, tone, String(title).slice(0, 160), String(body || '').slice(0, 1000), link || null, linkText || null, Date.now());
  } catch (e) { console.error('[inbox]', e.message); }
}
const unreadCount = (clientId) => db.prepare('SELECT COUNT(*) n FROM inbox WHERE client_id = ? AND read_at IS NULL').get(clientId).n;
const receiptNo = (p) => `${(getSettings().site_name || 'AD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'ADB'}-${new Date(p.confirmed_at || p.created_at).getFullYear()}-${String(p.id).padStart(5, '0')}`;

function statusLink(c) { return `${baseUrl()}/kyc/status/${c.status_token}`; }

// Both checks done → put the client in the admin's review queue.
function maybeSubmit(clientId) {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!c || c.status !== 'unverified') return c;
  if (!c.email_verified_at) return c;
  if (phoneOtpRequired() && !c.phone_verified_at) return c;
  const now = Date.now();
  db.prepare("UPDATE clients SET status = 'pending', submitted_at = ? WHERE id = ?").run(now, c.id);
  adminAlert('seller', `🆕 New seller to verify: ${c.name} (${c.phone}, ${c.email})`);
  const s = getSettings();
  const mins = Number(s.auto_approve_minutes) || 0;
  fire(sendEmail(c.email, `We received your registration — ${s.site_name}`, [
    `Hello ${c.name},`,
    'Thank you! Your email' + (c.phone_verified_at ? ' and mobile number are' : ' is') + ' confirmed and your documents are now with our team for verification.',
    `Login verification takes ${approveTimeText(mins)}. We will email you as soon as you can log in.`,
  ], { text: 'Check my status', url: statusLink(c) }));
  if (adminEmail()) {
    fire(sendEmail(adminEmail(), `New seller to verify: ${c.name}`, [
      `${c.name} (${c.phone}, ${c.email}) from ${c.city} has registered and verified their email${c.phone_verified_at ? ' and phone' : ''}.`,
      mins ? `If you do nothing, the account will be approved automatically in ${mins} minutes.` : 'Please review the documents.',
    ], { text: 'Review now', url: `${baseUrl()}/admin/clients/${c.id}` }));
  }
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(c.id);

}

function emailConfirmed(c) {
  fire(sendEmail(c.email, `Email confirmed — ${getSettings().site_name}`, [
    `Hello ${c.name},`, 'Your email address is confirmed. Thank you!',
  ], { text: 'Check my status', url: statusLink(c) }));
}

function approved(c, { auto = false } = {}) {
  const s = getSettings();
  fire(sendEmail(c.email, `You're approved! Start posting ads — ${s.site_name}`, [
    `Hello ${c.name},`,
    'Good news — your seller account is verified. You can now log in and post your ads.',
    `Login email: ${c.email}`,
  ], { text: 'Log in and post an ad', url: `${baseUrl()}/client/login` }));
  inbox(c.id, { kind: 'approved', tone: 'success', title: 'You are verified — welcome!', body: 'Your seller account is approved. Post your first ad now.', link: '/client/ads/new', linkText: 'Post an ad' });
  if (auto && adminEmail()) {
    fire(sendEmail(adminEmail(), `Auto-approved: ${c.name}`, [
      `${c.name} (${c.phone}, ${c.email}) was approved automatically because nobody reviewed the account in ${s.auto_approve_minutes} minutes.`,
      'You can still review the documents and suspend the account if something is wrong.',
    ], { text: 'Review client', url: `${baseUrl()}/admin/clients/${c.id}` }));
  }
}

function rejected(c, note) {
  fire(sendEmail(c.email, `About your registration — ${getSettings().site_name}`, [
    `Hello ${c.name},`, 'Unfortunately we could not verify your account.', note ? `Reason: ${note}` : '',
  ].filter(Boolean), { text: 'See details', url: statusLink(c) }));
  inbox(c.id, { kind: 'rejected', tone: 'error', title: 'Registration not approved', body: note ? `Reason: ${note}` : 'We could not verify your details.' });
}

function suspended(c, note) {
  fire(sendEmail(c.email, `Your account is suspended — ${getSettings().site_name}`, [
    `Hello ${c.name},`, 'Your seller account has been suspended and your ads are hidden.', note ? `Reason: ${note}` : '', 'Please contact support.',
  ].filter(Boolean)));
  inbox(c.id, { kind: 'suspended', tone: 'error', title: 'Account blocked', body: `Your ads are hidden.${note ? ` Reason: ${note}` : ''} Please contact support.` });
}

function deactivated(c, by) {
  const s = getSettings();
  fire(sendEmail(c.email, `Your account is deactivated — ${s.site_name}`, by === 'client' ? [
    `Hello ${c.name},`,
    'As you asked, your seller account is now deactivated and your ads are hidden.',
    'The paid days your ads still had are saved. Log in any time and choose "Reactivate" to bring everything back.',
    'If you did not do this, log in now and change your password.',
  ] : [
    `Hello ${c.name},`, 'Your seller account has been deactivated by our team and your ads are hidden.', 'Please contact support if you have questions.',
  ], by === 'client' ? { text: 'Reactivate my account', url: `${baseUrl()}/client/login` } : undefined));
  inbox(c.id, { kind: 'deactivated', tone: 'warn', title: 'Account deactivated', body: by === 'client' ? 'You deactivated your account. Your remaining paid days are saved.' : 'Our team deactivated your account. Please contact support.' });
}

function reactivated(c) {
  fire(sendEmail(c.email, `Welcome back — ${getSettings().site_name}`, [
    `Hello ${c.name},`, 'Your seller account is active again. Ads that were live when you deactivated are back online with their remaining paid days.',
  ], { text: 'Go to my ads', url: `${baseUrl()}/client` }));
  inbox(c.id, { kind: 'reactivated', tone: 'success', title: 'Welcome back', body: 'Your account is active again and your ads are back online.', link: '/client', linkText: 'My ads' });
}

function videoCall(c, at) {
  fire(sendEmail(c.email, `${at ? 'Video call' : 'We are calling you now'} — ${getSettings().site_name}`, [
    `Hello ${c.name},`,
    at ? `We would like to talk to you over a short video call on ${fmtDate(at)}.` : 'Our team is calling you on video right now.',
    'Open the link below on your phone or laptop and allow the camera and microphone. Keep the ID you registered with nearby.',
  ], { text: 'Join video call', url: `${baseUrl()}/kyc/call/${c.status_token}` }));
}

function upiSubmitted(pay, client, ad) {
  adminAlert('payment', `💰 New UPI payment to confirm: ${rupees(pay.amount_paise - (pay.wallet_paise || 0))}${pay.wallet_paise ? ` (+ ${rupees(pay.wallet_paise)} from balance)` : ''} from ${client.name} (${client.phone}) for "${ad.title}". UTR ${pay.utr}`);
  if (!adminEmail()) return;
  fire(sendEmail(adminEmail(), `UPI payment to confirm: ${rupees(pay.amount_paise)} from ${client.name}`, [
    `${client.name} says they paid ${rupees(pay.amount_paise)} for "${ad.title}" (${pay.days} days).`,
    `UPI reference (UTR): ${pay.utr}`, 'Check your bank/UPI app, then confirm it so the ad goes live.',
  ], { text: 'Open payments', url: `${baseUrl()}/admin/payments` }));
}

// To the client right after they submit a UPI reference.
function upiReceived(client, ad) {
  fire(sendEmail(client.email, `Payment received for review: ${ad.title}`, [
    `Hello ${client.name},`,
    `We received your UPI payment details for "${ad.title}".`,
    `Payment confirmation takes ${PAYMENT_TIME_TEXT}. We will email you as soon as your ad is live.`,
  ], { text: 'Go to my ads', url: `${baseUrl()}/client` }));
  inbox(client.id, { kind: 'payment_review', tone: 'info', title: `Payment received for review — ${ad.title}`, body: `We are checking your UPI payment. Confirmation takes ${PAYMENT_TIME_TEXT}.`, link: '/client/payments', linkText: 'My payments' });
}

function paymentConfirmed(payId) {
  const p = db.prepare(`SELECT p.*, c.name, c.email, a.title, a.expires_at, a.id AS ad_id FROM payments p
    JOIN clients c ON c.id = p.client_id JOIN ads a ON a.id = p.ad_id WHERE p.id = ?`).get(payId);
  if (!p) return;
  fire(sendEmail(p.email, `Your ad is live: ${p.title}`, [
    `Hello ${p.name},`,
    `We received your payment of ${rupees(p.amount_paise)}. Your ad "${p.title}" is now live until ${fmtDate(p.expires_at)}.`,
    `Receipt number: ${receiptNo(p)}. You can download the receipt from My payments.`,
  ], { text: 'Download receipt', url: `${baseUrl()}/client/payments/${p.id}/receipt` }));
  inbox(p.client_id, { kind: 'payment_ok', tone: 'success', title: `Payment confirmed — your ad is live`, body: `${rupees(p.amount_paise)} received for "${p.title}". Live until ${fmtDate(p.expires_at)}. Receipt ${receiptNo(p)}.`, link: `/client/payments/${p.id}/receipt`, linkText: 'Download receipt' });
}

function paymentRejected(payId) {
  const p = db.prepare(`SELECT p.*, c.name, c.email, a.title FROM payments p JOIN clients c ON c.id = p.client_id JOIN ads a ON a.id = p.ad_id WHERE p.id = ?`).get(payId);
  if (!p) return;
  fire(sendEmail(p.email, `Payment not received: ${p.title}`, [
    `Hello ${p.name},`, `We could not find your UPI payment (reference ${p.utr}) of ${rupees(p.amount_paise)}.`,
    p.admin_note ? `Reason: ${p.admin_note}` : '', 'Please check the UPI ID, the amount and the 12-digit UTR in your UPI app, then submit the payment again.',
  ].filter(Boolean), { text: 'Pay again', url: `${baseUrl()}/client/ads/${p.ad_id}/pay` }));
  inbox(p.client_id, { kind: 'payment_rejected', tone: 'error', title: `Payment rejected — ${p.title}`, body: `We could not find your payment of ${rupees(p.amount_paise)} (UTR ${p.utr || '—'}).${p.admin_note ? ` Reason: ${p.admin_note}.` : ''} Please check the details in your UPI app and pay again.`, link: `/client/ads/${p.ad_id}/pay`, linkText: 'Pay again' });
}

function paymentFailed(clientId, ad, why) {
  inbox(clientId, { kind: 'payment_failed', tone: 'error', title: `Payment could not be completed — ${ad.title}`, body: `${why || 'The online payment did not go through.'} If money left your account, your bank or UPI app returns it automatically, usually within 5–7 working days. You can try again or pay by UPI.`, link: `/client/ads/${ad.id}/pay`, linkText: 'Try again' });
}

function adBlocked(ad, reason) {
  inbox(ad.client_id, { kind: 'ad_blocked', tone: 'error', title: `Ad removed — ${ad.title}`, body: `Our team removed this ad.${reason ? ` Reason: ${reason}` : ''} Contact support if you think this is a mistake.` });
}

function adExpired(ad) {
  inbox(ad.client_id, { kind: 'ad_expired', tone: 'warn', title: `Ad ended — ${ad.title}`, body: 'Its paid period is over, so it is no longer shown. Renew it to bring it back.', link: `/client/ads/${ad.id}/pay`, linkText: 'Renew' });
}

module.exports = {
  rememberOrigin, baseUrl, phoneOtpRequired, issueOtp, checkOtp, sendEmailOtp, sendPhoneOtp, maybeSubmit,
  emailConfirmed, approved, rejected, suspended, deactivated, reactivated, videoCall, upiSubmitted, upiReceived, paymentConfirmed, paymentRejected,
  paymentFailed, adBlocked, adExpired, inbox, unreadCount, receiptNo, adminAlert,
};
