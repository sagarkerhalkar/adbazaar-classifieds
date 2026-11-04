'use strict';
// Real sample photos that ship with the app (public/photos, Unsplash License — see public/photos/CREDITS.md).
// Used for the home-page banners, the category tiles, ads without a picture and the test ads.

const fs = require('node:fs');
const path = require('node:path');
const { assetUrl } = require('./lib/files');

const DIR = path.join(__dirname, '..', 'public', 'photos');
const exists = (name) => fs.existsSync(path.join(DIR, `${name}.jpg`));
const photoUrl = (name) => assetUrl(`/public/photos/${name}.jpg`);
const photoFile = (name) => path.join(DIR, `${name}.jpg`);

// Category name/slug words → photo. The first match wins; anything else gets DEFAULT_CAT.
const CATEGORY_RULES = [
  [/spa|massage|wellness/i, 'spa-face-massage'],
  [/beauty|salon|makeup|parlour|parlor/i, 'salon-hair'],
  [/mobile|phone|electronic|gadget/i, 'phone-charger'],
  [/laptop|computer/i, 'laptop-open'],
  [/vehicle|car|bike|scooter|motor/i, 'ebike-1'],
  [/propert|rent|real.?estate|house|flat/i, 'property-apartment'],
  [/job|career|hiring/i, 'people-team-handshake'],
  [/home.?service|repair|plumb|electric/i, 'repair-board'],
  [/furniture|home|decor/i, 'living-room'],
  [/fashion|cloth|wear/i, 'fashion-rack'],
  [/educat|class|tuition|course|coach/i, 'people-whiteboard'],
  [/business|industr|office/i, 'office-room'],
  [/health|fitness|gym|sport/i, 'people-runner'],
  [/event|catering|wedding|party/i, 'event-table'],
  [/toy|kid|baby|school/i, 'pottery-class'],
  [/pet|animal|dog|cat\b/i, 'people-woman-dress'],
  [/book|hobb|music/i, 'pottery-class'],
];
const DEFAULT_CAT = 'leather-bag';

function categoryPhotoName(cat) {
  const text = `${cat && cat.name ? cat.name : ''} ${cat && cat.slug ? cat.slug : ''}`;
  for (const [re, name] of CATEGORY_RULES) if (re.test(text)) return name;
  return DEFAULT_CAT;
}

// Home-page banner photos, used when a banner has no uploaded picture of its own.
const BANNER_DEFAULTS = ['people-women-laptop', 'people-team-handshake', 'people-meeting', 'people-man-cafe'];

/** Names of all built-in photos, e.g. "people-women-laptop". */
const list = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)).sort();
/** "people-women-laptop" → "People: women laptop" (for menus). */
const label = (name) => { const [g, ...rest] = name.split('-'); return `${g[0].toUpperCase()}${g.slice(1)}: ${rest.join(' ') || g}`; };

module.exports = { photoUrl, photoFile, exists, list, label, categoryPhotoName, BANNER_DEFAULTS, DIR };
