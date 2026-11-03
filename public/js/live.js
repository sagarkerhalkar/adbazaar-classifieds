// Live updates without pressing refresh.
//  Admin: sidebar counters update every 10 s; a new payment or seller shows a toast with a soft chime,
//         and list pages (dashboard, payments, clients) reload themselves when nothing is being typed.
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
  const busy = () => { const a = document.activeElement; return (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || document.querySelector('dialog[open]'); };

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
        if (changed && listPage && !busy()) setTimeout(() => { if (!busy()) location.reload(); }, 2500);
      }
    } else if (prev && d.lastId > prev.lastId) {
      toast(d.lastTitle, '/client/messages', d.lastTone === 'error' ? 'error' : d.lastTone === 'success' ? 'success' : 'info'); chime();
      if (/^\/client(\/payments|\/wallet)?$/.test(location.pathname) && !busy()) setTimeout(() => { if (!busy()) location.reload(); }, 3000);
    }
    prev = d; try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }
  tick();
  setInterval(tick, admin ? 10000 : 15000);
})();
