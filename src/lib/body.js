'use strict';
// Request body parsing: urlencoded, JSON and multipart/form-data (no dependencies).

const MAX_BODY = Number(process.env.MAX_UPLOAD_MB || 30) * 1024 * 1024;

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > limit) {
        failed = true;
        const e = new Error('Upload too large. Please use smaller files.');
        e.status = 413;
        reject(e);
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function addField(obj, key, value) {
  if (key.endsWith('[]')) {
    const k = key.slice(0, -2);
    (obj[k] = obj[k] || []).push(value);
  } else {
    obj[key] = value;
  }
}

function parseMultipart(buf, boundary) {
  const fields = {};
  const files = {};
  const delim = Buffer.from(`--${boundary}`);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    pos += delim.length;
    if (buf[pos] === 45 && buf[pos + 1] === 45) break; // closing "--"
    pos += 2; // CRLF
    const headerEnd = buf.indexOf('\r\n\r\n', pos);
    if (headerEnd === -1) break;
    const headers = buf.subarray(pos, headerEnd).toString('utf8');
    const next = buf.indexOf(delim, headerEnd + 4);
    if (next === -1) break;
    const data = buf.subarray(headerEnd + 4, next - 2);
    const name = /;\s*name="([^"]*)"/i.exec(headers)?.[1];
    const filename = /;\s*filename="([^"]*)"/i.exec(headers)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1];
    if (name) {
      if (filename !== undefined) {
        if (data.length > 0) {
          const key = name.replace(/\[\]$/, '');
          (files[key] = files[key] || []).push({ filename, mimetype: type, data: Buffer.from(data) });
        }
      } else {
        addField(fields, name, data.toString('utf8'));
      }
    }
    pos = next;
  }
  return { fields, files };
}

async function parseBody(req) {
  if (req.method !== 'POST') return;
  const type = String(req.headers['content-type'] || '');
  const raw = await readRaw(req, MAX_BODY);
  if (type.startsWith('multipart/form-data')) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
    if (!boundary) return;
    const { fields, files } = parseMultipart(raw, boundary[1] || boundary[2]);
    req.body = fields;
    req.files = files;
  } else if (type.startsWith('application/json')) {
    try { req.body = JSON.parse(raw.toString('utf8') || '{}'); } catch { req.body = {}; }
    req.rawBody = raw;
  } else {
    const params = new URLSearchParams(raw.toString('utf8'));
    const out = {};
    for (const [k, v] of params) addField(out, k, v);
    req.body = out;
    req.rawBody = raw;
  }
}

module.exports = { parseBody, parseMultipart };
