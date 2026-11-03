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
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => {
    if (f.dataset.confirmed) return;
    e.preventDefault();
    const sub = e.submitter;
    askConfirm(f.dataset.confirm, isDanger(f)).then((ok) => {
      if (!ok) return;
      f.dataset.confirmed = '1';
      if (f.requestSubmit) f.requestSubmit(sub && sub.form === f ? sub : undefined); else f.submit();
    });
  }));
  $$('button[data-confirm]').forEach((b) => b.addEventListener('click', (e) => {
    if (b.dataset.confirmed) { delete b.dataset.confirmed; return; }
    e.preventDefault();
    askConfirm(b.dataset.confirm, isDanger(b)).then((ok) => { if (ok) { b.dataset.confirmed = '1'; b.click(); } });
  }));

  // Pop-up panels: <button data-dialog-open="id"> opens <dialog id="id">; fill fields from data-fill-*
  $$('[data-dialog-open]').forEach((b) => b.addEventListener('click', () => {
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
  }));
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
  $$('select[data-autosubmit]').forEach((sel) => sel.addEventListener('change', () => sel.form.submit()));

  // Gentle 3D tilt on ad cards (mouse only, off when motion is reduced)
  function bindTilt() {
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    $$('.ad-card:not([data-tilt])').forEach((card) => {
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

  // Ad gallery
  $$('[data-gallery]').forEach((g) => {
    const main = g.querySelector('[data-gallery-main]');
    $$('[data-gallery-thumb]', g).forEach((t) => t.addEventListener('click', () => {
      main.src = t.dataset.galleryThumb;
      $$('[data-gallery-thumb]', g).forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    }));
  });

  // Copy-to-clipboard
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const input = b.parentElement.querySelector('[data-copy-src]');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    const t = b.textContent; b.textContent = 'Copied!'; setTimeout(() => { b.textContent = t; }, 1500);
  }));

  // Limit number of selected files
  $$('input[type=file][data-max-files]').forEach((inp) => inp.addEventListener('change', () => {
    const max = Number(inp.dataset.maxFiles);
    if (inp.files.length > max) { alert('You can select up to ' + max + ' photos.'); inp.value = ''; }
  }));

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
})();
