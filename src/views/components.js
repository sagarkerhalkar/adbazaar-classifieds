'use strict';
const { html, rupees, timeAgo, slugify } = require('../lib/html');

const csrf = (req) => html`<input type="hidden" name="_csrf" value="${req.csrfToken}">`;

const STATUS_LABELS = {
  unverified: ['Email/phone not verified', 'muted'], pending: ['Pending review', 'warn'], video_call: ['Video call scheduled', 'info'], approved: ['Approved', 'ok'],
  rejected: ['Rejected', 'bad'], suspended: ['Blocked', 'bad'], deactivated: ['Deactivated', 'muted'], deleted: ['Deleted', 'bad'],
  paused: ['Deactivated', 'muted'],
  awaiting_payment: ['Awaiting payment', 'warn'], payment_review: ['Payment under review', 'info'],
  active: ['Live', 'ok'], expired: ['Expired', 'muted'], blocked: ['Blocked', 'bad'],
  created: ['Started', 'muted'], paid: ['Paid', 'ok'], failed: ['Failed', 'bad'],
};
function pill(status) {
  const [label, tone] = STATUS_LABELS[status] || [status, 'muted'];
  return html`<span class="pill pill-${tone}">${label}</span>`;
}

const adUrl = (ad) => `/ad/${ad.id}-${slugify(ad.title)}`;
const imgUrl = (file) => `/media/ads/${file}`;

function priceText(ad) {
  if (ad.price_paise != null && ad.price_paise > 0) return html`${rupees(ad.price_paise)}${ad.price_note ? html` <small>${ad.price_note}</small>` : ''}`;
  return ad.price_note || (ad.kind === 'service' ? 'Contact for price' : 'Price on request');
}

const hasVideo = (ad) => { try { return JSON.parse(ad.videos || '[]').length > 0; } catch { return false; } };

function adCard(ad) {
  let images = [];
  try { images = JSON.parse(ad.images || '[]'); } catch { /* ignore */ }
  return html`
  <article class="ad-card ${ad.is_top ? 'is-top' : ''}">
    <a href="${adUrl(ad)}" class="ad-thumb">
      ${images[0] ? html`<img src="${imgUrl(images[0])}" alt="${ad.title}" loading="lazy">` : html`<div class="thumb-ph">${ad.cat_icon || '📦'}</div>`}
      ${ad.is_top ? html`<span class="top-badge">★ TOP</span>` : ''}
      ${images.length > 1 || hasVideo(ad) ? html`<span class="img-count">${images.length > 1 ? `📷 ${images.length}` : ''}${hasVideo(ad) ? ' 🎬' : ''}</span>` : ''}
    </a>
    <div class="ad-body">
      <div class="ad-meta-top"><span class="chip-sm">${ad.cat_name || ''}</span><span class="kind kind-${ad.kind}">${ad.kind === 'service' ? 'Service' : 'Product'}</span></div>
      <h3 class="ad-title"><a href="${adUrl(ad)}">${ad.title}</a></h3>
      <p class="ad-desc">${String(ad.description || '').slice(0, 140)}</p>
      <div class="ad-foot">
        <strong class="ad-price">${priceText(ad)}</strong>
        <span class="muted small">📍 ${ad.locality ? `${ad.locality}, ` : ''}${ad.city} · ${timeAgo(ad.starts_at || ad.created_at)}</span>
      </div>
      <div class="verified small">✔ Verified seller</div>
    </div>
  </article>`;
}

function pager(page, totalPages, baseQuery) {
  if (totalPages <= 1) return '';
  const link = (p) => { const q = new URLSearchParams(baseQuery); q.set('page', p); return `?${q}`; };
  return html`<nav class="pager">
    ${page > 1 ? html`<a class="btn btn-ghost" href="${link(page - 1)}">← Prev</a>` : ''}
    <span class="muted">Page ${page} of ${totalPages}</span>
    ${page < totalPages ? html`<a class="btn btn-ghost" href="${link(page + 1)}">Next →</a>` : ''}
  </nav>`;
}

const field = (label, input, hint) => html`<label class="field"><span class="label">${label}</span>${input}${hint ? html`<small class="hint">${hint}</small>` : ''}</label>`;

const CITIES = ['Mumbai', 'Pune', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Nagpur', 'Indore', 'Bhopal', 'Nashik', 'Aurangabad', 'Thane', 'Navi Mumbai', 'Chandigarh', 'Kochi', 'Coimbatore', 'Vadodara', 'Patna', 'Goa', 'Noida', 'Gurugram'];
const cityDatalist = () => html`<datalist id="cities">${CITIES.map((c) => html`<option value="${c}">`)}</datalist>`;

const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
const stateSelect = (value) => html`<select name="state" required><option value="">Select state</option>${STATES.map((s) => html`<option ${s === value ? 'selected' : ''}>${s}</option>`)}</select>`;

module.exports = { csrf, pill, adCard, adUrl, imgUrl, priceText, pager, field, cityDatalist, stateSelect, CITIES };
