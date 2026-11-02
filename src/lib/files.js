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
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

async function sendFile(res, file, { cache = 'public, max-age=3600', download = false, req = null } = {}) {
  let st;
  try { st = await fs.promises.stat(file); } catch { st = null; }
  if (!st || !st.isFile()) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end('Not found'); return; }
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Accept-Ranges', 'bytes');
  if (download) res.setHeader('Content-Disposition', `inline; filename="${path.basename(file)}"`);

  // Range requests (needed for video playback/seeking, especially on iPhone/Safari)
  let start = 0;
  let end = st.size - 1;
  const range = req && /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (range && st.size > 0) {
    if (range[1] === '') { start = Math.max(0, st.size - Number(range[2])); } else {
      start = Number(range[1]);
      if (range[2] !== '') end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= st.size) {
      res.statusCode = 416; res.setHeader('Content-Range', `bytes */${st.size}`); res.end(); return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
  }
  res.setHeader('Content-Length', st.size ? end - start + 1 : 0);
  res.writeHead(res.statusCode || 200);
  if ((req || res.req) && (req || res.req).method === 'HEAD') { res.end(); return; }
  if (st.size === 0) { res.end(); return; }
  await new Promise((resolve) => {
    const s = fs.createReadStream(file, { start, end });
    s.on('error', () => { res.end(); resolve(); });
    s.on('end', resolve);
    res.on('close', () => { s.destroy(); resolve(); });
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
  if (buf.subarray(4, 8).toString() === 'ftyp') return buf.subarray(8, 12).toString() === 'qt  ' ? '.mov' : '.mp4';
  return null;
}

// Read a video's length (seconds) from the MP4/MOV 'moov' → 'mvhd' header. Returns null if not found.
function videoDuration(buf) {
  function boxes(start, end, cb) {
    let p = start;
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p);
      const type = buf.toString('latin1', p + 4, p + 8);
      let header = 8;
      if (size === 1) { if (p + 16 > end) return; size = Number(buf.readBigUInt64BE(p + 8)); header = 16; }
      else if (size === 0) size = end - p;
      if (size < header || p + size > end) return;
      if (cb(type, p + header, p + size) === false) return;
      p += size;
    }
  }
  let seconds = null;
  boxes(0, buf.length, (type, s, e) => {
    if (type !== 'moov') return true;
    boxes(s, e, (t, cs) => {
      if (t !== 'mvhd') return true;
      const v = buf[cs];
      const timescale = v === 1 ? buf.readUInt32BE(cs + 20) : buf.readUInt32BE(cs + 12);
      const duration = v === 1 ? Number(buf.readBigUInt64BE(cs + 24)) : buf.readUInt32BE(cs + 16);
      if (timescale > 0) seconds = duration / timescale;
      return false;
    });
    return false;
  });
  return seconds;
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
  if (ext === '.mp4' || ext === '.mov') throw new UploadError(`"${file.filename}" is a video — add videos in the Videos section.`);
  if (!ext || (ext === '.pdf' && !allowPdf)) {
    throw new UploadError(`"${file.filename}" must be a ${allowPdf ? 'JPG, PNG, WEBP or PDF' : 'JPG, PNG or WEBP image'}.`);
  }
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(12).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(DIRS[area], name), file.data, { mode: 0o640 });
  return name;
}

// Save an ad video (MP4 / MOV from phone cameras) after checking its size and length.
function saveVideo(file, { maxMb = 90, maxSeconds = 60 } = {}) {
  if (!file) throw new UploadError('Choose a video file.');
  if (file.data.length > maxMb * 1024 * 1024) throw new UploadError(`The video is larger than ${maxMb} MB. Record it in 720p or trim it.`);
  const ext = detectType(file.data);
  if (ext !== '.mp4' && ext !== '.mov') throw new UploadError('Please upload an MP4 or MOV video (the normal format from phone cameras).');
  const secs = videoDuration(file.data);
  if (secs == null) throw new UploadError('Could not read the video length. Please upload a normal MP4 video.');
  if (secs > maxSeconds + 0.5) throw new UploadError(`The video is ${Math.round(secs)} seconds long. Maximum is ${maxSeconds} seconds (1 minute).`);
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(12).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(DIRS.ads, name), file.data, { mode: 0o640 });
  return { file: name, seconds: Math.round(secs) };
}

// Save a webcam capture sent as a data URL (data:image/jpeg;base64,...).
function saveDataUrl(dataUrl, area) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '').trim());
  if (!m) throw new UploadError('Live photo capture is missing or invalid. Please capture the photo again.');
  return saveUpload({ filename: 'live-photo', data: Buffer.from(m[2], 'base64') }, area, { maxMb: 4 });
}

const safeName = (n) => (typeof n === 'string' && /^[a-z0-9]+-[a-f0-9]{24}\.(jpg|png|webp|pdf|mp4|mov)$/.test(n) ? n : null);

function removeFile(area, name) {
  if (!safeName(name)) return;
  try { fs.rmSync(path.join(DIRS[area], name), { force: true }); } catch { /* ignore */ }
}

module.exports = { ROOT, DIRS, sendFile, staticDir, saveUpload, saveVideo, videoDuration, saveDataUrl, safeName, removeFile, UploadError };
