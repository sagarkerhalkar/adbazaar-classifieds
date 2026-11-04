// Small progressive-enhancement helpers used across all pages.
(function () {
  'use strict';
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Mobile nav
  $$('[data-toggle-nav]').forEach((b) => b.addEventListener('click', () => document.body.classList.toggle('nav-open')));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Home filters panel (mobile)
  $$('[data-toggle-filters]').forEach((b) => b.addEventListener('click', () => document.body.classList.toggle('filters-open')));

  // Admin sidebar (mobile)
  $$('[data-toggle-sidebar]').forEach((b) => b.addEventListener('click', () => document.body.classList.toggle('sidebar-open')));
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('sidebar-open') && !e.target.closest('[data-sidebar],[data-toggle-sidebar]')) document.body.classList.remove('sidebar-open');
  });

  // Toast messages: close button + auto-hide success/info after 6 s
  const closeFlash = (f) => { f.classList.add('leaving'); setTimeout(() => f.remove(), 300); };
  $$('[data-flash-close]').forEach((b) => b.addEventListener('click', () => closeFlash(b.closest('.flash'))));
  $$('[data-flashes] .flash-success, [data-flashes] .flash-info').forEach((f) => setTimeout(() => closeFlash(f), 6000));

  // Nice confirm pop-up instead of the browser's grey box
  function askConfirm(text, danger) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'modal';
      d.innerHTML = '<div class="modal-body"><h2>Please confirm</h2><p></p></div><div class="modal-foot"><button type="button" class="btn" data-no>Cancel</button><button type="button" class="btn" data-yes>Yes, continue</button></div>';
      d.querySelector('p').textContent = text;
      d.querySelector('[data-yes]').classList.add(danger ? 'btn-danger' : 'btn-primary');
      document.body.appendChild(d);
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      d.querySelector('[data-no]').onclick = () => done(false);
      d.querySelector('[data-yes]').onclick = () => done(true);
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
      if (d.showModal) d.showModal(); else done(window.confirm(text));
      d.querySelector('[data-yes]').focus();
    });
  }
  const isDanger = (el) => !!(el.querySelector && el.querySelector('.btn-danger')) || (el.classList && el.classList.contains('btn-danger'));
  // Delegated (works for content swapped in by the live refresh too)
  document.addEventListener('submit', (e) => {
    const f = e.target; if (!(f instanceof HTMLFormElement) || !f.dataset.confirm) return;
    if (f.dataset.confirmed) return;
    e.preventDefault();
    const sub = e.submitter;
    askConfirm(f.dataset.confirm, isDanger(f)).then((ok) => {
      if (!ok) return;
      f.dataset.confirmed = '1';
      if (f.requestSubmit) f.requestSubmit(sub && sub.form === f ? sub : undefined); else f.submit();
    });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-confirm]'); if (!b) return;
    if (b.dataset.confirmed) { delete b.dataset.confirmed; return; }
    e.preventDefault();
    askConfirm(b.dataset.confirm, isDanger(b)).then((ok) => { if (ok) { b.dataset.confirmed = '1'; b.click(); } });
  });

  // Pop-up panels: <button data-dialog-open="id"> opens <dialog id="id">; fill fields from data-fill-*
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-dialog-open]'); if (!b) return;
    const d = document.getElementById(b.dataset.dialogOpen); if (!d) return;
    Object.keys(b.dataset).filter((k) => k.startsWith('fill')).forEach((k) => {
      const name = k.slice(4).replace(/^./, (c) => c.toLowerCase());
      $$('[data-fill="' + name + '"]', d).forEach((el) => {
        const v = b.dataset[k];
        if (el.tagName === 'FORM') el.action = v;
        else if ('value' in el && el.tagName !== 'BUTTON') { if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v; }
        else el.textContent = v;
      });
    });
    // Hide "move to" options that point at the item itself
    const self = b.dataset.fillSelf;
    const selfIds = String(self || '').split(',');
    $$('option[data-opt]', d).forEach((o) => { o.hidden = o.disabled = selfIds.includes(o.value); });
    $$('select', d).forEach((sel) => { if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = ''; });
    d.showModal();
    const f = d.querySelector('input:not([type=hidden]),select'); if (f) f.focus();
  });
  $$('dialog [data-dialog-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog.modal').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // In-page tabs: [data-tabs] > button.tab[data-tab=x]  +  [data-panel=x]
  $$('[data-tabs]').forEach((bar) => {
    const scope = bar.closest('[data-tab-scope]') || document;
    const tabs = $$('[data-tab]', bar);
    const show = (name, push) => {
      tabs.forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
      $$('[data-panel]', scope).forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (push && bar.hasAttribute('data-tabs-hash')) history.replaceState(null, '', '#' + name);
    };
    tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab, true)));
    const fromHash = location.hash.slice(1);
    const start = tabs.find((t) => t.dataset.tab === fromHash) || tabs.find((t) => t.classList.contains('active')) || tabs[0];
    if (start) show(start.dataset.tab, false);
    window.addEventListener('hashchange', () => { const t = tabs.find((x) => x.dataset.tab === location.hash.slice(1)); if (t) show(t.dataset.tab, false); });
  });

  // Step-by-step forms: form[data-wizard] > [data-step][data-title]
  $$('form[data-wizard]').forEach((form) => {
    const steps = $$('[data-step]', form);
    if (steps.length < 2) return;
    const bar = document.createElement('div');
    bar.className = 'wizard-bar'; bar.style.setProperty('--steps', steps.length);
    steps.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<span></span>'; b.querySelector('span').textContent = (i + 1) + '. ' + (s.dataset.title || '');
      b.addEventListener('click', () => { if (i < cur || validUpTo(i)) go(i); });
      bar.appendChild(b);
    });
    form.prepend(bar);
    const nav = document.createElement('div'); nav.className = 'wizard-nav';
    nav.innerHTML = '<button type="button" class="btn btn-lg" data-back>Back</button><button type="button" class="btn btn-primary btn-lg" data-next>Next</button>';
    const submitRow = form.querySelector('[data-wizard-submit]');
    form.insertBefore(nav, submitRow || null);
    let cur = 0;
    const stepValid = (i) => {
      const fields = $$('input,select,textarea', steps[i]).filter((el) => !el.disabled && el.type !== 'hidden' && !el.closest('[hidden]'));
      for (const el of fields) { if (!el.checkValidity()) { go(i); el.reportValidity(); return false; } }
      const oldMsg = steps[i].querySelector('.step-msg'); if (oldMsg) oldMsg.remove();
      const custom = steps[i].querySelector('[data-step-check]');
      if (custom) {
        const need = form.querySelector(custom.dataset.stepCheck);
        if (need && !need.value) { go(i); showStepMsg(steps[i], custom.dataset.stepMsg || 'Please complete this step.'); return false; }
      }
      return true;
    };
    const validUpTo = (n) => { for (let i = 0; i < n; i++) if (!stepValid(i)) return false; return true; };
    const showStepMsg = (step, text) => {
      let m = step.querySelector('.step-msg');
      if (!m) { m = document.createElement('div'); m.className = 'flash flash-error step-msg'; step.prepend(m); }
      m.textContent = text;
    };
    function go(i) {
      cur = i;
      steps.forEach((s, j) => { s.hidden = j !== i; if (j === i) { s.classList.remove('wizard-step'); void s.offsetWidth; s.classList.add('wizard-step'); } });
      $$('button', bar).forEach((b, j) => { b.classList.toggle('done', j < i); b.classList.toggle('current', j === i); });
      nav.querySelector('[data-back]').style.visibility = i === 0 ? 'hidden' : 'visible';
      const last = i === steps.length - 1;
      nav.querySelector('[data-next]').hidden = last;
      if (submitRow) submitRow.hidden = !last;
      steps[i].dispatchEvent(new CustomEvent('wizard:show', { bubbles: true }));
    }
    nav.querySelector('[data-next]').addEventListener('click', () => { if (stepValid(cur)) { go(cur + 1); bar.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } });
    nav.querySelector('[data-back]').addEventListener('click', () => go(cur - 1));
    form.addEventListener('submit', (e) => { if (!validUpTo(steps.length)) e.preventDefault(); });
    // Start on the step the server asks for (after an error), else the first one
    go(Math.min(Number(form.dataset.wizardStart || 0), steps.length - 1));
  });

  // Home banner slider: auto-plays every 5 s, arrows, dots, swipe; pauses on hover
  $$('[data-banner]').forEach((box) => {
    const slides = $$('[data-slide]', box); const dots = $$('[data-banner-dot]', box);
    if (slides.length < 2) return;
    let cur = 0, timer = null;
    const go = (i) => {
      cur = (i + slides.length) % slides.length;
      slides.forEach((s, j) => s.classList.toggle('active', j === cur));
      dots.forEach((d, j) => d.classList.toggle('active', j === cur));
    };
    const play = () => { clearInterval(timer); if (!reduced) timer = setInterval(() => go(cur + 1), 5000); };
    box.querySelector('[data-banner-prev]').addEventListener('click', () => { go(cur - 1); play(); });
    box.querySelector('[data-banner-next]').addEventListener('click', () => { go(cur + 1); play(); });
    dots.forEach((d) => d.addEventListener('click', () => { go(Number(d.dataset.bannerDot)); play(); }));
    box.addEventListener('mouseenter', () => clearInterval(timer));
    box.addEventListener('mouseleave', play);
    let x0 = null;
    box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { go(cur + (dx < 0 ? 1 : -1)); play(); } x0 = null; });
    play();
  });

  // Horizontal strips (TOP ads): arrow buttons scroll by one screen
  $$('[data-scroller]').forEach((sec) => {
    const track = sec.querySelector('[data-scroll-track]'); if (!track) return;
    const by = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: reduced ? 'auto' : 'smooth' });
    const p = sec.querySelector('[data-scroll-prev]'), n = sec.querySelector('[data-scroll-next]');
    if (p) p.addEventListener('click', () => by(-1));
    if (n) n.addEventListener('click', () => by(1));
  });

  // Saved ads (♥): kept in this browser only
  const SAVE_KEY = 'adbazaar_saved';
  const readSaved = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]').filter((n) => Number.isInteger(n)); } catch { return []; } };
  const writeSaved = (list) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(list.slice(0, 100))); } catch { /* storage off */ } };
  const paintSaved = () => {
    const list = readSaved();
    $$('[data-fav]').forEach((b) => { const on = list.includes(Number(b.dataset.fav)); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Remove from saved' : 'Save this ad'); });
    $$('[data-saved-link]').forEach((a) => { a.href = list.length ? '/saved?ids=' + list.join(',') : '/saved'; });
    $$('[data-saved-count]').forEach((c) => { c.textContent = list.length; c.hidden = !list.length; });
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    e.preventDefault();
    const id = Number(b.dataset.fav); let list = readSaved();
    list = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
    writeSaved(list); paintSaved();
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  });
  paintSaved();
  // On the Saved page, keep the address in sync with this browser's list
  if (location.pathname === '/saved' && !location.search && readSaved().length) location.replace('/saved?ids=' + readSaved().join(','));

  // "Load more ads": fetch the next page and append its cards
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-load-more]'); if (!a) return;
    e.preventDefault();
    const box = a.closest('[data-results]'); if (!box) { location.href = a.href; return; }
    a.textContent = 'Loading…'; a.setAttribute('aria-busy', 'true');
    try {
      const r = await fetch(a.href, { credentials: 'same-origin' });
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const next = doc.querySelector('[data-results]');
      const grid = box.querySelector('.grid');
      $$('.grid > *', next).forEach((card) => { card.classList.add('appear'); grid.appendChild(document.importNode(card, true)); });
      const more = next.querySelector('[data-loadmore]'); const old = box.querySelector('[data-loadmore]');
      if (more) old.replaceWith(document.importNode(more, true)); else old.remove();
      paintSaved(); bindTilt();
    } catch { location.href = a.href; }
  });

  // Selects that submit their form when changed (sort menu)
  // (file inputs with data-autosubmit are submitted by upload.js after the photo is checked)
  $$('select[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

  // Gentle 3D tilt on ad cards (mouse only, off when motion is reduced)
  function bindTilt() {
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    $$('.ad-card:not([data-tilt])').filter((c) => !c.closest('[data-coverflow]')).forEach((card) => {
      card.dataset.tilt = '1';
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(800px) rotateX(' + (-py * 5) + 'deg) rotateY(' + (px * 6) + 'deg) translateY(-3px)';
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }
  bindTilt();

  // Line chart read-out: hairline snaps to the nearest day, tooltip shows the value
  $$('[data-linechart]').forEach((box) => {
    let data = []; try { data = JSON.parse(box.dataset.linechart); } catch { return; }
    const svg = box.querySelector('svg'); const hair = box.querySelector('.lc-hair'); const tip = box.querySelector('.lc-tip');
    const line = svg.querySelector('.line'); const dot = document.createElement('div'); dot.className = 'lc-dot'; dot.hidden = true; box.appendChild(dot);
    const coords = (line.getAttribute('d') || '').slice(1).split(' L').map((p) => p.split(',').map(Number));
    const vb = svg.viewBox.baseVal;
    const show = (clientX) => {
      const r = svg.getBoundingClientRect(); const fx = (clientX - r.left) / r.width * vb.width;
      let i = 0, best = Infinity; coords.forEach((c, j) => { const d = Math.abs(c[0] - fx); if (d < best) { best = d; i = j; } });
      const px = coords[i][0] / vb.width * r.width; const py = coords[i][1] / vb.height * r.height;
      hair.hidden = tip.hidden = dot.hidden = false;
      hair.style.left = px + 'px'; dot.style.left = px + 'px'; dot.style.top = py + 'px';
      tip.querySelector('b').textContent = data[i].v; tip.querySelector('span').textContent = data[i].l;
      const tw = tip.offsetWidth; tip.style.left = Math.min(Math.max(0, px - tw / 2), r.width - tw) + 'px';
    };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', () => { hair.hidden = tip.hidden = dot.hidden = true; });
  });

  // Count-up for dashboard numbers
  if (!reduced) {
    $$('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count); if (!isFinite(target) || target <= 0) return;
      const prefix = el.dataset.prefix || ''; const t0 = performance.now(); const dur = 700;
      const fmt = (v) => prefix + Math.round(v).toLocaleString('en-IN');
      const tick = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }

  // Reveal phone number on ad page (first click reveals, second click dials)
  $$('[data-reveal-phone]').forEach((a) => a.addEventListener('click', (e) => {
    if (!a.dataset.revealed) { e.preventDefault(); a.dataset.revealed = '1'; const svg = a.querySelector('svg'); a.textContent = ' ' + a.dataset.revealPhone; if (svg) a.prepend(svg); else a.prepend('📞'); }
  }));

  // Ad gallery: whole photo always visible, arrows, counter, swipe, keyboard, full-size view
  $$('[data-gallery]').forEach((g) => {
    const main = g.querySelector('[data-gallery-main]'); const stage = g.querySelector('[data-gallery-stage]');
    if (!main) return; // free ad or no photos: nothing to page through
    const thumbs = $$('[data-gallery-thumb]', g); const urls = thumbs.length ? thumbs.map((t) => t.dataset.galleryThumb) : [main.src];
    const count = g.querySelector('[data-gallery-count]');
    let i = 0;
    const show = (n) => {
      i = (n + urls.length) % urls.length;
      main.style.animation = 'none'; void main.offsetWidth; main.style.animation = '';
      main.src = urls[i]; if (stage) stage.style.setProperty('--bg', `url('${urls[i]}')`);
      thumbs.forEach((x, k) => x.classList.toggle('active', k === i));
      if (count) count.textContent = (i + 1) + ' / ' + urls.length;
      if (lb) lbImg.src = urls[i];
    };
    thumbs.forEach((t, k) => t.addEventListener('click', () => show(k)));
    const prev = g.querySelector('[data-gallery-prev]'); const next = g.querySelector('[data-gallery-next]');
    if (prev) prev.addEventListener('click', (e) => { e.stopPropagation(); show(i - 1); });
    if (next) next.addEventListener('click', (e) => { e.stopPropagation(); show(i + 1); });
    // swipe on phones
    let x0 = null;
    stage && stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    stage && stage.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40 && urls.length > 1) show(i + (dx < 0 ? 1 : -1)); });
    // full-size view
    let lb = null; let lbImg = null;
    const openFull = () => {
      if (!lb) {
        lb = document.createElement('dialog'); lb.className = 'lightbox';
        lb.innerHTML = '<img alt=""><button type="button" class="lb-close" aria-label="Close">×</button>' + (urls.length > 1 ? '<button type="button" class="lb-nav prev" aria-label="Previous photo">‹</button><button type="button" class="lb-nav next" aria-label="Next photo">›</button>' : '');
        document.body.appendChild(lb); lbImg = lb.querySelector('img');
        lb.querySelector('.lb-close').onclick = () => lb.close();
        const p2 = lb.querySelector('.lb-nav.prev'); const n2 = lb.querySelector('.lb-nav.next');
        if (p2) p2.onclick = () => show(i - 1); if (n2) n2.onclick = () => show(i + 1);
        lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
      }
      lbImg.src = urls[i]; lb.showModal();
    };
    const full = g.querySelector('[data-gallery-full]'); if (full) full.addEventListener('click', (e) => { e.stopPropagation(); openFull(); });
    main.addEventListener('click', openFull);
    document.addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || urls.length < 2) return;
      if (e.key === 'ArrowRight') show(i + 1); else if (e.key === 'ArrowLeft') show(i - 1);
    });
  });

  // Copy-to-clipboard
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const input = b.parentElement.querySelector('[data-copy-src]');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    const t = b.textContent; b.textContent = 'Copied!'; setTimeout(() => { b.textContent = t; }, 1500);
  }));

  // Photo / PDF checks (count, size, type, automatic shrinking) live in public/js/upload.js

  // Auto-refresh status pages
  $$('[data-autorefresh]').forEach((el) => {
    const s = Number(el.dataset.autorefresh);
    if (s > 0) setTimeout(() => window.location.reload(), s * 1000);
  });

  // Check a video before uploading: max 1 minute and 90 MB.
  $$('[data-video-form]').forEach((form) => {
    const input = form.querySelector('[data-video-input]');
    const msg = form.querySelector('[data-video-msg]');
    const btn = form.querySelector('button');
    let ok = false;
    input.addEventListener('change', () => {
      ok = false; msg.textContent = ''; msg.classList.remove('bad');
      const f = input.files[0]; if (!f) return;
      if (f.size > 90 * 1024 * 1024) { msg.textContent = 'This video is bigger than 90 MB. Record in 720p or trim it.'; msg.classList.add('bad'); return; }
      const v = document.createElement('video'); v.preload = 'metadata';
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(v.src);
        if (v.duration > 60.5) { msg.textContent = 'This video is ' + Math.round(v.duration) + ' seconds. Maximum is 60 seconds.'; msg.classList.add('bad'); return; }
        ok = true; msg.textContent = 'Length ' + Math.round(v.duration) + ' s, ' + (f.size / 1048576).toFixed(1) + ' MB — ready to upload.';
      };
      v.onerror = () => { ok = true; msg.textContent = 'Ready to upload.'; };
      v.src = URL.createObjectURL(f);
    });
    form.addEventListener('submit', (e) => {
      if (!ok && input.files[0]) { e.preventDefault(); if (!msg.textContent) msg.textContent = 'Checking the video… try again in a second.'; return; }
      btn.disabled = true; btn.textContent = 'Uploading… please wait';
    });
  });

  // Email setup: show the help text for the chosen provider
  $$('[data-mail-form]').forEach((form) => {
    const sel = form.querySelector('[data-mail-provider]');
    const show = () => {
      $$('[data-for]', form).forEach((el) => { el.hidden = el.dataset.for !== sel.value; });
      const d = form.querySelector('details'); if (d && sel.value === 'other') d.open = true;
    };
    sel.addEventListener('change', show); show();
  });

  // ID document choice (Aadhaar / PAN / Passport): adapt the number field, labels and hint
  $$('[data-id-type]').forEach((radio) => radio.addEventListener('change', () => {
    if (!radio.checked) return;
    const form = radio.closest('form');
    const num = form.querySelector('[data-id-number]');
    num.placeholder = radio.dataset.placeholder;
    num.inputMode = radio.dataset.inputmode;
    num.maxLength = Number(radio.dataset.maxlength);
    num.value = '';
    $$('[data-id-label]', form).forEach((el) => { el.textContent = radio.dataset.short; });
    const hint = form.querySelector('[data-id-hint]'); if (hint) hint.textContent = radio.dataset.hint;
    // Aadhaar: front + back · Passport: first + last page · PAN: front only
    const front = form.querySelector('[data-id-front]'); if (front) front.textContent = radio.dataset.front;
    const wrap = form.querySelector('[data-id-back-wrap]'); const backIn = form.querySelector('[data-id-back-input]');
    if (wrap && backIn) {
      const need = radio.dataset.needBack === '1';
      wrap.hidden = !need; backIn.required = need; if (!need) backIn.value = '';
      const lbl = form.querySelector('[data-id-back]'); if (lbl) lbl.textContent = radio.dataset.back || 'Back side';
    }
  }));

  // "Confirm password" must match
  $$('[data-match]').forEach((inp) => {
    const other = inp.form && inp.form.querySelector('[name="' + inp.dataset.match + '"]'); if (!other) return;
    const check = () => inp.setCustomValidity(inp.value && inp.value !== other.value ? 'The two passwords are different.' : '');
    inp.addEventListener('input', check); other.addEventListener('input', check);
  });

  // Uppercase helper for PAN
  $$('input.upper').forEach((i) => i.addEventListener('input', () => { i.value = i.value.toUpperCase(); }));
})();

