'use strict';
// One ID document for age verification: the client chooses Aadhaar, PAN or Passport,
// types its number and uploads a photo of it. Only what is needed is stored:
// Aadhaar → last 4 digits only (UIDAI rules); PAN / Passport → the number.

const { isValidAadhaar, isValidPAN } = require('./validators');

const ID_TYPES = {
  aadhaar: {
    label: 'Aadhaar card', short: 'Aadhaar', placeholder: 'XXXX XXXX XXXX', inputmode: 'numeric', maxlength: 14,
    hint: '12 digits. We check it is valid but store only the last 4 digits. A masked Aadhaar photo is fine.',
    front: 'Front side (photo, name, date of birth)', back: 'Back side (address)', needBack: true,
  },
  pan: {
    label: 'PAN card', short: 'PAN', placeholder: 'ABCDE1234F', inputmode: 'text', maxlength: 10,
    hint: '10 characters, like ABCDE1234F. Your date of birth is printed on the card.',
    front: 'Front side of the PAN card', back: '', needBack: false,
  },
  passport: {
    label: 'Passport', short: 'Passport', placeholder: 'A1234567', inputmode: 'text', maxlength: 9,
    hint: '1 letter + 7 digits, like A1234567 (Indian passport).',
    front: 'First page (photo, name, date of birth)', back: 'Last page (address)', needBack: true,
  },
};

const isValidPassport = (s) => /^[A-Z][0-9]{7}$/.test(String(s || '').toUpperCase().replace(/\s+/g, ''));

/**
 * Check an ID number for the chosen type.
 * @returns {{ error: string } | { stored: string, last4: string, pan: string }}
 */
function checkId(type, raw) {
  const t = ID_TYPES[type];
  if (!t) return { error: 'Choose your ID document: Aadhaar, PAN or Passport.' };
  const v = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!v) return { error: `Enter your ${t.short} number.` };
  if (type === 'aadhaar') {
    if (!isValidAadhaar(v)) return { error: 'The Aadhaar number is not valid. Please check it.' };
    return { stored: v.slice(-4), last4: v.slice(-4), pan: '' };
  }
  if (type === 'pan') {
    if (!isValidPAN(v)) return { error: 'The PAN number is not valid (format: ABCDE1234F).' };
    return { stored: v, last4: '', pan: v };
  }
  if (!isValidPassport(v)) return { error: 'The passport number is not valid (format: A1234567).' };
  return { stored: v, last4: '', pan: '' };
}

/** "Aadhaar XXXX XXXX 1234" / "PAN ABCDE1234F" / "Passport A1234567" for a client row (also handles older accounts). */
function describeId(c) {
  if (c.id_type === 'aadhaar') return `Aadhaar XXXX XXXX ${c.id_number}`;
  if (c.id_type === 'pan') return `PAN ${c.id_number}`;
  if (c.id_type === 'passport') return `Passport ${c.id_number}`;
  const parts = [];
  if (c.aadhaar_last4) parts.push(`Aadhaar XXXX XXXX ${c.aadhaar_last4}`);
  if (c.pan_number) parts.push(`PAN ${c.pan_number}`);
  return parts.join(' · ') || '—';
}

/** What to upload for this ID: Aadhaar → front + back, Passport → first + last page, PAN → front only. */
const sides = (type) => { const t = ID_TYPES[type] || ID_TYPES.aadhaar; return { front: t.front, back: t.back, needBack: t.needBack }; };

module.exports = { ID_TYPES, checkId, describeId, isValidPassport, sides };
