'use strict';
/**
 * Email (SMTP) and SMS sending — no npm packages.
 *
 * EMAIL (free): any SMTP account. Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465,
 *   SMTP_USER=you@gmail.com, SMTP_PASS=<16-letter App Password>  (≈500 emails/day free).
 * SMS: SMS_PROVIDER = android | fast2sms | msg91 | webhook   (empty = SMS off)
 *   android  — FREE: an Android phone with the "SMS Gateway for Android" app sends SMS from its own SIM.
 *   fast2sms — paid per SMS (India), OTP route.        msg91 — paid per SMS (India), OTP API.
 *   webhook  — any provider: SMS_WEBHOOK_URL with {phone} {otp} {message} placeholders (GET).
 *
 * Every message is recorded in the `outbox` table (Admin → Messages). If email/SMS is not set up
 * yet, the message is stored there with status "not_configured" so you can still test locally.
 */

const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const crypto = require('node:crypto');
const { db, getSettings } = require('./db');

const env = (k, d = '') => String(process.env[k] ?? d).trim();
// Settings saved in Admin → Settings → "Email & SMS setup" win over .env (no restart needed).
function cfg(k, d = '') {
  try {
    const v = getSettings()[k.toLowerCase()];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  } catch { /* ignore */ }
  return env(k, d);
}

// ------------------------------------------------------------------ EMAIL
const emailConfigured = () => Boolean(cfg('SMTP_HOST') && cfg('SMTP_USER') && cfg('SMTP_PASS'));

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
const b64lines = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');

