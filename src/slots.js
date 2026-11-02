'use strict';
// TOP-ad time slots: the day (India time) is split into 8 slots of 3 hours.
// An ad's TOP slots are stored as a bitmask (bit 0 = 12 AM–3 AM … bit 7 = 9 PM–12 AM).
// During its slot(s) the ad is shown in the "TOP ads" section; outside them it ranks normally.

const { db } = require('./db');

const SLOTS = [
  { slot: 0, label: '12 AM – 3 AM', short: '12–3 AM' },
  { slot: 1, label: '3 AM – 6 AM', short: '3–6 AM' },
  { slot: 2, label: '6 AM – 9 AM', short: '6–9 AM' },
  { slot: 3, label: '9 AM – 12 PM', short: '9 AM–12 PM' },
  { slot: 4, label: '12 PM – 3 PM', short: '12–3 PM' },
  { slot: 5, label: '3 PM – 6 PM', short: '3–6 PM' },
  { slot: 6, label: '6 PM – 9 PM', short: '6–9 PM' },
  { slot: 7, label: '9 PM – 12 AM', short: '9 PM–12 AM' },
];
const ALL_SLOTS = 0xff;
const IST_OFFSET_MS = 5.5 * 3600_000;

// Which slot is running right now (India time).
function currentSlot(now = Date.now()) {
  const msIntoDay = ((now + IST_OFFSET_MS) % 86400_000 + 86400_000) % 86400_000;
  return Math.floor(msIntoDay / (3 * 3600_000));
}

const inSlot = (mask, slot) => ((Number(mask) || 0) >> slot & 1) === 1;

function maskFrom(list) {
  let m = 0;
  for (const v of [].concat(list || [])) {
    const n = parseInt(v, 10);
    if (n >= 0 && n <= 7) m |= 1 << n;
  }
  return m;
}

function slotLabels(mask, { short = true } = {}) {
  mask = Number(mask) || 0;
  if (mask === ALL_SLOTS) return ['All day'];
  return SLOTS.filter((s) => inSlot(mask, s.slot)).map((s) => (short ? s.short : s.label));
}

// Slot prices (per day) set by the admin.
function slotPrices() {
  const rows = db.prepare('SELECT * FROM top_slots ORDER BY slot').all();
  return SLOTS.map((s) => {
    const r = rows.find((x) => x.slot === s.slot) || { price_per_day_paise: 0, is_active: 0 };
    return { ...s, price_per_day_paise: r.price_per_day_paise, is_active: r.is_active };
  });
}

// Keep only slots that are on sale.
function sanitizeMask(mask) {
  let m = 0;
  for (const s of slotPrices()) if (s.is_active && inSlot(mask, s.slot)) m |= 1 << s.slot;
  return m;
}

// Extra cost of the chosen TOP slots for the whole plan period.
function topCost(mask, days) {
  return slotPrices().reduce((sum, s) => sum + (s.is_active && inSlot(mask, s.slot) ? s.price_per_day_paise * days : 0), 0);
}

module.exports = { SLOTS, ALL_SLOTS, currentSlot, inSlot, maskFrom, slotLabels, slotPrices, sanitizeMask, topCost };
