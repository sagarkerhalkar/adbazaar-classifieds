'use strict';
// Payment receipt: a clean printable page (Print → "Save as PDF" gives a PDF).

const { db, getSettings } = require('../db');
const { html, rupees, fmtDate } = require('../lib/html');
const { assetUrl } = require('../lib/files');
const { slotLabels } = require('../slots');
const { receiptNo } = require('../notify');

function receiptData(id) {
  return db.prepare(`SELECT p.*, c.name AS client_name, c.business_name, c.phone AS client_phone, c.email AS client_email,
      c.address AS client_address, c.city AS client_city, c.state AS client_state, c.pincode AS client_pin,
      a.title AS ad_title, a.city AS ad_city, pl.name AS plan_name
    FROM payments p JOIN clients c ON c.id = p.client_id JOIN ads a ON a.id = p.ad_id LEFT JOIN plans pl ON pl.id = p.plan_id
    WHERE p.id = ?`).get(id);
}

// Amount in words, Indian numbering (lakh, crore).
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`; }
function three(n) { const h = Math.floor(n / 100); const r = n % 100; return [h ? `${ONES[h]} Hundred` : '', r ? two(r) : ''].filter(Boolean).join(' '); }
function words(num) {
  let n = Math.floor(num);
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(' ');
}
function amountInWords(paise) {
  const r = Math.floor(paise / 100); const p = paise % 100;
  return `Rupees ${words(r)}${p ? ` and ${two(p)} Paise` : ''} only`;
}

function receiptPage(req, p) {
  const s = getSettings();
  const business = s.legal_name || s.site_name;
  const isTax = Boolean(s.gstin);
  const tops = p.top_slots ? slotLabels(p.top_slots).join(', ') : '';
  const clientAddr = [p.client_address, p.client_city, p.client_state, p.client_pin].filter(Boolean).join(', ');
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${receiptNo(p)} · ${s.site_name}</title>
<link rel="stylesheet" href="${assetUrl('/public/css/style.css')}">
</head><body class="receipt-body">
<div class="receipt-tools"><a class="btn" href="${req.admin && !req.seller ? '/admin/payments?status=paid' : '/client/payments'}">← Back</a><button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button></div>
<main class="receipt">
  <header class="rc-head">
    <div><div class="rc-brand"><span class="logo-mark">◆</span> ${s.site_name}</div>
      <div class="rc-biz">${business}${s.legal_address ? html`<br>${s.legal_address}` : ''}${s.gstin ? html`<br>GSTIN: ${s.gstin}` : ''}${s.support_email || s.support_phone ? html`<br>${[s.support_email, s.support_phone].filter(Boolean).join(' · ')}` : ''}</div></div>
    <div class="rc-title"><h1>${isTax ? 'Tax invoice / Receipt' : 'Payment receipt'}</h1>
      <dl><div><dt>Receipt no.</dt><dd>${receiptNo(p)}</dd></div><div><dt>Date</dt><dd>${fmtDate(p.confirmed_at || p.created_at)}</dd></div><div><dt>Status</dt><dd class="rc-paid">PAID</dd></div></dl></div>
  </header>
  <section class="rc-to"><h3>Billed to</h3><p><strong>${p.business_name || p.client_name}</strong>${p.business_name ? html`<br>${p.client_name}` : ''}<br>${p.client_phone} · ${p.client_email}${clientAddr ? html`<br>${clientAddr}` : ''}</p></section>
  <table class="rc-table">
    <thead><tr><th>Description</th><th>Period</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr><td><strong>Online classified ad placement</strong><br><span class="muted">Ad #${p.ad_id}: ${p.ad_title} (${p.ad_city})${p.plan_name ? html` · ${p.plan_name}` : ''}${tops ? html`<br>Includes TOP slots: ${tops}` : ''}</span></td><td>${p.days} days</td><td class="num">${rupees(p.amount_paise)}</td></tr>
    </tbody>
    <tfoot><tr><td colspan="2">Total paid${isTax ? ' (inclusive of applicable GST)' : ''}</td><td class="num">${rupees(p.amount_paise)}</td></tr></tfoot>
  </table>
  <p class="rc-words">${amountInWords(p.amount_paise)}</p>
  <section class="rc-pay"><h3>Payment details</h3>
    <p>Method: ${p.method === 'razorpay' ? 'Online (Razorpay)' : 'UPI'}${p.utr ? html` · UTR: <span class="mono">${p.utr}</span>` : ''}${p.razorpay_payment_id ? html` · Payment ID: <span class="mono">${p.razorpay_payment_id}</span>` : ''}</p></section>
  <footer class="rc-foot">
    <p>This is a computer-generated receipt and does not need a signature. Ad placement fees are non-refundable once the ad is live, as per our <a href="/refund-policy">Refund policy</a> and <a href="/terms">Terms of use</a>.</p>
    <p>Questions? ${s.grievance_email || s.support_email ? html`Write to ${s.grievance_email || s.support_email}` : 'Contact us from the Contact page'}.</p>
  </footer>
</main>
</body></html>`;
}

module.exports = { receiptData, receiptPage, amountInWords };
