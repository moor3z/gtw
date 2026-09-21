import { api, getConfig, productCard, wireAddButtons, esc, $ } from './site.js?v=5';

const params = new URLSearchParams(location.search);
const state = {
  category: params.get('category') || 'all',
  scents: new Set((params.get('scent') || '').split(',').filter(Boolean)),
  q: (params.get('q') || '').trim(), sort: params.get('sort') || 'featured',
};
let products = [], categories = [];
const results = $('#results'), count = $('#result-count');
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function syncUrl() {
  const p = new URLSearchParams();
  if (state.category !== 'all') p.set('category', state.category);
  if (state.scents.size) p.set('scent', [...state.scents].join(','));
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'featured') p.set('sort', state.sort);
  history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
}

function render() {
  const catName = categories.find((c) => c.id === state.category)?.name || 'All Products';
  $('#shop-title').textContent = state.q ? `Results for “${state.q}”` : catName;
  document.title = `${state.q ? 'Search' : catName} | Over The Rainbow`;
  $('#cats').innerHTML = [{ id: 'all', name: 'All Products' }, ...categories].map((c) =>
    `<li><button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === state.category}">${esc(c.name)}</button></li>`).join('');
  document.querySelectorAll('#scents .chip').forEach((b) => b.setAttribute('aria-pressed', String(state.scents.has(b.dataset.scent))));
  document.querySelectorAll('.site-nav a').forEach((a) => {
    const u = new URL(a.href), c = u.searchParams.get('category');
    u.pathname === '/shop' && c === state.category ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });

  const q = state.q.toLowerCase();
  let list = products.filter((p) =>
    (state.category === 'all' || p.category === state.category) &&
    (!state.scents.size || p.scents.some((s) => state.scents.has(s))) &&
    (!q || `${p.name} ${p.short_desc} ${p.scents.join(' ')}`.toLowerCase().includes(q)));
  const by = { 'price-asc': (a, b) => a.from_pence - b.from_pence, 'price-desc': (a, b) => b.from_pence - a.from_pence,
    'name-asc': (a, b) => a.name.localeCompare(b.name), 'name-desc': (a, b) => b.name.localeCompare(a.name) }[state.sort];
  if (by) list = [...list].sort(by);

  count.textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
  results.innerHTML = list.length ? `<ul class="grid">${list.map(productCard).join('')}</ul>`
    : `<div class="empty"><h2>Nothing matches that</h2><p>Try a different scent, or clear the filters to see everything.</p><button type="button" class="btn btn-primary" id="clear">Clear filters</button></div>`;
  syncUrl();
}

Promise.all([getConfig(), api('/api/products')]).then(([cfg, data]) => {
  categories = cfg.categories; products = data.products;
  if (state.category !== 'all' && !categories.some((c) => c.id === state.category)) state.category = 'all';
  $('#scents').innerHTML = cfg.scents.map((s) => `<li><button type="button" class="chip scent" data-scent="${s}" aria-pressed="false">${cap(s)}</button></li>`).join('');
  $('#sort').value = state.sort;
  render();
}).catch((e) => { results.innerHTML = `<div class="notice notice-error" role="alert"><p>${esc(e.message)}</p><button class="btn btn-ghost btn-sm" data-reload>Try again</button></div>`; });

document.addEventListener('click', (e) => {
  const cat = e.target.closest('[data-cat]'), scent = e.target.closest('[data-scent]');
  if (cat) { state.category = cat.dataset.cat; render(); $(`[data-cat="${state.category}"]`)?.focus(); }
  else if (scent) { const s = scent.dataset.scent; state.scents.has(s) ? state.scents.delete(s) : state.scents.add(s); render(); }
  else if (e.target.id === 'clear') { state.category = 'all'; state.scents.clear(); state.q = ''; document.querySelectorAll('.search-form input').forEach((i) => (i.value = '')); render(); }
});
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
// Searching while already on the shop page filters in place
document.addEventListener('submit', (e) => {
  if (!e.target.matches('.search-form')) return;
  e.preventDefault(); state.q = e.target.q.value.trim(); state.category = 'all'; render();
  $('#shop-title').scrollIntoView({ block: 'start' });
});
wireAddButtons(results, (id) => products.find((p) => p.id === id));
