'use strict';
// AdBazaar — classifieds web app with verified sellers and paid, time-limited ads.
// Zero npm dependencies: requires Node.js 22.13+ (built-in SQLite).

const fs = require('node:fs');
const path = require('node:path');

if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const { App, parseBody } = require('./src/lib/router');
const { securityHeaders, csrfProtect, hashPassword, randomToken } = require('./src/lib/security');
const { sessionMiddleware } = require('./src/lib/session');
const { staticDir } = require('./src/lib/files');
const { db, getSettings } = require('./src/db');
const { startScheduler } = require('./src/ranking');

// ---- First admin account ----
if (!db.prepare('SELECT 1 FROM admins LIMIT 1').get()) {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || randomToken(12);
  db.prepare('INSERT INTO admins (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run('Owner', email, hashPassword(password), Date.now());
  console.log('\n========================================================');
  console.log(' Admin account created');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD in .env)' : password}`);
  console.log('   Login at: /admin/login  — change the password after login');
  console.log('========================================================\n');
}

const app = new App();

app.use(securityHeaders);
app.use(staticDir('/public/', path.join(__dirname, 'public')));
app.use(sessionMiddleware(db));
app.use(parseBody);
app.use(csrfProtect);
app.use((req) => {
  req.settings = getSettings();
  if (req.session.adminId) {
    req.admin = db.prepare('SELECT id, name, email FROM admins WHERE id = ?').get(req.session.adminId) || null;
    if (!req.admin) delete req.session.adminId;
  }
  if (req.session.clientId) {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.clientId);
    // Clients can only stay logged in while their KYC is approved.
    if (c && c.status === 'approved') req.seller = c;
    else delete req.session.clientId;
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));
require('./src/routes/public').register(app);
require('./src/routes/client').register(app);
require('./src/routes/admin').register(app);

startScheduler(Number(process.env.SCHEDULER_MINUTES || 5) * 60_000);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`AdBazaar running on http://localhost:${PORT}`));
