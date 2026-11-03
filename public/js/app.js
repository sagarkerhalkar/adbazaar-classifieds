// Small progressive-enhancement helpers used across all pages.
(function () {
  'use strict';
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Mobile nav
  $$('[data-toggle-nav]').forEach((b) => b.addEventListener('click', () => document.body.classList.toggle('nav-open')));

  // Confirm dialogs on forms
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!window.confirm(f.dataset.confirm)) e.preventDefault(); }));
  $$('button[data-confirm]').forEach((b) => b.addEventListener('click', (e) => { if (!window.confirm(b.dataset.confirm)) e.preventDefault(); }));

  // Reveal phone number on ad page (first click reveals, second click dials)
  $$('[data-reveal-phone]').forEach((a) => a.addEventListener('click', (e) => {
    if (!a.dataset.revealed) { e.preventDefault(); a.dataset.revealed = '1'; a.textContent = '📞 ' + a.dataset.revealPhone; }
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

  // Uppercase helper for PAN
  $$('input.upper').forEach((i) => i.addEventListener('input', () => { i.value = i.value.toUpperCase(); }));
})();
