'use strict';
// Home page content that the admin can change (Admin → Home page): banners, texts, which sections show, popular cities.
// Stored as one JSON value in the settings table.

const { getSettings, setSetting } = require('./db');

const THEMES = ['peacock', 'marigold', 'green', 'berry', 'ink'];

const DEFAULTS = {
  announcement: '',
  slides: [
    { title: 'Sell anything in minutes', subtitle: 'Post your ad and get calls from real buyers near you.', button: 'Post your ad', link: '/client/register', theme: 'peacock', art: '📱', image: '', active: true },
    { title: 'Find trusted local services', subtitle: 'Tutors, repairs, beauty, events and more. Call directly, no middleman.', button: 'Explore services', link: '/?kind=service', theme: 'marigold', art: '🛠️', image: '', active: true },
    { title: 'Be seen first with TOP ads', subtitle: 'Choose your time slots and your ad shows at the very top.', button: 'See how', link: '/client/register', theme: 'green', art: '★', image: '', active: true },
  ],
  show: { categories: true, top: true, cities: true, sell: true },
  cities: 'Mumbai, Delhi, Bengaluru, Pune, Hyderabad, Chennai, Kolkata, Ahmedabad, Jaipur, Nagpur, Nashik, Surat',
  top_title: 'TOP ads',
  fresh_title: 'Fresh recommendations',
  sell_title: 'Have something to sell?',
  sell_text: 'Post your ad in about 3 minutes and reach buyers in your city.',
  footer_about: 'A friendly marketplace to buy, sell and find local services across India.',
};

function clean(raw) {
  const d = JSON.parse(JSON.stringify(DEFAULTS));
  if (!raw || typeof raw !== 'object') return d;
  for (const k of ['announcement', 'cities', 'top_title', 'fresh_title', 'sell_title', 'sell_text', 'footer_about']) if (typeof raw[k] === 'string') d[k] = raw[k];
  if (raw.show && typeof raw.show === 'object') for (const k of Object.keys(d.show)) if (typeof raw.show[k] === 'boolean') d.show[k] = raw.show[k];
  if (Array.isArray(raw.slides)) {
    d.slides = raw.slides.slice(0, 8).map((s) => ({
      title: String(s.title || '').slice(0, 80), subtitle: String(s.subtitle || '').slice(0, 160),
      button: String(s.button || '').slice(0, 30), link: safeLink(s.link), theme: THEMES.includes(s.theme) ? s.theme : 'peacock',
      art: String(s.art || '').slice(0, 4), image: String(s.image || '').replace(/[^A-Za-z0-9._-]/g, ''), active: s.active !== false,
    }));
  }
  return d;
}

// Only links inside the site, or normal web links.
function safeLink(v) {
  const s = String(v || '').trim().slice(0, 300);
  if (/^\/(?!\/)/.test(s) || /^https?:\/\//i.test(s)) return s;
  return '';
}

function getHome(settings = getSettings()) {
  let raw = null;
  try { raw = settings.home_config ? JSON.parse(settings.home_config) : null; } catch { raw = null; }
  return clean(raw);
}

function saveHome(cfg) { setSetting('home_config', JSON.stringify(clean(cfg))); }

const cityList = (cfg) => cfg.cities.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 24);

module.exports = { getHome, saveHome, cityList, safeLink, THEMES, DEFAULTS };
