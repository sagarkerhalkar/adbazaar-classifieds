// Incoming video call from the admin: seller pages check every few seconds and show a ringing pop-up.
(function () {
  'use strict';
  const path = location.pathname;
  const m = /^\/kyc\/status\/([A-Za-z0-9_-]{20,64})$/.exec(path);
  const sellerPage = /^\/client(\/|$)/.test(path) && !/^\/client\/(login|register)/.test(path);
  const loggedIn = !!document.querySelector('a[href="/client"]'); // public pages show "My ads" when a seller is logged in
  const url = m ? `/kyc/ring/${m[1]}` : (sellerPage || loggedIn) ? '/client/ring' : '';
  if (!url || /^\/kyc\/call\//.test(path)) return;

  let dialog = null; let audio = null; let shownFor = 0;
  const dismissedKey = 'adb-ring-dismissed';
  const dismissed = () => Number(sessionStorage.getItem(dismissedKey) || 0);

  function tone() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
      const ctx = new Ctx(); let on = true;
      const beep = () => {
        if (!on) return;
        [0, 0.25].forEach((t) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
          o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
        });
        setTimeout(beep, 1800);
      };
      beep();
      return { stop() { on = false; ctx.close().catch(() => {}); } };
    } catch { return null; }
  }

  function show(info) {
    if (dialog) return;
    shownFor = info.at;
    dialog = document.createElement('dialog');
    dialog.className = 'modal ringing';
    dialog.innerHTML = '<div class="modal-body center"><div class="ring-pulse"><span></span><span></span><div class="ring-ic"></div></div>'
      + '<h2>Incoming video call</h2><p class="muted"></p></div>'
      + '<div class="modal-foot"><button type="button" class="btn" data-no>Not now</button><a class="btn btn-ok btn-lg" data-yes>Join call</a></div>';
    dialog.querySelector('.ring-ic').innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';
    dialog.querySelector('p').textContent = (info.from || 'Our team') + ' would like to talk to you on video.';
    dialog.querySelector('[data-yes]').href = info.url;
    document.body.appendChild(dialog);
    dialog.querySelector('[data-no]').onclick = () => { sessionStorage.setItem(dismissedKey, String(info.at)); hide(); };
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); sessionStorage.setItem(dismissedKey, String(info.at)); hide(); });
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', '');
    audio = tone();
    if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
  }
  function hide() { if (audio) audio.stop(); audio = null; if (dialog) { dialog.close && dialog.close(); dialog.remove(); } dialog = null; }

  async function check() {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const info = await r.json();
      if (info.ringing && info.at !== dismissed()) show(info);
      else if (!info.ringing || info.at !== shownFor) hide();
    } catch { /* offline: try again later */ }
  }
  check();
  setInterval(check, 6000);
})();
