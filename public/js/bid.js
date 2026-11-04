// Showcase bid form: suggests the amount needed for a place and shows how much will be held.
(function () {
  'use strict';
  const form = document.querySelector('[data-bid-form]'); if (!form) return;
  const amount = form.querySelector('[data-bid-amount]');
  const out = form.querySelector('[data-bid-total]');
  const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  let typed = false;
  amount.addEventListener('input', () => { typed = true; update(); });
  form.addEventListener('change', (e) => { if (e.target.name === 'slots[]') update(true); });
  function update(slotChanged) {
    const boxes = Array.from(form.querySelectorAll('input[name="slots[]"]:checked'));
    const need = boxes.reduce((m, b) => Math.max(m, Number(b.dataset.need) || 0), 0);
    if (slotChanged && need && (!typed || Number(amount.value) * 100 < need)) { amount.value = Math.ceil(need / 100); typed = false; }
    amount.min = need ? Math.ceil(need / 100) : 1;
    const each = Math.round(Number(amount.value) * 100) || 0;
    out.textContent = boxes.length && each ? `${boxes.length} slot${boxes.length > 1 ? 's' : ''} × ${inr(each)} = ${inr(each * boxes.length)} held from your balance (taken only for the slots you win).` : 'Tick one or more time slots.';
  }
  form.addEventListener('submit', (e) => {
    if (!form.querySelector('input[name="slots[]"]:checked')) { e.preventDefault(); out.textContent = 'Tick at least one time slot.'; out.classList.add('err'); }
  });
  update();
  // Sellers outside India: show each slot in their own time too
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && !/^Asia\/(Kolkata|Calcutta)$/.test(tz)) {
      const f = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
      form.querySelectorAll('[data-start]').forEach((l) => {
        const s = l.querySelector('[data-local]'); if (!s) return;
        s.textContent = 'Your time: ' + f.format(new Date(Number(l.dataset.start))) + ' – ' + f.format(new Date(Number(l.dataset.end)));
        s.hidden = false;
      });
    }
  } catch (e) { /* ignore */ }
})();
