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

function validatePassword(pw) {
  if (String(pw || '').length < 8) return 'Password must be at least 8 characters.';
  return null;
}

module.exports = { isValidAadhaar, isValidPAN, isValidPhone, isValidPincode, isValidEmail, normalizePhone, str, validatePassword };
