'use strict';
// Background jobs that run every 30 seconds:
//  - auto-approve verified clients the admin hasn't reviewed within N minutes (Admin → Settings)

const { db, getSettings } = require('./db');
const notify = require('./notify');

function runJobs(now = Date.now()) {
  const s = getSettings();
  const result = { approved: 0 };

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

  // Payments are NEVER confirmed automatically — only an admin can confirm a payment.
  return result;
}

function startJobs(intervalMs = 30_000) {
  const t = setInterval(() => { try { runJobs(); } catch (e) { console.error('[jobs]', e); } }, intervalMs);
  t.unref();
  setTimeout(() => { try { runJobs(); } catch (e) { console.error('[jobs]', e); } }, 3000).unref();
}

module.exports = { runJobs, startJobs };
