// Home page showcase: paid ads turning on a 3D ring in front of the globe.
// Auto-turns every few seconds, pauses on hover / touch / keyboard focus and when the tab is hidden.
// Swipe or drag to turn, arrows and dots to jump, click a side card to bring it to the front.
(function () {
  const sec = document.querySelector('[data-stage]'); if (!sec) return;
  const ring = sec.querySelector('[data-stage-ring]'); if (!ring) return;
  const cards = Array.from(ring.querySelectorAll('[data-stage-card]')); const n = cards.length; if (!n) return;
  const dotsBox = sec.querySelector('[data-stage-dots]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sec.classList.add('as-on');

  let cur = 0; let hold = false; let drag = null; let dragShift = 0;
  const dots = n > 1 && dotsBox ? cards.map((_, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Show ad ${i + 1}`);
    b.addEventListener('click', () => go(i)); dotsBox.appendChild(b); return b;
  }) : [];

  // offset of card i from the front card, wrapped so the ring has no end
  const off = (i) => { let d = i - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n; return d; };

  const spread = () => Math.min((cards[0].offsetWidth || 260) * 0.8, sec.clientWidth * 0.19);
  function paint() {
    const gap = spread();
    cards.forEach((c, i) => {
      const o = off(i) + dragShift; const a = Math.abs(o);
      const x = o * gap; const z = -a * 150; const ry = Math.max(-60, Math.min(60, -o * 34));
      c.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg)`;
      c.style.opacity = a > 2.6 ? '0' : '1';
      c.style.zIndex = String(100 - Math.round(a * 10));
      c.style.pointerEvents = a > 2.6 ? 'none' : '';
      c.classList.toggle('front', Math.round(o) === 0);
      c.tabIndex = Math.round(o) === 0 ? 0 : -1;
    });
    dots.forEach((d, i) => d.classList.toggle('active', i === cur));
  }
  function go(i) { cur = ((i % n) + n) % n; paint(); }

  sec.querySelector('[data-stage-prev]')?.addEventListener('click', () => go(cur - 1));
  sec.querySelector('[data-stage-next]')?.addEventListener('click', () => go(cur + 1));
  if (n < 2) sec.querySelectorAll('[data-stage-prev], [data-stage-next]').forEach((b) => { b.hidden = true; });

  // a side card comes to the front first; only the front card opens the ad
  cards.forEach((c, i) => c.addEventListener('click', (e) => {
    if (c.dataset.dragged === '1') { e.preventDefault(); c.dataset.dragged = ''; return; }
    if (off(i) !== 0) { e.preventDefault(); go(i); }
  }));

  // drag / swipe to turn
  ring.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { x: e.clientX, moved: false, target: e.target.closest('[data-stage-card]') }; hold = true; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x; if (Math.abs(dx) > 6) drag.moved = true;
    if (!drag.moved) return;
    dragShift = dx / spread();
    ring.classList.add('dragging'); paint();
  });
  const end = () => {
    if (!drag) return;
    if (drag.moved) { if (drag.target) drag.target.dataset.dragged = '1'; const steps = Math.round(dragShift); dragShift = 0; ring.classList.remove('dragging'); go(cur - steps); }
    drag = null; hold = false;
  };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  ring.addEventListener('dragstart', (e) => e.preventDefault());

  sec.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); cards[cur].focus(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); cards[cur].focus(); }
  });
  sec.addEventListener('pointerenter', () => { hold = true; });
  sec.addEventListener('pointerleave', () => { if (!drag) hold = false; });
  sec.addEventListener('focusin', () => { hold = true; });
  sec.addEventListener('focusout', () => { hold = false; });

  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(sec);
  if (!reduced && n > 1) setInterval(() => { if (!hold && visible && !document.hidden) go(cur + 1); }, 3200);
  window.addEventListener('resize', paint);
  paint();
})();
