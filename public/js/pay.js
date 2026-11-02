// Plan picker total + Razorpay checkout.
(function () {
  'use strict';
  const form = document.querySelector('[data-pay-form]');
  if (!form) return;
  const csrf = document.querySelector('meta[name=csrf-token]').content;
  const totalEl = form.querySelector('[data-total]');
  const summaryEl = form.querySelector('[data-top-summary]');
  const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  function selected() { return form.querySelector('input[name=plan_id]:checked'); }
  function chosenSlots() { return Array.from(form.querySelectorAll('input[name="top_slots[]"]:checked')); }
  function update() {
    const p = selected(); if (!p) return;
    const days = Number(p.dataset.days);
    const perDay = chosenSlots().reduce((s, c) => s + Number(c.dataset.slotPrice), 0);
    const top = perDay * days;
    if (summaryEl) summaryEl.textContent = chosenSlots().length ? `TOP: ${chosenSlots().length} slot(s) × ${inr(perDay)}/day × ${days} days = ${inr(top)}` : '';
    totalEl.textContent = inr(Number(p.dataset.price) + top);
  }
  form.addEventListener('change', update);
  update();

  const payBtn = form.querySelector('[data-rzp-pay]');
  if (!payBtn) return;
  payBtn.addEventListener('click', async () => {
    const p = selected(); if (!p) return;
    payBtn.disabled = true; const label = payBtn.textContent; payBtn.textContent = 'Starting payment…';
    try {
      const r = await fetch(`/client/ads/${form.dataset.adId}/pay/razorpay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ plan_id: p.value, top_slots: chosenSlots().map((c) => c.value) }),
      });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error || 'Could not start payment');
      const rzp = new window.Razorpay({
        key: o.key, amount: o.amount, currency: o.currency, name: o.name, description: o.description, order_id: o.order_id, prefill: o.prefill,
        theme: { color: '#e8452c' },
        handler: async (resp) => {
          const v = await fetch('/client/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(resp) });
          const j = await v.json().catch(() => ({}));
          if (j.ok) window.location = j.redirect; else alert(j.error || 'Verification failed');
        },
        modal: { ondismiss: () => { payBtn.disabled = false; payBtn.textContent = label; } },
      });
      rzp.on('payment.failed', (resp) => alert('Payment failed: ' + (resp.error && resp.error.description)));
      rzp.open();
    } catch (e) {
      alert(e.message);
      payBtn.disabled = false; payBtn.textContent = label;
    }
  });
})();
