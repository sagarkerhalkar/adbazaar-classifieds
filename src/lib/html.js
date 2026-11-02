'use strict';
// Auto-escaping HTML template tag. Interpolated values are escaped unless wrapped in raw().

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }

const raw = (s) => new Raw(s == null ? '' : String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(esc).join('');
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += esc(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// Formatting helpers shared by views.
const TZ = 'Asia/Kolkata';
const rupees = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (ms) => (ms ? new Date(Number(ms)).toLocaleString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (ms) => (ms ? new Date(Number(ms)).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function timeAgo(ms) {
  const s = Math.max(1, Math.floor((Date.now() - Number(ms)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return fmtDay(ms);
}

function timeLeft(ms) {
  const s = Math.floor((Number(ms) - Date.now()) / 1000);
  if (s <= 0) return 'expired';
  const d = Math.floor(s / 86400); if (d >= 1) return `${d} day${d > 1 ? 's' : ''} left`;
  const h = Math.floor(s / 3600); if (h >= 1) return `${h} hr left`;
  return `${Math.max(1, Math.floor(s / 60))} min left`;
}

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ad';

module.exports = { html, raw, esc, Raw, rupees, fmtDate, fmtDay, timeAgo, timeLeft, slugify };