// Seller pages: listen for an incoming video call from the admin (loads public/js/ring.js)
(function () {
  const me = document.currentScript && document.currentScript.src;
  const v = me && me.includes('?') ? me.slice(me.indexOf('?')) : '';
  const load = (f) => { const s = document.createElement('script'); s.src = '/public/js/' + f + v; s.defer = true; document.body.appendChild(s); };
  load('live.js');
  if (!document.body.classList.contains('portal-admin')) load('ring.js');
  if (document.querySelector('.hsearch input[name="q"]')) load('suggest.js');
  if (document.querySelector('input[type=file]')) load('upload.js');
  load('motion.js');
})();

// "More" menus in admin tables: float above the table (tables scroll sideways, so the menu is placed on screen),
// open upwards near the bottom of the window, follow scrolling, and close on outside click or Esc.
(function () {
  const menus = () => Array.from(document.querySelectorAll('details.more-menu[open]'));
  function place(d) {
    const pop = d.querySelector('.more-pop'); const r = d.querySelector('summary').getBoundingClientRect();
    pop.style.position = 'fixed';
    const w = pop.offsetWidth || 260; const h = pop.offsetHeight || 200;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    pop.style.top = (r.bottom + h + 8 > window.innerHeight && r.top - h - 6 > 0 ? r.top - h - 6 : r.bottom + 6) + 'px';
    pop.style.right = 'auto';
  }
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('more-menu')) return;
    if (d.open) { menus().forEach((m) => { if (m !== d) m.open = false; }); place(d); }
  }, true);
  document.addEventListener('click', (e) => { menus().forEach((m) => { if (!m.contains(e.target)) m.open = false; }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menus().forEach((m) => { m.open = false; m.querySelector('summary').focus(); }); });
  // Follow the page when it scrolls (a phone keyboard scrolls the page while typing a reason) instead of closing.
  const follow = () => menus().forEach(place);
  window.addEventListener('scroll', follow, { passive: true, capture: true });
  window.addEventListener('resize', follow, { passive: true });
})();

// Lists: give every cell the name of its column, so narrow screens can show each row as a labelled card.
(function () {
  const label = (root) => root.querySelectorAll('table.table').forEach((t) => {
    const heads = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll('tbody tr').forEach((tr) => {
      Array.from(tr.children).forEach((td, i) => { if (heads[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i]); });
    });
  });
  label(document);
  window.ADB = Object.assign(window.ADB || {}, { labelTables: label });
})();
