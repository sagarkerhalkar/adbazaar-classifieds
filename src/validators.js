'use strict';
// Input validation for KYC and ads.

// Verhoeff checksum — every valid Aadhaar number passes it.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];

function isValidAadhaar(num) {
  const s = String(num || '').replace(/\s+/g, '');
  if (!/^[2-9]\d{11}$/.test(s)) return false;
  let c = 0;
  s.split('').reverse().forEach((ch, i) => { c = D[c][P[i % 8][Number(ch)]]; });
  return c === 0;
}

const isValidPAN = (s) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(s || '').toUpperCase());
const isValidPhone = (s) => /^[6-9]\d{9}$/.test(normalizePhone(s));
const isValidPincode = (s) => /^[1-9]\d{5}$/.test(String(s || '').trim());
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

function normalizePhone(s) {
  let p = String(s || '').replace(/[^\d]/g, '');
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2);
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
  return p;
}

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

// ---- Age (India time) ----
const MIN_AGE = 18;
const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Whole years between a YYYY-MM-DD birth date and today (India time). null if the date is invalid. */
function ageFromDob(dob, today = todayIST()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // e.g. 31 Feb
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  return age;
}

/** Error message for a date of birth, or null if the person is 18–100. */
function checkDob(dob) {
  const age = ageFromDob(dob);
  if (age == null) return 'Enter your date of birth.';
  if (age < 0 || age > 100) return 'Enter a correct date of birth.';
  if (age < MIN_AGE) return `Sorry — you must be ${MIN_AGE} years or older to post ads.`;
  return null;
}

/** Latest allowed birth date for the date picker (exactly 18 years ago). */
function maxDob() {
  const [y, m, d] = todayIST().split('-');
  return `${Number(y) - MIN_AGE}-${m}-${d}`;
}

function validatePassword(pw) {
  if (String(pw || '').length < 6) return 'Password must be at least 6 characters.';
  return null;
}


// Words that are never allowed in an ad (sexual services). The ad is refused; the admin can still block anything else.
const BANNED_AD_WORDS = /\b(escorts?|call\s*girls?|sex(ual)?\s*services?|body\s*to\s*body|happy\s*ending|nude|nudes|erotic|sensual\s*massage|adult\s*services?|hookups?|one\s*night|prostitut\w*|nsfw|porn\w*|xxx)\b/i;
function bannedAdText(...texts) {
  // The editable list in Settings → Approvals (src/safety.js); the fixed pattern above is a fallback.
  try { return require('./safety').match(...texts); } catch { const m = BANNED_AD_WORDS.exec(texts.join(' ')); return m ? m[0] : null; }
}

module.exports = {
  bannedAdText, isValidAadhaar, isValidPAN, isValidPhone, isValidPincode, isValidEmail, normalizePhone, str, validatePassword, ageFromDob, checkDob, maxDob, MIN_AGE };
