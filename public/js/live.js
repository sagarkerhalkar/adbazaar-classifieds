// Live updates without pressing refresh.
//  Admin: sidebar counters update every 10 s; a new payment or seller shows a toast with a soft chime,
//         and list pages (dashboard, payments, clients) update in place — no page reload, scroll kept.
//  Nothing runs while the tab is in the background; it checks at once when you come back.
//  Seller: the messages bell updates; a new message (payment confirmed / rejected …) shows a toast.
(function () {
  'use strict';
  const admin = document.body.dataset.liveUrl;
  const seller = !admin && document.querySelector('[data-live="unread"]') ? '/client/live' : '';
  const url = admin || seller;
  if (!url) return;
  const KEY = 'adb-live-' + (admin ? 'admin' : 'seller');
  let prev = null; try { prev = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { prev = null; }
  const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');

  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      const ctx = new Ctx();
      [660, 880].forEach((f, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.15); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.15 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.15 + 0.35); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * 0.15); o.stop(ctx.currentTime + i * 0.15 + 0.4); });
      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch { /* sound blocked until the page is clicked once */ }
  }
  function toast(text, href, tone) {
    let box = document.querySelector('[data-flashes]');
    if (!box) { box = document.createElement('div'); box.className = 'flashes'; box.setAttribute('data-flashes', ''); document.body.appendChild(box); }
    const f = document.createElement('div'); f.className = 'flash flash-' + (tone || 'info') + ' flash-live';
    const a = document.createElement('a'); a.href = href; a.textContent = text; a.style.flex = '1';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'flash-close'; x.textContent = '×'; x.onclick = () => f.remove();
    f.append(a, x); box.appendChild(f);
    setTimeout(() => { f.classList.add('leaving'); setTimeout(() => f.remove(), 300); }, 12000);
  }
  const busy = () => { const a = document.activeElement; return (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || document.querySelector('dialog[open], details.more-menu[open]'); };

  // Update the page content in place (fetch the same page, swap <main>), keeping the scroll position.
  let refreshing = false;
  async function softRefresh() {
    if (refreshing || busy()) return;
    refreshing = true;
    try {
      const r = await fetch(location.href, { cache: 'no-store', headers: { Accept: 'text/html' } });
      if (!r.ok || r.redirected) return;
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const fresh = doc.querySelector('main'); const cur = document.querySelector('main');
      if (!fresh || !cur || busy()) return;
      const y = window.scrollY;
      fresh.querySelectorAll('[data-flashes]').forEach((f) => f.remove());
      cur.innerHTML = fresh.innerHTML;
      if (window.ADB && window.ADB.labelTables) window.ADB.labelTables(cur);
      window.scrollTo(0, y);
      cur.classList.remove('flash-live-in'); void cur.offsetWidth; cur.classList.add('flash-live-in');
    } catch { /* offline: try again next time */ } finally { refreshing = false; }
  }

  async function tick() {
    let d; try { d = await (await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })).json(); } catch { return; }
    if (!d || !d.ok) return;
    document.querySelectorAll('[data-live]').forEach((el) => { const v = d[el.dataset.live]; if (typeof v === 'number') { el.textContent = v; el.hidden = !v; } });
    if (admin) {
      document.title = (d.pay + d.kyc ? `(${d.pay + d.kyc}) ` : '') + baseTitle;
      if (prev) {
        let changed = false;
        if (d.payKey !== prev.payKey && d.pay >= prev.pay && d.payText) { toast('💰 ' + d.payText, '/admin/payments', 'success'); chime(); changed = true; }
        if (d.sellerKey !== prev.sellerKey && d.kyc >= prev.kyc && d.sellerText) { toast('🆕 ' + d.sellerText, '/admin/clients', 'info'); chime(); changed = true; }
        if (d.reports > prev.reports) { toast('⚑ New complaint about an ad', '/admin/reports#ad-reports', 'warn'); changed = true; }
        const listPage = /^\/admin(\/payments|\/clients)?$/.test(location.pathname);
        if (changed && listPage) setTimeout(softRefresh, 800);
      }
    } else if (prev && d.lastId > prev.lastId) {
      toast(d.lastTitle, '/client/messages', d.lastTone === 'error' ? 'error' : d.lastTone === 'success' ? 'success' : 'info'); chime();
      if (/^\/client(\/payments|\/wallet)?$/.test(location.pathname)) setTimeout(softRefresh, 800);
    }
    prev = d; try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }
  // Only while the tab is visible: no work in the background, an immediate check when you come back.
  const every = admin ? 10000 : 15000;
  let timer = null;
  const start = () => { if (!timer) timer = setInterval(() => { if (!document.hidden) tick(); }, every); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick(); start();
})();
