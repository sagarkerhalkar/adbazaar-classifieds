// A live 3D globe for the home page: a sphere of dots (the continents) that turns slowly,
// glowing lights in world cities (gold where this site has live ads) and light trails between them. Drag to spin it.
// No libraries; it pauses when off screen or when the tab is hidden; a still picture when motion is reduced.
(function () {
  'use strict';
  const canvas = document.querySelector('[data-globe]'); if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D2R = Math.PI / 180;

  // Rough outline of India (longitude, latitude), drawn as land like every other country.
  const INDIA = [[68.2, 23.7], [68.8, 22.3], [70.0, 20.8], [72.6, 21.1], [72.8, 19.0], [73.3, 16.5], [74.0, 14.8], [74.8, 12.9], [75.8, 11.2], [76.3, 9.5],
    [77.5, 8.1], [78.2, 8.9], [79.3, 10.3], [79.9, 12.0], [80.3, 13.1], [80.2, 15.5], [81.0, 16.3], [82.3, 17.0], [83.3, 17.7], [84.9, 19.3], [86.5, 20.0],
    [87.0, 21.5], [88.2, 21.6], [89.0, 22.0], [88.7, 24.3], [88.1, 25.2], [88.4, 26.4], [92.0, 26.8], [95.8, 27.9], [97.3, 28.1], [96.2, 29.3], [93.5, 28.6],
    [92.0, 27.8], [88.8, 27.9], [88.1, 26.6], [85.0, 26.6], [83.3, 27.4], [81.0, 28.4], [80.1, 28.8], [80.6, 30.2], [79.0, 31.0], [78.3, 32.5], [79.5, 32.7],
    [78.0, 35.4], [77.0, 35.6], [75.0, 36.8], [74.0, 35.0], [73.5, 34.0], [74.0, 33.0], [74.6, 32.0], [74.6, 31.0], [74.5, 30.0], [73.0, 29.5], [71.9, 28.0],
    [70.3, 27.0], [70.0, 25.4], [71.1, 24.4], [68.8, 24.3]];
  // Very rough outlines of the land around India, so the globe reads as Earth (dots only, no exact borders).
  const LAND = [
    [[-17, 21], [-16, 28], [-10, 30], [-6, 35.8], [10, 37], [11, 33], [20, 31], [25, 31.5], [32, 31.3], [35, 28], [37, 22], [43, 12], [51, 12], [48, 5], [40, -3], [40.5, -15], [35.5, -24], [32.5, -29], [27, -34], [20, -35], [18, -32], [15, -27], [12, -17], [13, -8], [9, -1], [9.5, 4], [4, 6.3], [-4, 5], [-8, 4.5], [-13, 8], [-17, 14.5]],
    [[35, 28], [38, 22], [43, 13], [45, 13], [52, 16.5], [57, 19], [59.5, 22.5], [56, 26], [51.5, 24], [50, 26.5], [48, 30], [44, 31], [39, 32], [35, 32]],
    [[-9.5, 37], [-9, 43], [-2, 43.5], [-1.5, 46.5], [-4.5, 48.5], [2, 51], [5, 53.5], [8, 54.5], [8, 57.5], [11, 59], [5, 62], [14, 68], [25, 71], [31, 70], [30, 60], [28, 56], [25, 54], [20, 54], [14, 54], [24, 46], [28, 44], [26, 40], [23, 38], [20, 40], [19, 42], [16, 41], [18, 40], [15.5, 38], [12, 42], [8.5, 44], [4, 43.5], [3, 42], [0, 39], [-2, 36.8], [-5.5, 36]],
    [[26, 40], [36, 36.5], [36, 32], [44, 31], [48, 30], [50, 26.5], [56, 26], [57, 25.5], [62, 25], [66.5, 25.3], [68.2, 23.7], [70.3, 27], [71.9, 28], [74.6, 31], [73.5, 34], [75, 36.8], [78, 35.4], [79.5, 32.7], [80.6, 30.2], [88.8, 27.9], [92, 27.8], [97.3, 28.1], [98, 24], [94, 21], [92.5, 20.5], [94.5, 16], [97.7, 16.5], [98.5, 10], [100.5, 13.5], [102.5, 12.5], [105, 8.6], [109, 11.5], [108, 16], [106.5, 20], [110, 21.5], [113.5, 22.3], [117, 23.5], [120, 26.5], [122, 30], [121, 32.5], [119.5, 35], [122, 37], [121, 39], [124, 40], [127, 38], [129, 35.2], [129.5, 42.5], [135, 43.5], [141, 48], [140, 53], [135, 54.5], [141, 59], [155, 59], [162, 61.5], [170, 60], [179, 65], [179, 71], [160, 70], [140, 72.5], [113, 73.5], [105, 77.5], [90, 75.5], [80, 73.5], [70, 73], [66, 69], [60, 69.5], [50, 68], [44, 68.5], [40, 66], [34, 69], [31, 70], [30, 60], [28, 56], [33, 52], [37, 47], [40, 47], [37, 45], [41.5, 41.5], [36, 41.8], [29, 41]],
    [[114, -22], [114, -34], [118, -35], [124, -33.5], [129, -31.5], [132, -31.5], [135, -34.5], [138, -35], [141, -38], [147, -38.5], [150, -37.5], [153, -31], [153.5, -25], [150, -22], [146, -19], [145.5, -15], [142.5, -10.7], [141.5, -17], [136, -12], [132, -11.5], [129, -15], [125, -14.5], [122, -17.5], [119, -20]],
    [[79.8, 9.8], [81.9, 7.5], [81.6, 6.2], [80, 6], [79.7, 8]],
    [[95, 5.5], [98, 4], [104, 1.5], [106, -3], [102, -4], [98, 0], [95, 4]],
    [[108.5, 1], [111, -3], [116, -4], [119, 1], [117, 6.5], [113, 3.5]],
    // North America
    [[-168, 66], [-162, 70], [-156, 71.3], [-141, 69.6], [-128, 70], [-115, 68.8], [-95, 72], [-82, 73], [-80, 63], [-94, 59], [-92, 57], [-82, 55], [-78, 52], [-64, 60], [-61, 56], [-56, 52], [-60, 46.5], [-66, 44.5], [-70, 42], [-74, 40.5], [-76, 38], [-76, 35], [-81, 31.5], [-80.5, 25.5], [-82.5, 27.5], [-84, 30], [-89, 30.2], [-94, 29.5], [-97.5, 26], [-97.5, 22], [-95, 18.5], [-91, 18.5], [-87, 21.5], [-88, 16], [-83.5, 15], [-83.5, 11], [-79.5, 9], [-77.5, 8], [-80.5, 7.5], [-85.5, 10], [-87.5, 13], [-92, 14.5], [-96, 15.7], [-101, 17.5], [-105.5, 20.5], [-105.5, 23], [-109.5, 26.5], [-112.5, 29.5], [-114.5, 31], [-117, 32.5], [-120.5, 34.5], [-122.5, 37.5], [-124, 40.5], [-124.5, 43], [-124, 46.5], [-124.7, 48.4], [-127, 50.5], [-130.5, 54], [-134.5, 58], [-140, 60], [-146, 61], [-152, 59], [-157, 57.5], [-162, 55], [-158, 58.5], [-162, 60], [-165, 62.5], [-164.5, 64.5]],
    // South America
    [[-77.5, 8], [-75, 11], [-71.5, 12.5], [-67, 10.7], [-61, 10.7], [-57, 6], [-52, 4.5], [-50, 1.5], [-48, -1], [-44, -2.5], [-38.5, -3.7], [-35, -5.5], [-35, -9], [-37.5, -12.5], [-39, -15], [-40, -20], [-41, -22.5], [-44, -23], [-48, -26], [-48.5, -28.5], [-50.5, -31], [-53, -34], [-57, -35], [-58, -38.5], [-62, -39], [-65, -41], [-64.5, -42.5], [-67, -46], [-66, -48], [-69, -50.5], [-68.5, -52.5], [-71, -54], [-74, -52], [-75.5, -47], [-74, -43], [-73.5, -37], [-71.5, -30], [-71, -25], [-70.3, -18.5], [-75, -15.5], [-76.5, -13], [-79, -8], [-81, -5.5], [-80.5, -2], [-80, 1], [-78.5, 2.5], [-77.5, 5]],
    [[-73, 78], [-60, 82], [-30, 83.5], [-20, 81.5], [-18, 77], [-20, 72], [-22, 70], [-32, 68], [-40, 65], [-43, 60], [-48, 61], [-52, 64.5], [-54, 68], [-56, 72.5], [-66, 76]], // Greenland
    [[-5.5, 50], [1.5, 51], [1.7, 52.7], [-0.5, 54.5], [-2, 55.8], [-1.8, 57.6], [-3.5, 58.6], [-5, 58.6], [-6, 57], [-5.5, 55.5], [-3, 54.5], [-4.5, 53.2], [-3, 52], [-5, 51.7]], // Britain
    [[-10, 51.6], [-6, 52], [-6, 54.5], [-8, 55.3], [-10, 54.2]], // Ireland
    [[-24, 65.5], [-18, 66.5], [-13.5, 65.5], [-15, 64.3], [-21, 63.3], [-24, 64]], // Iceland
    [[130, 31], [131.5, 31.5], [132, 33.8], [135, 33.5], [137, 34.6], [140, 35], [141, 38], [142, 40], [141.5, 41.5], [140, 40.5], [139.5, 38], [137, 37], [135.5, 35.6], [132.5, 35.4], [130.8, 34]], // Japan
    [[140, 41.5], [141.5, 42.5], [143.5, 42], [145.5, 43.3], [144.5, 44.2], [141.8, 45.5], [141, 43.3]],
    [[44, -25], [47, -25], [49.5, -17], [50, -15.5], [49.3, -12], [47.5, -13.5], [44, -16.5], [43.5, -21]], // Madagascar
    [[172.5, -34.5], [174.5, -36], [178, -37.7], [176.5, -40], [175, -41.5], [172.7, -40.5], [171.5, -42], [170, -44], [167, -46.3], [169, -46.6], [171.3, -44.5], [173, -42.5], [174, -41]], // New Zealand
    [[120, 18.5], [122, 18.5], [124, 13.5], [126, 9], [125.5, 6], [122, 7], [121.5, 10], [120, 14], [120.5, 16]], // Philippines
    [[131, -1], [135, -3.5], [141, -2.6], [145.5, -5], [150, -10.5], [146, -8.5], [141, -9], [138, -8.5], [135, -4.5], [132, -2.8]], // New Guinea
  ];
  const CITY = {
    mumbai: [19.08, 72.88], delhi: [28.61, 77.21], 'new delhi': [28.61, 77.21], bengaluru: [12.97, 77.59], bangalore: [12.97, 77.59], hyderabad: [17.39, 78.49],
    chennai: [13.08, 80.27], kolkata: [22.57, 88.36], pune: [18.52, 73.86], ahmedabad: [23.02, 72.57], jaipur: [26.91, 75.79], lucknow: [26.85, 80.95],
    nagpur: [21.15, 79.09], indore: [22.72, 75.86], bhopal: [23.26, 77.41], surat: [21.17, 72.83], nashik: [20.0, 73.79], kochi: [9.93, 76.27],
    guwahati: [26.14, 91.74], chandigarh: [30.73, 76.78], patna: [25.59, 85.14], bhubaneswar: [20.3, 85.82], goa: [15.49, 73.83], coimbatore: [11.02, 76.96],
    vadodara: [22.31, 73.18], visakhapatnam: [17.69, 83.22], thane: [19.22, 72.98], noida: [28.54, 77.39], gurugram: [28.46, 77.03], aurangabad: [19.88, 75.34],
    srinagar: [34.08, 74.8], thiruvananthapuram: [8.52, 76.94], 'navi mumbai': [19.03, 73.03], ranchi: [23.34, 85.31], raipur: [21.25, 81.63], dehradun: [30.32, 78.03],
    amritsar: [31.63, 74.87], ludhiana: [30.9, 75.86], kanpur: [26.45, 80.33], varanasi: [25.32, 82.97], agra: [27.18, 78.01], madurai: [9.93, 78.12], mysuru: [12.3, 76.64],
    london: [51.51, -0.13], paris: [48.86, 2.35], berlin: [52.52, 13.4], madrid: [40.42, -3.7], rome: [41.9, 12.5], zurich: [47.37, 8.54], geneva: [46.2, 6.14],
    amsterdam: [52.37, 4.9], moscow: [55.76, 37.62], istanbul: [41.01, 28.98], dubai: [25.2, 55.27], 'abu dhabi': [24.45, 54.38], riyadh: [24.71, 46.68], doha: [25.29, 51.53],
    cairo: [30.04, 31.24], lagos: [6.52, 3.38], nairobi: [-1.29, 36.82], johannesburg: [-26.2, 28.05], 'cape town': [-33.92, 18.42], 'new york': [40.71, -74.0],
    'los angeles': [34.05, -118.24], chicago: [41.88, -87.63], toronto: [43.65, -79.38], vancouver: [49.28, -123.12], 'mexico city': [19.43, -99.13], 'san francisco': [37.77, -122.42],
    miami: [25.76, -80.19], 'sao paulo': [-23.55, -46.63], 'são paulo': [-23.55, -46.63], 'buenos aires': [-34.6, -58.38], lima: [-12.05, -77.04], bogota: [4.71, -74.07],
    tokyo: [35.68, 139.69], seoul: [37.57, 126.98], beijing: [39.9, 116.4], shanghai: [31.23, 121.47], 'hong kong': [22.32, 114.17], singapore: [1.35, 103.82],
    bangkok: [13.76, 100.5], 'kuala lumpur': [3.14, 101.69], jakarta: [-6.2, 106.85], manila: [14.6, 120.98], sydney: [-33.87, 151.21], melbourne: [-37.81, 144.96],
    auckland: [-36.85, 174.76], karachi: [24.86, 67.0], dhaka: [23.81, 90.41], kathmandu: [27.72, 85.32], colombo: [6.93, 79.86],
  };
  // World cities that always glow, so the globe reads as one world marketplace.
  const HUBS = ['london', 'new york', 'dubai', 'singapore', 'tokyo', 'paris', 'sydney', 'toronto', 'sao paulo', 'johannesburg', 'nairobi', 'zurich', 'los angeles', 'hong kong', 'istanbul', 'mexico city', 'mumbai', 'delhi'];
  const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]; const [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c; } return c; };

  // Dots on the sphere (even spread); dots on land are brighter, so the continents show.
  const N = 6400; const dots = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const th = Math.PI * (3 - Math.sqrt(5)) * i;
    const lat = Math.asin(y) / D2R; const lon = ((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) / D2R) + 540) % 360 - 180;
    dots.push({ lat, lon, land: inPoly(lon, lat, INDIA) || LAND.some((poly) => inPoly(lon, lat, poly)) });
  }

  // Gold lights: cities where this site has live ads. Soft lights: world hubs.
  let names = []; try { names = JSON.parse(canvas.dataset.cities || '[]'); } catch { names = []; }
  const key = (c) => c[0].toFixed(2) + ',' + c[1].toFixed(2);
  const adCities = names.map((n) => CITY[String(n).toLowerCase()]).filter(Boolean);
  const adKeys = new Set(adCities.map(key));
  let cities = adCities.concat(HUBS.map((h) => CITY[h]));
  cities = cities.filter((c, i, a) => a.findIndex((d) => key(d) === key(c)) === i).slice(0, 34).map((c) => Object.assign([c[0], c[1]], { ad: adKeys.has(key(c)) }));

  const css = getComputedStyle(document.documentElement);
  const gold = (css.getPropertyValue('--marigold').trim() || '#ffb000');
  let W = 0; let H = 0; let R = 0; let dpr = 1;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect(); W = r.width; H = r.height; R = Math.min(W, H) * 0.36;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let rotLon = 20; let phase = 0; let userOff = 0; const tilt = 16 * D2R; let drag = null; let spinV = 0;
  function project(lat, lon) {
    const la = lat * D2R; const lo = (lon - rotLon) * D2R;
    let x = Math.cos(la) * Math.sin(lo); let y = Math.sin(la); let z = Math.cos(la) * Math.cos(lo);
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt); const z2 = y * Math.sin(tilt) + z * Math.cos(tilt); y = y2; z = z2;
    return { x: W / 2 + x * R, y: H / 2 - y * R, z };
  }
  // Light trails between cities
  const trails = []; let nextTrail = 0;
  function addTrail(t) {
    if (cities.length < 2) return;
    const a = cities[Math.floor(Math.random() * cities.length)]; let b = a; while (b === a) b = cities[Math.floor(Math.random() * cities.length)];
    trails.push({ a, b, t0: t, dur: 1800 + Math.random() * 1400 });
  }
  function slerp(a, b, k) {
    const toV = ([lat, lon]) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
    const va = toV(a); const vb = toV(b); const d = Math.acos(Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])) || 1e-6;
    const s1 = Math.sin((1 - k) * d) / Math.sin(d); const s2 = Math.sin(k * d) / Math.sin(d);
    const v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
    return [Math.asin(v[2]) / D2R, Math.atan2(v[1], v[0]) / D2R, d];
  }

  // A tilted orbit ring with a light moving along it (back half behind the globe, front half in front).
  function orbit(t, front) {
    const rx = R * 1.32; const ry = R * 0.34; const rot = -0.32; const cx = W / 2; const cy = H / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.strokeStyle = front ? 'rgba(255, 210, 120, .55)' : 'rgba(150, 220, 240, .18)'; ctx.lineWidth = front ? 1.4 : 1; ctx.stroke();
    const a = (t / 2600) % (Math.PI * 2); const sx = Math.cos(a) * rx; const sy = Math.sin(a) * ry;
    if ((sy > 0) === front) { ctx.beginPath(); ctx.arc(sx, sy, front ? 3.6 : 2.4, 0, Math.PI * 2); ctx.fillStyle = front ? '#fff3d1' : 'rgba(255, 243, 209, .4)'; ctx.shadowColor = gold; ctx.shadowBlur = front ? 16 : 0; ctx.fill(); ctx.shadowBlur = 0; }
    ctx.restore();
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    orbit(t, false);
    // the sphere itself
    const g = ctx.createRadialGradient(W / 2 - R * 0.35, H / 2 - R * 0.4, R * 0.1, W / 2, H / 2, R);
    g.addColorStop(0, 'rgba(40, 120, 150, .55)'); g.addColorStop(1, 'rgba(7, 40, 60, .9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2); ctx.fill();
    // dots
    for (const d of dots) {
      const p = project(d.lat, d.lon); if (p.z <= 0) continue;
      const a = 0.25 + p.z * 0.75;
      if (d.land) { ctx.fillStyle = `rgba(150, 230, 240, ${a * 0.75})`; ctx.fillRect(p.x - 1.1, p.y - 1.1, 2.2, 2.2); }
      else { ctx.fillStyle = `rgba(140, 200, 225, ${a * 0.22})`; ctx.fillRect(p.x - 0.7, p.y - 0.7, 1.4, 1.4); }
    }
    // trails
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i]; const k = (t - tr.t0) / tr.dur; if (k > 1.35) { trails.splice(i, 1); continue; }
      ctx.beginPath(); let started = false;
      const head = Math.min(1, k); const tail = Math.max(0, k - 0.35);
      for (let s = tail; s <= head + 1e-6; s += 0.02) {
        const [la, lo, dist] = slerp(tr.a, tr.b, s); const lift = 1 + Math.sin(Math.PI * s) * Math.min(0.25, dist * 0.35);
        const p = project(la, lo); if (p.z <= 0) { started = false; continue; }
        const x = W / 2 + (p.x - W / 2) * lift; const y = H / 2 + (p.y - H / 2) * lift;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(255, 220, 140, ${0.85 * (1 - Math.max(0, k - 1) / 0.35)})`; ctx.lineWidth = 1.6; ctx.shadowColor = gold; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
    }
    // city lights
    cities.forEach((c, i) => {
      const p = project(c[0], c[1]); if (p.z <= 0.05) return;
      const pulse = (Math.sin(t / 600 + i * 1.7) + 1) / 2;
      const col = c.ad ? '255, 196, 64' : '140, 230, 255';
      ctx.beginPath(); ctx.arc(p.x, p.y, (c.ad ? 3 : 2) + pulse * (c.ad ? 8 : 5), 0, Math.PI * 2); ctx.fillStyle = `rgba(${col}, ${0.2 * (1 - pulse) + 0.04})`; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, c.ad ? 2.6 : 1.8, 0, Math.PI * 2); ctx.fillStyle = c.ad ? '#fff3d1' : '#e6fbff'; ctx.shadowColor = c.ad ? gold : '#8ce6ff'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
    });
    // rim light
    const rim = ctx.createRadialGradient(W / 2, H / 2, R * 0.92, W / 2, H / 2, R * 1.08);
    rim.addColorStop(0, 'rgba(120, 220, 255, 0)'); rim.addColorStop(0.5, 'rgba(120, 220, 255, .28)'); rim.addColorStop(1, 'rgba(120, 220, 255, 0)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 1.08, 0, Math.PI * 2); ctx.fill();
    orbit(t, true);
  }

  let visible = true; let last = 0; let raf = 0;
  function loop(t) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(50, t - (last || t)); last = t;
    if (!drag) { spinV *= 0.94; userOff += spinV; phase += dt * 0.0055; }
    rotLon = 20 + phase + userOff; // one full turn about every minute
    if (t > nextTrail) { addTrail(t); nextTrail = t + 700 + Math.random() * 700; }
    frame(t);
    raf = requestAnimationFrame(loop);
  }
  const startLoop = () => { if (!raf && !reduced) { last = 0; raf = requestAnimationFrame(loop); } };

  // drag to spin
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, off: userOff }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const no = drag.off - (e.clientX - drag.x) * 0.35; spinV = (no - userOff) * 0.25; userOff = no; if (reduced) { rotLon = 20 + userOff; frame(performance.now()); } });
  const end = () => { drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  size(); frame(performance.now());
  window.addEventListener('resize', () => { size(); frame(performance.now()); });
  if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) startLoop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startLoop(); });
  startLoop();
})();
