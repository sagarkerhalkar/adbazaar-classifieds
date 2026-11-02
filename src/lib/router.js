'use strict';
// Tiny dependency-free HTTP router with middleware support.
// Handlers run in order; the chain stops as soon as a handler ends the response.

const http = require('node:http');
const { parseBody } = require('./body');
const { renderError } = require('../views/layout');

class App {
  constructor() {
    this.middleware = [];
    this.routes = [];
  }

  use(fn) { this.middleware.push(fn); }

  add(method, path, handlers) {
    const keys = [];
    const pattern = path
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })
      .replace(/\/\*$/, '/(.*)');
    if (path.endsWith('/*')) keys.push('wildcard');
    this.routes.push({ method, re: new RegExp(`^${pattern}/?$`), keys, handlers });
  }

  get(path, ...h) { this.add('GET', path, h); }
  post(path, ...h) { this.add('POST', path, h); }

  async runChain(chain, req, res) {
    for (const fn of chain) {
      if (res.writableEnded || res.headersSent) return true;
      await fn(req, res);
    }
    return res.writableEnded || res.headersSent;
  }

  async handle(req, res) {
    try {
      decorate(req, res);
      const ended = await this.runChain(this.middleware, req, res);
      if (ended) return;

      // Body parsing happens per route so oversized uploads can be rejected early.
      for (const r of this.routes) {
        if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
        const m = r.re.exec(req.path);
        if (!m) continue;
        req.params = {};
        r.keys.forEach((k, i) => {
          try { req.params[k] = decodeURIComponent(m[i + 1]); } catch { req.params[k] = m[i + 1]; }
        });
        await this.runChain(r.handlers, req, res);
        if (!res.writableEnded && !res.headersSent) res.status(500).send('Handler did not respond');
        return;
      }
      res.status(404).html(renderError(req, 404, 'Page not found', 'The page you are looking for does not exist.'));
    } catch (err) {
      console.error(`[error] ${req.method} ${req.url}`, err);
      if (!res.headersSent) {
        const status = err.status || 500;
        const msg = status === 500 ? 'Something went wrong. Please try again.' : err.message;
        res.status(status).html(renderError(req, status, status === 413 ? 'Upload too large' : 'Error', msg));
      } else {
        res.end();
      }
    }
  }

  listen(port, host, cb) {
    const server = http.createServer((req, res) => this.handle(req, res));
    server.listen(port, host, cb);
    return server;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function decorate(req, res) {
  const url = new URL(req.url, 'http://localhost');
  req.path = url.pathname;
  req.query = Object.fromEntries(url.searchParams);
  req.cookies = parseCookies(req.headers.cookie);
  req.body = {};
  req.files = {};
  // Requests arriving from this same computer (127.0.0.1) may come through Cloudflare Tunnel
  // (cloudflared) or a local Nginx, so we trust their forwarding headers automatically.
  // Requests from other machines are trusted only when TRUST_PROXY=1.
  const remote = req.socket.remoteAddress || '';
  const viaLocalProxy = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const trust = viaLocalProxy || process.env.TRUST_PROXY === '1';
  const first = (h) => String(h || '').split(',')[0].trim();
  req.ip = (trust && (first(req.headers['cf-connecting-ip']) || first(req.headers['x-forwarded-for']))) || remote;
  let proto = '';
  if (trust) {
    try { proto = JSON.parse(req.headers['cf-visitor'] || '{}').scheme || ''; } catch { /* ignore */ }
    proto = proto || first(req.headers['x-forwarded-proto']);
  }
  req.secure = proto === 'https';
  req.origin = `${req.secure ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;

  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body, type = 'text/plain; charset=utf-8') => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', type);
    res.end(body);
  };
  res.html = (body) => res.send(String(body && body.s !== undefined ? body.s : body), 'text/html; charset=utf-8');
  res.json = (obj) => res.send(JSON.stringify(obj), 'application/json; charset=utf-8');
  res.redirect = (to) => { res.statusCode = 303; res.setHeader('Location', to); res.end(); };
  res.appendHeader = res.appendHeader || ((name, value) => {
    const prev = res.getHeader(name);
    res.setHeader(name, prev ? [].concat(prev, value) : value);
  });
}

module.exports = { App, parseBody };
