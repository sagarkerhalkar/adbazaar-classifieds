'use strict';
// Real photos for the test ads and the home-page banners, downloaded on YOUR computer from Pexels
// (free to use: https://www.pexels.com/license/). If the internet is off, illustrations are used instead.

const PEXELS = (id, w = 1200) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

// Two photos per test ad, in the same order as the ADS list in scripts/seed-test.js
const AD_PHOTOS = {
  iphone: [1156684, 48605], tv: [6020432, 19866446], repair: [6754839, 13625784], headphones: [815494, 2046807],
  tuition: [4260479, 41519], english: [3769717, 5908493], drawing: [7552568, 10998829], scooter: [3061638, 17852338],
  car: [7744713, 12821565], carwash: [12821565, 7744713], makeup: [20593111, 30005378], salon: [30005378, 20593111],
  dresser: [1827054, 6020432], laptop: [13068694, 5060973],
};
// People using phones and laptops — for the home-page banners
const BANNER_PHOTOS = [4307868, 10998829, 17390731, 5882535];

async function download(id, w = 1200, timeoutMs = 15000) {
  try {
    const r = await fetch(PEXELS(id, w), { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'AdBazaar-setup/1.0' } });
    if (!r.ok || !/image\//.test(r.headers.get('content-type') || '')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 8000 ? buf : null;
  } catch { return null; }
}

/** Download many photos at once; returns Map(id → Buffer) for the ones that worked. */
async function downloadAll(ids, w) {
  const uniq = [...new Set(ids)];
  const out = new Map();
  await Promise.all(uniq.map(async (id) => { const b = await download(id, w); if (b) out.set(id, b); }));
  return out;
}

module.exports = { AD_PHOTOS, BANNER_PHOTOS, download, downloadAll, PEXELS };