function buildMessage({ from, to, subject, text, html }) {
  const boundary = `adb_${crypto.randomBytes(12).toString('hex')}`;
  const domain = (from.match(/@([^>\s]+)/) || [])[1] || 'localhost';
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64lines(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

// Minimal SMTP client: implicit TLS (port 465) or STARTTLS (587/25), AUTH LOGIN.
function smtpSend({ host, port, user, pass, from, to, data, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    const implicitTls = port === 465 || cfg('SMTP_SECURE') === '1';
    let socket = implicitTls ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    let buffer = '';
    let waiter = null;
    const replies = [];
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.end(); } catch { /* ignore */ }
      if (err) reject(err); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('SMTP timeout')), timeoutMs);

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      // A complete reply ends with a line "NNN text" (no dash after the code).
      let found = true;
      while (found) {
        found = false;
        const lines = buffer.split('\r\n');
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^\d{3}( |$)/.test(lines[i])) {
            const reply = lines.slice(0, i + 1).join('\n');
            buffer = lines.slice(i + 1).join('\r\n');
            if (waiter) { const w = waiter; waiter = null; w(reply); } else replies.push(reply);
            found = true;
            break;
          }
        }
      }
    }
    const attach = (s) => { s.on('data', onData); s.on('error', (e) => finish(e)); };
    attach(socket);

    const read = () => new Promise((res) => { if (replies.length) res(replies.shift()); else waiter = res; });
    const cmd = async (line, expect) => {
      socket.write(`${line}\r\n`);
      const reply = await read();
      if (!expect.includes(Number(reply.slice(0, 3)))) {
        const shown = line.startsWith('AUTH') || /^[A-Za-z0-9+/=]+$/.test(line) ? '(auth)' : line.split(' ')[0];
        throw new Error(`SMTP ${shown} failed: ${reply.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      return reply;
    };

    (async () => {
      const greet = await read();
      if (!greet.startsWith('220')) throw new Error(`SMTP greeting: ${greet}`);
      const me = os.hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'localhost';
      let ehlo = await cmd(`EHLO ${me}`, [250]);
      if (!implicitTls && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', [220]);
        socket.removeAllListeners('data');
        socket = tls.connect({ socket, servername: host });
        attach(socket);
        await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
        ehlo = await cmd(`EHLO ${me}`, [250]);
      }
      await cmd('AUTH LOGIN', [334]);
      await cmd(Buffer.from(user).toString('base64'), [334]);
      await cmd(Buffer.from(pass).toString('base64'), [235]);
      const fromAddr = (from.match(/<([^>]+)>/) || [null, from])[1];
      await cmd(`MAIL FROM:<${fromAddr}>`, [250]);
      await cmd(`RCPT TO:<${to}>`, [250, 251]);
      await cmd('DATA', [354]);
      const body = data.replace(/\r\n\./g, '\r\n..');
      await cmd(`${body}\r\n.`, [250]);
      socket.write('QUIT\r\n');
      finish();
    })().catch(finish);
  });
}

function record(channel, to, subject, body, status, error) {
  try {
    db.prepare('INSERT INTO outbox (channel, to_addr, subject, body, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(channel, to, subject || null, body, status, error || null, Date.now());
  } catch (e) { console.error('[outbox]', e.message); }
}

/**
 * Send an email. Never throws — returns { ok, status, error }.
 * `lines` is an array of paragraphs (plain text). `button` = { text, url } (optional).
 */
async function sendEmail(to, subject, lines, button) {
  const s = getSettings();
  const site = s.site_name || 'AdBazaar';
  const text = [...lines, button ? `${button.text}: ${button.url}` : '', '', `— ${site}`].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n\n');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f9;font-family:Arial,sans-serif;color:#1d2230">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e6e8ee;overflow:hidden">
<div style="background:#e8452c;color:#fff;padding:16px 22px;font-size:20px;font-weight:bold">${esc(site)}</div>
<div style="padding:22px;font-size:15px;line-height:1.6">
${lines.map((l) => (/^\d{6}$/.test(l) ? `<p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;margin:18px 0">${l}</p>` : `<p>${esc(l)}</p>`)).join('\n')}
${button ? `<p style="text-align:center;margin:22px 0"><a href="${esc(button.url)}" style="background:#e8452c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${esc(button.text)}</a></p>` : ''}
</div><div style="padding:14px 22px;color:#7b8294;font-size:12px;border-top:1px solid #e6e8ee">This is an automatic message from ${esc(site)}.</div></div></body></html>`;

  if (!emailConfigured()) {
    console.log(`[email not configured] to=${to} subject="${subject}"\n${text}\n`);
    record('email', to, subject, text, 'not_configured');
    return { ok: false, status: 'not_configured' };
  }
  // "Send emails as" address (needed for Brevo etc., where the login is not an email you own).
  const fromAddr = cfg('MAIL_FROM') || cfg('SMTP_USER');
  const from = fromAddr.includes('<') ? fromAddr : `${site} <${fromAddr}>`;
  try {
    await smtpSend({
      host: cfg('SMTP_HOST'), port: Number(cfg('SMTP_PORT', '465')), user: cfg('SMTP_USER'), pass: cfg('SMTP_PASS').replace(/\s+/g, ''),
      from, to, data: buildMessage({ from, to, subject, text, html }),
    });
    record('email', to, subject, text, 'sent');
    return { ok: true, status: 'sent' };
  } catch (e) {
    console.error('[email] failed:', e.message);
    record('email', to, subject, text, 'failed', e.message);
    return { ok: false, status: 'failed', error: e.message };
  }
}

// ------------------------------------------------------------------ SMS
const smsProvider = () => cfg('SMS_PROVIDER').toLowerCase();
function smsConfigured() {
  const p = smsProvider();
  if (p === 'android') return Boolean(cfg('SMS_GATEWAY_USER') && cfg('SMS_GATEWAY_PASS'));
  if (p === 'fast2sms') return Boolean(cfg('FAST2SMS_API_KEY'));
  if (p === 'msg91') return Boolean(cfg('MSG91_AUTH_KEY') && cfg('MSG91_TEMPLATE_ID'));
  if (p === 'webhook') return Boolean(cfg('SMS_WEBHOOK_URL'));
  return false;
}

async function httpCall(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return t;
}

/** Send an OTP by SMS to a 10-digit Indian mobile number. Never throws. */
async function sendSmsOtp(phone10, otp) {
  const site = getSettings().site_name || 'AdBazaar';
  const message = `${otp} is your ${site} verification code. Valid for 10 minutes. Do not share it.`;
  const p = smsProvider();
  if (!smsConfigured()) {
    console.log(`[sms not configured] to=${phone10}: ${message}`);
    record('sms', phone10, 'OTP', message, 'not_configured');
    return { ok: false, status: 'not_configured' };
  }
  try {
    if (p === 'android') {
      // SMS Gateway for Android (cloud: https://api.sms-gate.app/3rdparty/v1/messages, or the phone's local server)
      const url = cfg('SMS_GATEWAY_URL', 'https://api.sms-gate.app/3rdparty/v1/messages');
      const auth = Buffer.from(`${cfg('SMS_GATEWAY_USER')}:${cfg('SMS_GATEWAY_PASS')}`).toString('base64');
      await httpCall(url, {
        method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: [`+91${phone10}`] }),
      });
    } else if (p === 'fast2sms') {
      const q = new URLSearchParams({ authorization: cfg('FAST2SMS_API_KEY'), route: 'otp', variables_values: otp, numbers: phone10 });
      const t = await httpCall(`https://www.fast2sms.com/dev/bulkV2?${q}`, { method: 'GET' });
      if (/"return"\s*:\s*false/.test(t)) throw new Error(t.slice(0, 200));
    } else if (p === 'msg91') {
      const q = new URLSearchParams({ template_id: cfg('MSG91_TEMPLATE_ID'), mobile: `91${phone10}`, otp });
      const t = await httpCall(`https://control.msg91.com/api/v5/otp?${q}`, { method: 'POST', headers: { authkey: cfg('MSG91_AUTH_KEY') } });
      if (/"type"\s*:\s*"error"/.test(t)) throw new Error(t.slice(0, 200));
    } else if (p === 'webhook') {
      const url = cfg('SMS_WEBHOOK_URL').replace('{phone}', encodeURIComponent(phone10)).replace('{otp}', encodeURIComponent(otp))
        .replace('{message}', encodeURIComponent(message));
      await httpCall(url, { method: 'GET' });
    }
    record('sms', phone10, 'OTP', message, 'sent');
    return { ok: true, status: 'sent' };
  } catch (e) {
    console.error('[sms] failed:', e.message);
    record('sms', phone10, 'OTP', message, 'failed', e.message);
    return { ok: false, status: 'failed', error: e.message };
  }
}

// Keep the outbox small: delete entries older than 60 days once a day.
setInterval(() => { try { db.prepare('DELETE FROM outbox WHERE created_at < ?').run(Date.now() - 60 * 86400_000); } catch { /* ignore */ } }, 86400_000).unref();

module.exports = { sendEmail, sendSmsOtp, emailConfigured, smsConfigured, smsProvider, buildMessage, smtpSend };
