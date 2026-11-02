'use strict';
// Background jobs that run every 30 seconds:
//  - auto-approve verified clients the admin hasn't reviewed within N minutes (Admin → Settings)
//  - optionally auto-confirm UPI payments after N minutes (off by default)

const { db, getSettings } = require('./db');
const notify = require('./notify');
const { confirmPayment } = require('./payments');

function runJobs(now = Date.now()) {
  const s = getSettings();
  const result = { approved: 0, payments: 0 };

  const mins = Math.max(0, Number(s.auto_approve_minutes) || 0);
  if (mins > 0) {
    const due = db.prepare("SELECT * FROM clients WHERE status = 'pending' AND submitted_at IS NOT NULL AND submitted_at <= ?").all(now - mins * 60_000);
    for (const c of due) {
      const r = db.prepare("UPDATE clients SET status = 'approved', auto_approved = 1, reviewed_at = ?, admin_note = NULL WHERE id = ? AND status = 'pending'").run(now, c.id);
      if (r.changes) {
        result.approved += 1;
        console.log(`[auto-approve] client #${c.id} ${c.name}`);
        notify.approved(c, { auto: true });
      }
    }
  }

  const pmins = Math.max(0, Number(s.auto_confirm_payment_minutes) || 0);
  if (pmins > 0) {
    const due = db.prepare("SELECT id FROM payments WHERE status = 'pending' AND method = 'upi_manual' AND created_at <= ?").all(now - pmins * 60_000);
    for (const p of due) {
      try {
        const r = confirmPayment(p.id, { note: 'Auto-confirmed' });
        if (!r.already) { result.payments += 1; notify.paymentConfirmed(p.id); }
      } catch (e) { console.error('[auto-confirm]', e.message); }
    }
  }
  return result;
}

function startJobs(intervalMs = 30_000) {
  const t = setInterval(() => { try { runJobs(); } catch (e) { console.error('[jobs]', e); } }, intervalMs);
  t.unref();
  setTimeout(() => { try { runJobs(); } catch (e) { console.error('[jobs]', e); } }, 3000).unref();
}

module.exports = { runJobs, startJobs };
