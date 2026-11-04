// Balance page: add money online (Razorpay window here; PayPal / Stripe open their own page).
(function () {
  'use strict';
  const form = document.querySelector('[data-topup-form]'); if (!form) return;
  const csrf = document.querySelector('meta[name=csrf-token]').content;
  const amount = form.querySelector('[data-topup-amount]');
  const terms = form.querySelector('[name=accept_terms]');
  function intl() {
    const paise = Math.round(Number(amount.value) * 100) || 0;
    form.querySelectorAll('[data-intl-rate]').forEach((b) => {
      const s = b.querySelector('[data-intl-amount]');
      if (s) s.textContent = paise ? `· ${b.dataset.intlCur} ${(Math.max(50, Math.ceil(paise / Number(b.dataset.intlRate))) / 100).toFixed(2)}` : '';
    });
  }
  amount.addEventListener('input', intl); intl();
  const btn = form.querySelector('[data-rzp-topup]'); if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    btn.disabled = true; const label = btn.innerHTML;
    try {
      const r = await fetch('/client/wallet/topup/razorpay', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ amount: amount.value, accept_terms: terms.checked ? '1' : '' }) });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error || 'Could not start payment');
      const rzp = new window.Razorpay({
        key: o.key, amount: o.amount, currency: o.currency, name: o.name, description: o.description, order_id: o.order_id, prefill: o.prefill, theme: { color: '#0a4d68' },
        handler: async (resp) => {
          const v = await fetch('/client/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(resp) });
          const j = await v.json().catch(() => ({}));
          if (j.ok) window.location = j.redirect; else alert(j.error || 'Verification failed');
        },
        modal: { ondismiss: () => { btn.disabled = false; btn.innerHTML = label; } },
      });
      rzp.on('payment.failed', (resp) => {
        const why = (resp.error && resp.error.description) || 'Payment failed';
        fetch('/client/payments/razorpay/failed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ order_id: o.order_id, reason: why }) }).catch(() => {});
      });
      rzp.open();
    } catch (e) { alert(e.message); btn.disabled = false; btn.innerHTML = label; }
  });
})();
