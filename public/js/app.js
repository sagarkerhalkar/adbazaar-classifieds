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

  // Uppercase helper for PAN
  $$('input.upper').forEach((i) => i.addEventListener('input', () => { i.value = i.value.toUpperCase(); }));
})();
