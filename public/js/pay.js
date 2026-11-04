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
    const list = Number(p.dataset.price) + top;
    const disc = Math.max(0, Math.min(90, Number(p.dataset.discount) || 0));
    const total = disc ? Math.round((list * (100 - disc)) / 10000) * 100 : list;
    totalEl.textContent = inr(total);
    const dn = form.querySelector('[data-discount-note]');
    if (dn) dn.textContent = disc ? `${disc}% subscription discount applied (you save ${inr(list - total)})` : '';
    // Wallet balance: use it first, pay the rest by UPI
    const w = form.querySelector('[data-wallet]');
    const use = w && w.checked ? Math.min(Number(w.dataset.wallet), total) : 0;
    const rest = total - use;
    const wn = form.querySelector('[data-wallet-note]');
    if (wn) wn.textContent = w ? (w.checked ? ` — ${inr(use)} from balance${rest ? `, ${inr(rest)} by UPI` : ''}` : '') : '';
    const only = form.querySelector('[data-wallet-only]');
    const upi = form.querySelector('[data-upi-part]');
    if (only && upi) {
      only.hidden = rest > 0;
      upi.hidden = rest <= 0;
      upi.querySelectorAll('[name=utr]').forEach((i) => { i.required = rest > 0; });
    }
    const amt = form.querySelector('[data-upi-amount]');
    if (amt) amt.textContent = inr(rest);
    // PayPal / Stripe charge the full total in a foreign currency (rate set by the owner); rounded up like the server
    form.querySelectorAll('[data-intl-rate]').forEach((b) => {
      const minor = Math.max(50, Math.ceil(total / Number(b.dataset.intlRate)));
      const s = b.querySelector('[data-intl-amount]'); if (s) s.textContent = `· ${b.dataset.intlCur} ${(minor / 100).toFixed(2)}`;
    });
  }
  // PayPal / Stripe buttons leave this page: the payment terms must be ticked first
  form.querySelectorAll('[data-redirect-pay]').forEach((b) => b.addEventListener('click', (e) => {
    const terms = form.querySelector('[name=accept_terms]');
    if (terms && !terms.checked) { e.preventDefault(); terms.reportValidity ? terms.reportValidity() : alert('Please accept the payment terms first.'); terms.focus(); }
  }));
  form.addEventListener('change', update);
  update();

  const payBtn = form.querySelector('[data-rzp-pay]');
  if (!payBtn) return;
  payBtn.addEventListener('click', async () => {
    const p = selected(); if (!p) return;
    const terms = form.querySelector('[name=accept_terms]');
    if (terms && !terms.checked) { terms.reportValidity ? terms.reportValidity() : alert('Please accept the payment terms first.'); terms.focus(); return; }
    payBtn.disabled = true; const label = payBtn.textContent; payBtn.textContent = 'Starting payment…';
    try {
      const r = await fetch(`/client/ads/${form.dataset.adId}/pay/razorpay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ plan_id: p.value, top_slots: chosenSlots().map((c) => c.value), accept_terms: terms && terms.checked ? '1' : '' }),
      });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error || 'Could not start payment');
      const rzp = new window.Razorpay({
        key: o.key, amount: o.amount, currency: o.currency, name: o.name, description: o.description, order_id: o.order_id, prefill: o.prefill,
        theme: { color: '#0a4d68' },
        handler: async (resp) => {
          const v = await fetch('/client/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(resp) });
          const j = await v.json().catch(() => ({}));
          if (j.ok) window.location = j.redirect; else alert(j.error || 'Verification failed');
        },
        modal: { ondismiss: () => { payBtn.disabled = false; payBtn.textContent = label; } },
      });
      rzp.on('payment.failed', (resp) => {
        const why = (resp.error && resp.error.description) || 'Payment failed';
        fetch('/client/payments/razorpay/failed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ order_id: o.order_id, reason: why }) }).catch(() => {});
        alert('Payment failed: ' + why + '\nIf money left your account, your bank returns it automatically. You can try again or pay by UPI.');
      });
      rzp.open();
    } catch (e) {
      alert(e.message);
      payBtn.disabled = false; payBtn.textContent = label;
    }
  });
})();
