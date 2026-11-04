'use strict';
// Brand: site name, logo and colour theme — the OWNER changes them in Admin → Settings → Staff & brand.
// Each theme is a dark main colour (header, buttons) and a bright accent (Post ad, TOP, badges).
// Every pair was checked for readable contrast (white on main ≥ 4.5:1, dark main on accent ≥ 4.5:1).

const THEMES = {
  peacock: { label: 'Peacock & marigold', main: '#0a4d68', mainD: '#073a4f', mainL: '#e3f0f5', sky: '#088395', acc: '#ffb000', accD: '#e69a00', accL: '#fff4d6', acc2: '#ffd46b' },
  indigo: { label: 'Indigo & saffron', main: '#3730a3', mainD: '#252070', mainL: '#e8e7fb', sky: '#4f46e5', acc: '#ff9f1c', accD: '#f08700', accL: '#fff1dc', acc2: '#ffc56b' },
  emerald: { label: 'Emerald & lime', main: '#065f46', mainD: '#053b2e', mainL: '#e1f5ee', sky: '#0f766e', acc: '#c6f432', accD: '#a8d81e', accL: '#f4fbdc', acc2: '#dcff7a' },
  maroon: { label: 'Maroon & gold', main: '#7a1f2b', mainD: '#4f121b', mainL: '#f8e6e8', sky: '#a3283a', acc: '#f5b82e', accD: '#dc9f14', accL: '#fdf2d8', acc2: '#ffd77a' },
  midnight: { label: 'Midnight & coral', main: '#1e293b', mainD: '#0f172a', mainL: '#e6e9ef', sky: '#334155', acc: '#ff8a65', accD: '#f4704a', accL: '#ffe9e1', acc2: '#ffb59d' },
  ocean: { label: 'Ocean & sunshine', main: '#075985', mainD: '#0b3a57', mainL: '#e0f0fa', sky: '#0369a1', acc: '#fde047', accD: '#facc15', accL: '#fefbe0', acc2: '#fff08a' },
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
const theme = (s) => THEMES[s && s.brand_theme] || THEMES.peacock;

/** CSS that switches the whole site to the chosen theme ('' for the default theme). */
function themeCss(s) {
  const key = s && s.brand_theme;
  if (!key || key === 'peacock' || !THEMES[key]) return '';
  const t = THEMES[key];
  return `:root{--peacock:${t.main};--peacock-d:${t.mainD};--peacock-l:${t.mainL};--sky:${t.sky};--marigold:${t.acc};--marigold-d:${t.accD};--marigold-l:${t.accL};--marigold-2:${t.acc2};--peacock-rgb:${rgb(t.main)};--marigold-rgb:${rgb(t.acc)};--on-accent:${t.mainD}}`;
}

module.exports = { THEMES, theme, themeCss };
