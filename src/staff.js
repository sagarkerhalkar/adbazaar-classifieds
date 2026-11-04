'use strict';
// Staff roles and permissions.
// The OWNER can do everything, and is the only one who can change the site name/brand and manage staff and roles.
// Every other staff login has ONE role. A role is a name plus a set of permissions the owner ticks
// (Admin → Settings → Staff & roles). Two roles exist from the start: "Admin" (everything) and "Payment checker".

const { db } = require('./db');

// key, label shown to the owner, what it opens
const PERMS = [
  ['payments', 'Confirm payments', 'Payments and balance top-ups waiting to be confirmed'],
  ['money', 'See money totals', 'Revenue on the dashboard, payment history, money reports and CSV'],
  ['sellers', 'Sellers', 'Verify, approve, block, video call, reset password, balance'],
  ['ads', 'Ads', 'Block, boost, TOP, extend, delete'],
  ['categories', 'Categories', 'Add, rename, photo, hide, delete'],
  ['home', 'Home page', 'Banners, notice bar, sections'],
  ['sponsors', 'Sponsors', 'Third-party ads and advertiser enquiries'],
  ['reports', 'Reports & complaints', 'Charts, rejected lists, ad complaints'],
  ['messages', 'Messages log', 'Every email, SMS and alert sent'],
  ['settings', 'Settings', 'Plans, prices, TOP slots, approvals, email & SMS, alerts, legal'],
];
const PERM_KEYS = PERMS.map(([k]) => k);

// Which permission each admin page needs. First match wins. 'any' = every staff login, 'owner' = owner only.
const RULES = [
  [/^\/admin\/(account|password|live|logout)$/, 'any'],
  [/^\/admin\/(admins|brand|roles)(\/|$)/, 'owner'],
  [/^\/admin\/payments\/\d+\/receipt$/, 'payments'],
  [/^\/admin\/(payments|topups|payment-file)(\/|$)/, 'payments'],
  [/^\/admin\/(clients|kyc)(\/|$)/, 'sellers'],
  [/^\/admin\/ads(\/|$)/, 'ads'],
  [/^\/admin\/bids(\/|$)/, 'ads'],
  [/^\/admin\/gateways(\/|$)/, 'owner'],
  [/^\/admin\/categories(\/|$)/, 'categories'],
  [/^\/admin\/home(\/|$)/, 'home'],
  [/^\/admin\/(sponsors|enquiries)(\/|$)/, 'sponsors'],
  [/^\/admin\/reports\/export\/(payments|sellers)$/, 'money'],
  [/^\/admin\/reports(\/|$)/, 'reports'],
  [/^\/admin\/messages$/, 'messages'],
  [/^\/admin\/(settings|plans|slots|showcase|automation|alerts|legal|messaging|test-email|test-sms)(\/|$)/, 'settings'],
  [/^\/admin$/, 'any'],
];
const needFor = (path) => { for (const [re, p] of RULES) if (re.test(path)) return p; return 'settings'; };

const roleById = (id) => db.prepare('SELECT * FROM roles WHERE id = ?').get(Number(id) || 0);
const parsePerms = (csv) => new Set(String(csv || '').split(',').map((x) => x.trim()).filter((x) => PERM_KEYS.includes(x)));

/** Attach role name and permissions to a logged-in staff member (req.admin). */
function load(admin) {
  if (!admin) return null;
  if (admin.role === 'owner') return { ...admin, roleName: 'Owner', perms: new Set(PERM_KEYS), owner: true };
  const r = roleById(admin.role_id);
  return { ...admin, roleName: r ? r.name : 'No role', perms: r ? parsePerms(r.perms) : new Set(), owner: false };
}

const can = (req, perm) => !!(req.admin && (req.admin.owner || perm === 'any' || (perm !== 'owner' && req.admin.perms.has(perm))));

/** The first page this staff member may open (where login lands). */
function homeFor(a) {
  if (!a) return '/admin/login';
  if (a.owner || a.perms.size > 1 || (a.perms.size === 1 && !a.perms.has('payments'))) return '/admin';
  return a.perms.has('payments') ? '/admin/payments' : '/admin/account';
}

const listRoles = () => db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM admins a WHERE a.role_id = r.id AND a.is_active = 1 AND a.role != 'owner') AS people
  FROM roles r ORDER BY r.id`).all().map((r) => ({ ...r, permSet: parsePerms(r.perms) }));

function saveRole({ id, name, perms }) {
  const clean = [...new Set((Array.isArray(perms) ? perms : [perms]).filter((p) => PERM_KEYS.includes(p)))].join(',');
  if (id) { db.prepare('UPDATE roles SET name = ?, perms = ? WHERE id = ?').run(name, clean, id); return id; }
  return Number(db.prepare('INSERT INTO roles (name, perms, created_at) VALUES (?, ?, ?)').run(name, clean, Date.now()).lastInsertRowid);
}

module.exports = { PERMS, PERM_KEYS, needFor, load, can, homeFor, listRoles, saveRole, roleById, parsePerms };
