'use strict';
// AdBazaar — classifieds web app with verified sellers and paid, time-limited ads.
// Zero npm dependencies: requires Node.js 22.13+ (built-in SQLite).

const fs = require('node:fs');
const os = require('node:os');
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
const { startJobs } = require('./src/jobs');
const notify = require('./src/notify');

// ---- First admin account ----
if (!db.prepare('SELECT 1 FROM admins LIMIT 1').get()) {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || randomToken(12);
  db.prepare("INSERT INTO admins (name, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, 'owner')").run('Owner', email, hashPassword(password), Date.now());
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
  notify.rememberOrigin(req);   // so links in emails point to the address people use (your domain)
  if (req.session.adminId) {
    req.admin = db.prepare('SELECT id, name, email, role FROM admins WHERE id = ? AND is_active = 1').get(req.session.adminId) || null;
    if (!req.admin) delete req.session.adminId;
  }
  if (req.session.clientId) {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.clientId);
    // Clients can only stay logged in while their KYC is approved.
    if (c && c.status === 'approved') {
      req.seller = c;
      req.sellerUnread = db.prepare('SELECT COUNT(*) n FROM inbox WHERE client_id = ? AND read_at IS NULL').get(c.id).n;
    }
    else delete req.session.clientId;
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true, app: 'adbazaar' }));
require('./src/routes/public').register(app);
require('./src/routes/client').register(app);
require('./src/routes/admin').register(app);

startScheduler(Number(process.env.SCHEDULER_MINUTES || 5) * 60_000);
startJobs(30_000);   // auto-approve clients / auto-confirm payments (Admin → Settings)

// ---- Start listening ----
// If PORT is set in .env we use exactly that port (needed for tunnels / reverse proxies)
// and stop with a clear message if it's busy. Without PORT we try 3000, 3001, … automatically.
const HOST = process.env.HOST || '0.0.0.0';
const fixedPort = Boolean(process.env.PORT);

// storage/server.pid and storage/server-url.txt let the helper scripts (stop, open-site) find the running app.
const RUN_DIR = path.join(__dirname, 'storage');
const PID_FILE = path.join(RUN_DIR, 'server.pid');
const URL_FILE = path.join(RUN_DIR, 'server-url.txt');
fs.mkdirSync(RUN_DIR, { recursive: true });

function cleanup() {
  try { if (fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) { fs.rmSync(PID_FILE, { force: true }); fs.rmSync(URL_FILE, { force: true }); } } catch { /* ignore */ }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => process.exit(0));

function start(port, triesLeft) {
  const server = app.listen(port, HOST, () => {
    const url = `http://localhost:${port}`;
    fs.writeFileSync(PID_FILE, String(process.pid));
    fs.writeFileSync(URL_FILE, url);
    // Addresses other phones/laptops on the same Wi-Fi / LAN can use.
    const lan = HOST === '127.0.0.1' ? [] : Object.values(os.networkInterfaces()).flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${port}`);
    const lines = [
      `This computer:       ${url}`,
      `Admin panel:         ${url}/admin/login`,
      ...lan.map((u, i) => `${i ? '                     ' : 'Other devices (LAN): '}${u}`),
      process.env.BASE_URL ? `Your domain:         ${process.env.BASE_URL}` : 'Your domain:         (set BASE_URL in .env after setting up Cloudflare Tunnel)',
      'Note: camera & video call work only on localhost or https:// (your domain), not on LAN http:// addresses.',
    ];
    fs.writeFileSync(path.join(RUN_DIR, 'addresses.txt'), lines.join('\r\n') + '\r\n');
    console.log(`\n[${new Date().toLocaleString('en-IN')}] AdBazaar is running`);
    console.log(lines.map((l) => `  ${l}`).join('\n') + '\n');
  });
  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    if (!fixedPort && triesLeft > 0) {
      console.warn(`Port ${port} is busy, trying ${port + 1}…`);
      start(port + 1, triesLeft - 1);
    } else {
      console.error(`\nPort ${port} is already used by another program.`);
      console.error(`Choose another free port in your .env file, e.g.  PORT=${port + 11}`);
      console.error('Check which ports are busy:  Windows: netstat -ano | findstr LISTENING   Linux/Mac: ss -ltn  (or lsof -i -P | grep LISTEN)\n');
      process.exit(1);
    }
  });
}
// Don't start a second copy if AdBazaar is already running (e.g. auto-start + double-click).
(async () => {
  try {
    const prev = fs.readFileSync(URL_FILE, 'utf8').trim();
    const r = await fetch(`${prev}/healthz`, { signal: AbortSignal.timeout(1500) });
    if ((await r.json()).app === 'adbazaar') {
      console.log(`AdBazaar is already running at ${prev} — not starting a second copy.`);
      console.log('To restart it: stop it first (windows\\stop.bat, or "pm2 restart adbazaar").');
      process.exitCode = 0;
      return;
    }
  } catch {
    // Not running — remove leftovers from a crash so helper scripts don't report a stale address.
    fs.rmSync(PID_FILE, { force: true }); fs.rmSync(URL_FILE, { force: true });
  }
  start(Number(process.env.PORT || 3000), 20);
})();
