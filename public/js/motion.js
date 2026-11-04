// Motion & 3D for the whole site (loaded by app.js; nothing runs when the visitor asked for less motion).
//  - sections, tiles and cards float up into place as they scroll into view
//  - TOP ads: a 3D carousel — cards turn as they move, the middle card comes forward, slow auto-play
//  - category tiles: 3D tilt with a light shine under the mouse
//  - banner: depth (parallax) — text and photo move apart with the mouse
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  // 1) Reveal on scroll
  const targets = $$('[data-reveal], main .section > .section-head, main .cattile, main .grid > .ad-card, main .citychip, main .sellband, .kpi, .dash-hero, main .card:not(.ad-card)');
  if ('IntersectionObserver' in window && targets.length) {
    document.documentElement.classList.add('motion');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target; io.unobserve(el);
        const sibs = el.parentElement ? Array.from(el.parentElement.children) : [];
        const k = Math.max(0, sibs.indexOf(el)) % 8;
        el.style.transitionDelay = (k * 55) + 'ms';
        el.classList.add('in');
        setTimeout(() => { el.style.transitionDelay = ''; }, 900);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    targets.forEach((el) => { el.classList.add('rv'); io.observe(el); });
    // anything already on screen shows at once
    requestAnimationFrame(() => targets.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('in'); }));
  }

  // 2) TOP ads 3D carousel
  $$('[data-coverflow]').forEach((sec) => {
    const track = sec.querySelector('[data-scroll-track]'); if (!track) return;
    sec.classList.add('cf-on');
    const cards = Array.from(track.children);
    let raf = 0;
    const paint = () => {
      raf = 0;
      sec.classList.toggle('cf-fit', track.scrollWidth <= track.clientWidth + 4);
      const tr = track.getBoundingClientRect(); const mid = tr.left + tr.width / 2;
      cards.forEach((c) => {
        const r = c.getBoundingClientRect(); const d = ((r.left + r.width / 2) - mid) / Math.max(r.width * 2.2, tr.width / 2); // -1 … 1
        const k = Math.max(-1, Math.min(1, d));
        c.style.transform = `perspective(900px) rotateY(${(-k * 28).toFixed(2)}deg) translateZ(${(-Math.abs(k) * 70).toFixed(1)}px) scale(${(1 - Math.abs(k) * 0.08).toFixed(3)})`;
        c.style.zIndex = String(100 - Math.round(Math.abs(k) * 50));
        c.style.filter = `brightness(${(1 - Math.abs(k) * 0.12).toFixed(3)})`;
      });
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(paint); };
    track.addEventListener('scroll', ask, { passive: true }); window.addEventListener('resize', ask);
    paint();
    // slow auto-play, pauses on hover / touch / focus and when the tab is hidden
    let hold = false; let dir = 1;
    ['pointerenter', 'touchstart', 'focusin'].forEach((ev) => track.addEventListener(ev, () => { hold = true; }, { passive: true }));
    ['pointerleave', 'focusout'].forEach((ev) => track.addEventListener(ev, () => { hold = false; }));
    setInterval(() => {
      if (hold || document.hidden || track.scrollWidth <= track.clientWidth + 4) return;
      const step = (cards[0] ? cards[0].getBoundingClientRect().width : 240) + 14;
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) dir = -1; else if (track.scrollLeft <= 2) dir = 1;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    }, 3800);
  });

  // 3) Category tiles: 3D tilt + shine (mouse only)
  if (finePointer) {
    $$('.cattile').forEach((t) => {
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
        t.style.transform = `perspective(700px) rotateX(${(-py * 12).toFixed(2)}deg) rotateY(${(px * 14).toFixed(2)}deg) translateZ(8px)`;
        t.style.setProperty('--sx', `${(px + 0.5) * 100}%`); t.style.setProperty('--sy', `${(py + 0.5) * 100}%`);
        t.classList.add('tilting');
      });
      t.addEventListener('pointerleave', () => { t.style.transform = ''; t.classList.remove('tilting'); });
    });
  }

  // 4) Banner depth
  if (finePointer) {
    $$('[data-banner]').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
        b.style.setProperty('--px', px.toFixed(3)); b.style.setProperty('--py', py.toFixed(3));
      });
      b.addEventListener('pointerleave', () => { b.style.setProperty('--px', 0); b.style.setProperty('--py', 0); });
    });
  }
})();
