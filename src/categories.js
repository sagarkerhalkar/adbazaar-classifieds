'use strict';
// Main categories and their sub-categories (Electronics → Mobile phones, …).
// A main category without sub-categories can hold ads directly.

const { db } = require('./db');

function all() {
  return db.prepare('SELECT * FROM categories ORDER BY sort, name').all();
}

/** Main categories, each with `.subs` (only active ones unless includeInactive). */
function tree({ includeInactive = false } = {}) {
  // Buyers and sellers never see categories hidden by a blocked word (the admin sees them, marked).
  const rows = all().filter((c) => includeInactive || (c.is_active && !c.flagged));
  const mains = rows.filter((c) => !c.parent_id);
  for (const m of mains) m.subs = rows.filter((c) => c.parent_id === m.id);
  return mains;
}

const byId = (id) => db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(id) || 0);
const bySlug = (slug) => db.prepare('SELECT * FROM categories WHERE slug = ?').get(String(slug || ''));

/** Category ids an ad listing filter should include: a main category also includes all its sub-categories. */
function idsForSlug(slug) {
  const c = bySlug(slug);
  if (!c) return [];
  if (c.parent_id) return [c.id];
  return [c.id, ...db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(c.id).map((r) => r.id)];
}

/** Can an ad be posted in this category? Returns an error message or null. */
function checkForAd(id) {
  const c = byId(id);
  if (!c || !c.is_active) return 'Please choose a category.';
  if (c.flagged) return 'This category is not available. Ads for sexual or adult services are not allowed (see Terms, section 3).';
  if (c.parent_id) {
    const parent = byId(c.parent_id);
    if (!parent || !parent.is_active) return 'Please choose a category.';
    return null;
  }
  const hasSubs = db.prepare('SELECT 1 FROM categories WHERE parent_id = ? AND is_active = 1 LIMIT 1').get(c.id);
  return hasSubs ? `Please choose a sub-category of ${c.name}.` : null;
}

/** "Electronics › Mobile phones" for a category id. */
function label(id) {
  const c = byId(id);
  if (!c) return '';
  const p = c.parent_id ? byId(c.parent_id) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}

function makeSlug(name, parentSlug) {
  const base = `${parentSlug ? `${parentSlug}-` : ''}${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` || 'category';
  let slug = base; let i = 2;
  while (bySlug(slug)) slug = `${base}-${i++}`;
  return slug;
}

module.exports = { all, tree, byId, bySlug, idsForSlug, checkForAd, label, makeSlug };
