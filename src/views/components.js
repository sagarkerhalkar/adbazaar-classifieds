'use strict';
const { html, rupees, timeAgo, slugify } = require('../lib/html');
const { icon } = require('./icons');

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
  const place = `${ad.locality ? `${ad.locality}, ` : ''}${ad.city}`;
  return html`
  <article class="ad-card ${ad.is_top ? 'is-top' : ''}">
    <a href="${adUrl(ad)}" class="ad-thumb" tabindex="-1" aria-hidden="true">
      ${images[0] ? html`<img src="${imgUrl(images[0])}" alt="" loading="lazy">` : html`<div class="thumb-ph">${ad.cat_icon || '📦'}</div>`}
      ${ad.is_top ? html`<span class="top-badge">★ TOP</span>` : ''}
      ${images.length > 1 || hasVideo(ad) ? html`<span class="img-count">${images.length > 1 ? html`${icon('camera', { size: 12 })} ${images.length}` : ''}${hasVideo(ad) ? html` ${icon('video', { size: 12 })}` : ''}</span>` : ''}
    </a>
    <button type="button" class="fav" data-fav="${ad.id}" aria-label="Save this ad" aria-pressed="false">${icon('heart', { size: 18 })}</button>
    <div class="ad-body">
      <strong class="ad-price">${priceText(ad)}</strong>
      <h3 class="ad-title"><a href="${adUrl(ad)}">${ad.title}</a></h3>
      <div class="ad-foot">
        <span class="ad-place">${icon('pin', { size: 13 })} ${place}</span>
        <span class="ad-when">${timeAgo(ad.starts_at || ad.created_at)}</span>
      </div>
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
const stateSelect = (value, { required = true } = {}) => html`<select name="state" ${required ? 'required' : ''}><option value="">Select state</option>${STATES.map((s) => html`<option ${s === value ? 'selected' : ''}>${s}</option>`)}</select>`;

// ID document (one of Aadhaar / PAN / Passport) — used on the client and admin registration forms.
function idFields(v = {}) {
  const { ID_TYPES } = require('../idproof');
  const type = ID_TYPES[v.id_type] ? v.id_type : 'aadhaar';
  const t = ID_TYPES[type];
  return html`
    <div class="id-types" role="radiogroup" aria-label="ID document">
      ${Object.entries(ID_TYPES).map(([k, x]) => html`<label class="id-type"><input type="radio" name="id_type" value="${k}" ${k === type ? 'checked' : ''} required
        data-id-type data-placeholder="${x.placeholder}" data-inputmode="${x.inputmode}" data-maxlength="${x.maxlength}" data-hint="${x.hint}" data-short="${x.short}"><span>${x.label}</span></label>`)}
    </div>
    <div class="row2">
      ${field(html`<span data-id-label>${t.short}</span> number *`, html`<input name="id_number" required class="upper" maxlength="${t.maxlength}" inputmode="${t.inputmode}" placeholder="${t.placeholder}" value="${v.id_number}" data-id-number autocomplete="off">`, html`<span data-id-hint>${t.hint}</span>`)}
      ${field(html`Photo of your <span data-id-label>${t.short}</span> *`, html`<input type="file" name="id_file" required accept="image/*,application/pdf">`, 'Clear photo or PDF, max 5 MB. Name and date of birth must be readable.')}
    </div>
    ${field('Back side (optional)', html`<input type="file" name="id_back_file" accept="image/*,application/pdf">`, 'Only if your document has details on the back')}`;
}

// Address — optional, but always shown open so people see they can fill it.
function addressFields(v = {}) {
  return html`
    <div class="address-block">
      <span class="label">Address <span class="muted small">(optional)</span></span>
      ${field('House / street / area', html`<textarea name="address" rows="2" maxlength="300" autocomplete="street-address">${v.address}</textarea>`)}
      <div class="row3">
        ${field('City', html`<input name="city" list="cities" maxlength="60" value="${v.city}" autocomplete="address-level2">`)}${cityDatalist()}
        ${field('State', stateSelect(v.state, { required: false }))}
        ${field('PIN code', html`<input name="pincode" inputmode="numeric" pattern="[1-9][0-9]{5}" maxlength="6" value="${v.pincode}" autocomplete="postal-code">`)}
      </div>
    </div>`;
}

module.exports = { csrf, pill, adCard, adUrl, imgUrl, priceText, pager, field, cityDatalist, stateSelect, idFields, addressFields, CITIES };
