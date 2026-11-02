'use strict';
// SQLite-backed sessions using an HttpOnly cookie.

const { randomToken } = require('./security');

const COOKIE = 'adb_sid';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// COOKIE_SECURE: "1" = always Secure, "0" = never, anything else ("auto", default) =
// Secure only when the visitor came over HTTPS (e.g. your Cloudflare domain). This lets the
// same running app work on http://localhost, on your Wi-Fi (http://192.168.x.x) and on https://your-domain.
function cookieString(id, req) {
  const parts = [`${COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${TTL_MS / 1000}`];
  const mode = String(process.env.COOKIE_SECURE || 'auto');
  if (mode === '1' || (mode !== '0' && req.secure)) parts.push('Secure');
  return parts.join('; ');
}

function sessionMiddleware(db) {
  const getStmt = db.prepare('SELECT data, expires FROM sessions WHERE id = ?');
  const upsert = db.prepare('INSERT INTO sessions (id, data, expires) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires = excluded.expires');
  const del = db.prepare('DELETE FROM sessions WHERE id = ?');

  setInterval(() => db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()), 3600_000).unref();

  return function session(req, res) {
    let id = req.cookies[COOKIE];
    let data = {};
    let loaded = '';
    if (id && /^[A-Za-z0-9_-]{20,64}$/.test(id)) {
      const row = getStmt.get(id);
      if (row && row.expires > Date.now()) {
        try { data = JSON.parse(row.data); loaded = row.data; } catch { data = {}; }
      } else {
        id = null;
      }
    } else {
      id = null;
    }
    if (!id) {
      id = randomToken(32);
      res.appendHeader('Set-Cookie', cookieString(id, req));
    }
    req.sessionId = id;
    req.session = data;

    req.regenerateSession = () => {
      del.run(req.sessionId);
      req.sessionId = randomToken(32);
      const csrf = req.session.csrf;
      req.session = { csrf };
      res.setHeader('Set-Cookie', cookieString(req.sessionId, req));
    };
    req.destroySession = () => {
      del.run(req.sessionId);
      req.session = {};
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      req.sessionDestroyed = true;
    };
    req.flash = (type, msg) => { (req.session.flash = req.session.flash || []).push({ type, msg }); };
    req.takeFlash = () => { const f = req.session.flash || []; delete req.session.flash; return f; };

    // Persist the session synchronously just before the response is finished.
    const end = res.end.bind(res);
    res.end = (...args) => {
      if (!req.sessionDestroyed) {
        const json = JSON.stringify(req.session || {});
        if (json !== loaded && (json !== '{}' || loaded)) upsert.run(req.sessionId, json, Date.now() + TTL_MS);
      }
      return end(...args);
    };
  };
}

module.exports = { sessionMiddleware };
