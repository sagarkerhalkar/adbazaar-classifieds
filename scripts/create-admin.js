'use strict';
// Create an admin or reset an admin password:
//   node scripts/create-admin.js you@example.com "StrongPassword123" "Your Name"
const fs = require('node:fs');
const path = require('node:path');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) process.loadEnvFile(path.join(__dirname, '..', '.env'));

const { db } = require('../src/db');
const { hashPassword } = require('../src/lib/security');

const [email, password, name = 'Admin'] = process.argv.slice(2);
if (!email || !password || password.length < 6) {
  console.error('Usage: node scripts/create-admin.js <email> <password (6+ chars)> [name]');
  process.exit(1);
}
const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ?, is_active = 1 WHERE id = ?').run(hashPassword(password), existing.id);
  console.log(`Password updated for ${email}`);
} else {
  // The first account (or the first one when no owner exists) is the owner; later ones are normal admins.
  const role = db.prepare("SELECT 1 FROM admins WHERE role = 'owner' AND is_active = 1").get() ? 'admin' : 'owner';
  db.prepare('INSERT INTO admins (name, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)').run(name, email.toLowerCase(), hashPassword(password), Date.now(), role);
  console.log(`${role === 'owner' ? 'Owner' : 'Admin'} created: ${email}`);
}
