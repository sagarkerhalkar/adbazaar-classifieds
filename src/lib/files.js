'use strict';
// Static file serving and validated upload storage.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const STORAGE = path.resolve(process.env.STORAGE_DIR || path.join(ROOT, 'storage'));
const DIRS = {
  ads: path.join(STORAGE, 'ads'),        // public ad images
  kyc: path.join(STORAGE, 'kyc'),        // PRIVATE: identity documents & live photos
  payments: path.join(STORAGE, 'payments'), // PRIVATE: payment screenshots
};
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

async function sendFile(res, file, { cache = 'public, max-age=3600', download = false } = {}) {
  let st;
  try { st = await fs.promises.stat(file); } catch { st = null; }
  if (!st || !st.isFile()) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end('Not found'); return; }
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', st.size);
  res.setHeader('Cache-Control', cache);
  if (download) res.setHeader('Content-Disposition', `inline; filename="${path.basename(file)}"`);
  res.writeHead(res.statusCode || 200);
  if (res.req && res.req.method === 'HEAD') { res.end(); return; }
  await new Promise((resolve) => {
    const s = fs.createReadStream(file);
    s.on('error', () => { res.end(); resolve(); });
    s.on('end', resolve);
    s.pipe(res);
  });
}

// Serve /public/* safely (no path traversal).
function staticDir(prefix, dir) {
  const base = path.resolve(dir);
  return async (req, res) => {
    if (!req.path.startsWith(prefix) || (req.method !== 'GET' && req.method !== 'HEAD')) return;
    let rel;
    try { rel = decodeURIComponent(req.path.slice(prefix.length)); } catch { res.statusCode = 400; res.end(); return; }
    const file = path.resolve(base, '.' + path.sep + rel);
    if (!file.startsWith(base + path.sep)) { res.statusCode = 400; res.end(); return; }
    await sendFile(res, file);
  };
}

// Detect file type by magic bytes — never trust the browser-supplied mimetype.
function detectType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return '.pdf';
  return null;
}

class UploadError extends Error {}

/**
 * Save an uploaded file after validating its real type and size.
 * @returns stored file name (not a path)
 */
function saveUpload(file, area, { allowPdf = false, maxMb = 5 } = {}) {
  if (!file) return null;
  if (file.data.length > maxMb * 1024 * 1024) throw new UploadError(`"${file.filename}" is larger than ${maxMb} MB.`);
  const ext = detectType(file.data);
  if (!ext || (ext === '.pdf' && !allowPdf)) {
    throw new UploadError(`"${file.filename}" must be a ${allowPdf ? 'JPG, PNG, WEBP or PDF' : 'JPG, PNG or WEBP image'}.`);
  }
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(12).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(DIRS[area], name), file.data, { mode: 0o640 });
  return name;
}

// Save a webcam capture sent as a data URL (data:image/jpeg;base64,...).
function saveDataUrl(dataUrl, area) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '').trim());
  if (!m) throw new UploadError('Live photo capture is missing or invalid. Please capture the photo again.');
  return saveUpload({ filename: 'live-photo', data: Buffer.from(m[2], 'base64') }, area, { maxMb: 4 });
}

const safeName = (n) => (typeof n === 'string' && /^[a-z0-9]+-[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(n) ? n : null);

function removeFile(area, name) {
  if (!safeName(name)) return;
  try { fs.rmSync(path.join(DIRS[area], name), { force: true }); } catch { /* ignore */ }
}

module.exports = { ROOT, DIRS, sendFile, staticDir, saveUpload, saveDataUrl, safeName, removeFile, UploadError };
