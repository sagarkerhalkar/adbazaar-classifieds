// Search suggestions under the header search box: categories, matching ads and cities, as you type.
// Keyboard: ↓ ↑ to move, Enter to open, Esc to close.
(function () {
  const input = document.querySelector('.hsearch input[name="q"]');
  if (!input) return;
  const form = input.form;
  const box = document.createElement('div');
  box.className = 'suggest';
  box.id = 'search-suggest';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  form.appendChild(box);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-controls', box.id);
  input.setAttribute('aria-autocomplete', 'list');

  let timer = 0; let lastQ = ''; let items = []; let active = -1; let ctl = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mark = (text, q) => {
    const safe = esc(text);
    const w = q.trim().split(/\s+/).filter((x) => x.length >= 2).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return w.length ? safe.replace(new RegExp('(' + w.join('|') + ')', 'ig'), '<b>$1</b>') : safe;
  };
  const whereVal = () => (form.querySelector('[name="where"]') || {}).value || '';
  const catVal = () => (form.querySelector('[name="cat"]') || {}).value || '';

  function close() { box.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
  function open() { if (items.length) { box.hidden = false; input.setAttribute('aria-expanded', 'true'); } }
  function setActive(i) {
    active = i;
    items.forEach((el, k) => { el.classList.toggle('on', k === i); el.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    if (items[i]) input.setAttribute('aria-activedescendant', items[i].id); else input.removeAttribute('aria-activedescendant');
  }

  function render(d, q) {
    const where = whereVal(); const cat = catVal();
    const rows = [];
    const qs = (o) => '/?' + new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v))).toString();
    (d.cats || []).forEach((c) => rows.push({ href: qs({ cat: c.slug, where }), cls: 'cat', html: '<span class="sg-kind">Category</span><span class="sg-text">' + mark(c.name, q) + (c.parent ? ' <span class="sg-sub">in ' + esc(c.parent) + '</span>' : '') + '</span><span class="sg-n">' + c.n + '</span>' }));
    (d.ads || []).forEach((a) => rows.push({ href: '/ad/' + a.id, cls: 'ad', html: '<span class="sg-kind">Ad</span><span class="sg-text">' + mark(a.title, q) + '</span><span class="sg-sub">' + esc(a.city) + '</span>' }));
    (d.cities || []).forEach((c) => rows.push({ href: qs({ q: q.replace(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim(), where: c, cat }), cls: 'city', html: '<span class="sg-kind">Place</span><span class="sg-text">All ads in ' + esc(c) + '</span>' }));
    rows.push({ href: qs({ q, where, cat }), cls: 'all', html: '<span class="sg-kind">Search</span><span class="sg-text">All results for “' + esc(q) + '”</span>' });
    box.innerHTML = rows.map((r, i) => '<a id="sg-' + i + '" role="option" class="sg ' + r.cls + '" href="' + esc(r.href) + '">' + r.html + '</a>').join('');
    items = Array.from(box.querySelectorAll('a'));
    setActive(-1);
    open();
  }

  function fetchNow() {
    const q = input.value.trim();
    if (q === lastQ && items.length) { open(); return; }
    lastQ = q;
    if (q.length < 2) { items = []; box.innerHTML = ''; close(); return; }
    if (ctl) ctl.abort();
    ctl = 'AbortController' in window ? new AbortController() : null;
    fetch('/api/suggest?q=' + encodeURIComponent(q), { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && input.value.trim() === q) render(d, q); })
      .catch(() => {});
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(fetchNow, 160); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) fetchNow(); });
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active <= 0 ? items.length - 1 : active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); window.location.href = items[active].href; }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
})();
