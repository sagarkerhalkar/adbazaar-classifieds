// Checks a photo or document the moment it is chosen — before anything is uploaded:
//   - wrong type (not JPG/PNG/WEBP, or PDF where PDF is not allowed)  → message at once, file removed
//   - too many photos (data-max-files)                                 → message at once
//   - a big photo (more than ~1.5 MB, or larger than data-max-px)      → made smaller in the browser (sharp, ~200–600 KB)
//   - still too big after shrinking, or a PDF over data-max-mb         → message at once
// Videos are checked separately (length and size) in app.js.
// Attributes on <input type=file>: data-max-mb (default 5), data-max-px (default 1600), data-max-files, data-no-shrink.
(function () {
  const MB = 1024 * 1024;
  const fmt = (b) => (b >= MB ? (b / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const isImage = (f) => /^image\/(jpeg|png|webp|heic|heif|gif|bmp)$/i.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

  function msgFor(input) {
    let m = input.parentElement.querySelector(':scope > .upmsg');
    if (!m) { m = document.createElement('small'); m.className = 'upmsg'; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); input.insertAdjacentElement('afterend', m); }
    return m;
  }
  const say = (input, text, tone) => { const m = msgFor(input); m.textContent = text; m.className = 'upmsg ' + (tone || ''); };

  async function decode(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall back below */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  async function shrink(file, maxPx, maxBytes, keepPng) {
    const img = await decode(file);
    const w0 = img.width || img.naturalWidth; const h0 = img.height || img.naturalHeight;
    let scale = Math.min(1, maxPx / Math.max(w0, h0));
    const type = keepPng ? 'image/png' : 'image/jpeg';
    for (let attempt = 0; attempt < 5; attempt++) {
      const w = Math.max(1, Math.round(w0 * scale)); const h = Math.max(1, Math.round(h0 * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!keepPng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      const q = [0.85, 0.8, 0.72, 0.65, 0.6][attempt];
      const blob = await new Promise((r) => c.toBlob(r, type, q));
      if (blob && (blob.size <= maxBytes || attempt === 4)) {
        const name = file.name.replace(/\.[^.]+$/, '') + (keepPng ? '.png' : '.jpg');
        return new File([blob], name, { type, lastModified: Date.now() });
      }
      scale *= 0.8;
    }
    return file;
  }

  async function check(input) {
    const files = Array.from(input.files || []);
    if (!files.length) { say(input, ''); thumbs(input, []); return true; }
    const maxMb = Number(input.dataset.maxMb) || 5; const maxBytes = maxMb * MB;
    const maxPx = Number(input.dataset.maxPx) || 1600;
    const maxFiles = Number(input.dataset.maxFiles) || 0;
    const acceptPdf = /pdf/.test(input.accept || '');
    const fail = (text) => { input.value = ''; say(input, text, 'bad'); input.setCustomValidity(''); return false; };

    if (maxFiles && files.length > maxFiles) return fail(`You can add ${maxFiles} more photo${maxFiles === 1 ? '' : 's'} here — you chose ${files.length}. Please choose fewer.`);
    const out = []; let before = 0; let after = 0; let shrunk = 0;
    say(input, files.length > 1 ? `Checking ${files.length} photos…` : 'Checking…', 'busy');
    for (const f of files) {
      before += f.size;
      if (isPdf(f)) {
        if (!acceptPdf) return fail(`"${f.name}" is a PDF. Please choose a photo (JPG, PNG or WEBP).`);
        if (f.size > maxBytes) return fail(`"${f.name}" is ${fmt(f.size)} — the limit is ${maxMb} MB. Take a photo of the document instead, or make the PDF smaller.`);
        out.push(f); after += f.size; continue;
      }
      if (!isImage(f)) return fail(`"${f.name}" is not a photo. Please choose a JPG, PNG or WEBP picture${acceptPdf ? ' or a PDF' : ''}.`);
      const heic = /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
      const needShrink = !input.hasAttribute('data-no-shrink') && (heic || f.size > Math.min(maxBytes, 1.5 * MB) || f.type === 'image/bmp');
      if (!needShrink) {
        if (f.size > maxBytes) return fail(`"${f.name}" is ${fmt(f.size)} — the limit is ${maxMb} MB. Please choose a smaller picture.`);
        out.push(f); after += f.size; continue;
      }
      try {
        const small = await shrink(f, maxPx, Math.min(maxBytes, 900 * 1024), f.type === 'image/png' && maxPx <= 600);
        if (small.size > maxBytes) return fail(`"${f.name}" is too big even after making it smaller (${fmt(small.size)}). Please choose another picture.`);
        out.push(small); after += small.size; shrunk += 1;
      } catch (e) {
        if (heic) return fail(`"${f.name}" is an iPhone HEIC photo this browser cannot read. On the iPhone: Settings → Camera → Formats → "Most Compatible", or send a screenshot of the photo.`);
        if (f.size > maxBytes) return fail(`"${f.name}" is ${fmt(f.size)} — the limit is ${maxMb} MB. Please choose a smaller picture.`);
        out.push(f); after += f.size;
      }
    }
    if (shrunk) {
      try { const dt = new DataTransfer(); out.forEach((f) => dt.items.add(f)); input.files = dt.files; } catch (e) {
        if (files.some((f) => f.size > maxBytes)) return fail(`This picture is bigger than ${maxMb} MB and this browser cannot make it smaller. Please choose a smaller picture.`);
      }
    }
    const n = out.length;
    thumbs(input, out);
    say(input, shrunk
      ? `✓ ${n === 1 ? 'Photo' : `${n} photos`} ready — made smaller for fast upload (${fmt(before)} → ${fmt(after)}).`
      : `✓ ${n === 1 ? (isPdf(out[0]) ? 'Document' : 'Photo') : `${n} photos`} ready (${fmt(after)}).`, 'ok');
    return true;
  }

  // Small previews of the chosen photos under the box.
  function thumbs(input, files) {
    let box = input.parentElement.querySelector(':scope > .upthumbs');
    if (!box) { box = document.createElement('div'); box.className = 'upthumbs'; (msgFor(input)).insertAdjacentElement('afterend', box); }
    box.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src));
    box.innerHTML = '';
    files.filter((f) => !isPdf(f)).slice(0, 10).forEach((f, i) => {
      const fig = document.createElement('figure'); const img = document.createElement('img');
      img.src = URL.createObjectURL(f); img.alt = ''; fig.appendChild(img);
      if (i === 0 && files.length > 1) { const cap = document.createElement('figcaption'); cap.textContent = 'Cover'; fig.appendChild(cap); }
      box.appendChild(fig);
    });
  }

  const busy = new WeakSet();
  document.addEventListener('change', async (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.hasAttribute('data-video-input')) return;
    if (input.hasAttribute('data-autosubmit')) e.stopImmediatePropagation();
    busy.add(input);
    let ok = false;
    try { ok = await check(input); } finally { busy.delete(input); }
    if (ok && input.hasAttribute('data-autosubmit') && input.files.length) input.form.submit();
  }, true);

  // Do not send a form while its photos are still being prepared.
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const waiting = Array.from(form.querySelectorAll('input[type=file]')).some((i) => busy.has(i));
    if (waiting) { e.preventDefault(); const i = Array.from(form.querySelectorAll('input[type=file]')).find((x) => busy.has(x)); say(i, 'Preparing your photos… one moment, then press the button again.', 'busy'); }
  }, true);
})();
