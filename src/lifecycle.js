'use strict';
// Deactivate / reactivate / delete for clients (accounts) and ads.
//
//  Deactivate (client or admin): account and its live ads are hidden. The paid time that was left
//              is FROZEN and given back on reactivation, so nobody loses paid days.
//  Block      (admin only, "Suspend"): see routes/admin.js — the account is blocked and ads are hidden.
//  Delete     (admin): personal data, ID documents, photos and videos are removed for good. Payment
//              records are kept (anonymised) so revenue reports stay correct.

const { db, tx, parseImages, parseVideos } = require('./db');
const { removeFile } = require('./lib/files');
const { rescore } = require('./ranking');

const now = () => Date.now();

/** Pause a live ad and remember how much paid time it had left. */
function pauseAd(adId, by) {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(adId);
  if (!ad || ad.status !== 'active') return false;
  const left = Math.max(0, (ad.expires_at || 0) - now());
  db.prepare("UPDATE ads SET status = 'paused', paused_by = ?, paused_remaining_ms = ?, rank_score = -1, updated_at = ? WHERE id = ?")
    .run(by, left, now(), ad.id);
  return true;
}

/** Put a paused ad live again with the paid time it had left. */
function resumeAd(adId) {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(adId);
  if (!ad || ad.status !== 'paused') return false;
  const left = Math.max(0, ad.paused_remaining_ms || 0);
  if (left <= 0) {
    db.prepare("UPDATE ads SET status = 'expired', paused_by = NULL, paused_remaining_ms = NULL, top_slots = 0, is_top = 0, updated_at = ? WHERE id = ?").run(now(), ad.id);
    return true;
  }
  db.prepare("UPDATE ads SET status = 'active', expires_at = ?, paused_by = NULL, paused_remaining_ms = NULL, updated_at = ? WHERE id = ?")
    .run(now() + left, now(), ad.id);
  rescore(ad.id);
  return true;
}

/** Deactivate an account (by 'client' or 'admin'): hides it and pauses its live ads. */
function deactivateClient(clientId, by) {
  return tx(() => {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!c || c.status === 'deleted') return null;
    db.prepare("UPDATE clients SET status = 'deactivated', deactivated_by = ?, deactivated_at = ? WHERE id = ?").run(by, now(), c.id);
    const ads = db.prepare("SELECT id FROM ads WHERE client_id = ? AND status = 'active'").all(c.id);
    for (const a of ads) pauseAd(a.id, 'account');
    return { paused: ads.length };
  });
}

/** Reactivate an account: approved again, and ads paused by the deactivation go live with their remaining time. */
function reactivateClient(clientId) {
  return tx(() => {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!c || c.status !== 'deactivated') return null;
    db.prepare("UPDATE clients SET status = 'approved', deactivated_by = NULL, deactivated_at = NULL WHERE id = ?").run(c.id);
    const ads = db.prepare("SELECT id FROM ads WHERE client_id = ? AND status = 'paused' AND paused_by = 'account'").all(c.id);
    for (const a of ads) resumeAd(a.id);
    return { resumed: ads.length };
  });
}

/** Delete an ad: photos and videos are removed; the row stays (status "deleted") so payments still add up. */
function deleteAd(adId) {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(adId);
  if (!ad || ad.status === 'deleted') return false;
  parseImages(ad).forEach((f) => removeFile('ads', f));
  parseVideos(ad).forEach((v) => removeFile('ads', v.file));
  db.prepare(`UPDATE ads SET status = 'deleted', deleted_at = ?, images = '[]', videos = '[]', top_slots = 0, is_top = 0,
              rank_score = -1, contact_phone = '', whatsapp = '', updated_at = ? WHERE id = ?`).run(now(), now(), ad.id);
  db.prepare('DELETE FROM reports WHERE ad_id = ?').run(ad.id);
  return true;
}

/** Permanently delete a client's personal data (DPDP-friendly). Payment rows are kept for accounting. */
function deleteClient(clientId) {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!c || c.status === 'deleted') return false;
  for (const a of db.prepare('SELECT id FROM ads WHERE client_id = ?').all(c.id)) deleteAd(a.id);
  const kycFiles = [c.aadhaar_file, c.aadhaar_back_file, c.pan_file, c.address_proof_file, c.photo_file, c.live_photo_file,
    ...db.prepare('SELECT file FROM kyc_snapshots WHERE client_id = ?').all(c.id).map((r) => r.file)];
  kycFiles.forEach((f) => removeFile('kyc', f));
  db.prepare('SELECT screenshot_file FROM payments WHERE client_id = ? AND screenshot_file IS NOT NULL').all(c.id)
    .forEach((p) => removeFile('payments', p.screenshot_file));
  tx(() => {
    db.prepare('DELETE FROM kyc_snapshots WHERE client_id = ?').run(c.id);
    db.prepare('DELETE FROM otps WHERE client_id = ?').run(c.id);
    db.prepare('UPDATE payments SET screenshot_file = NULL WHERE client_id = ?').run(c.id);
    db.prepare(`UPDATE clients SET status = 'deleted', deleted_at = ?, name = ?, business_name = NULL, email = ?, phone = '0000000000',
      password_hash = '!', address = '', city = '', state = '', pincode = '', aadhaar_last4 = '', pan_number = '',
      aadhaar_file = NULL, aadhaar_back_file = NULL, pan_file = NULL, address_proof_file = NULL, photo_file = NULL, live_photo_file = NULL,
      admin_note = NULL WHERE id = ?`).run(now(), `Deleted client #${c.id}`, `deleted-${c.id}@deleted.invalid`, c.id);
  });
  return true;
}

module.exports = { pauseAd, resumeAd, deactivateClient, reactivateClient, deleteAd, deleteClient };
