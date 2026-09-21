import { api, getConfig, productCard, wireAddButtons, addToBasket, gbp, esc, $ } from './site.js?v=5';

const id = new URLSearchParams(location.search).get('id') || '';
const root = $('#product-root');
const info = (title, text, open) => text ? `<details class="info"${open ? ' open' : ''}><summary>${title}</summary><div>${esc(text)}</div></details>` : '';

function render(p, cfg) {
  document.title = `${p.name} | Over The Rainbow`;
  document.querySelector('meta[name="description"]').content = p.short_desc || p.name;
  const cat = cfg.categories.find((c) => c.id === p.category);
  $('#crumb-cat').innerHTML = cat ? `<a href="/shop?category=${cat.id}">${esc(cat.name)}</a>` : '';
  const multi = p.variants.length > 1;
  let chosen = p.variants.find((v) => v.available) || p.variants[0];
  let qty = 1;

  root.innerHTML = `<div class="product">
    <div class="product-media"><img src="${esc(p.image_url || '/assets/ph/blank.svg')}" alt="${esc(p.name)}" width="800" height="800" fetchpriority="high"></div>
    <div>
      <h1>${esc(p.name)}</h1>
      <p class="price" id="price" aria-live="polite"></p>
      <p>${esc(p.short_desc)}</p>
      ${multi ? `<fieldset class="options"><legend>${esc(p.option_name || 'Option')}</legend><div class="options-list">
        ${p.variants.map((v) => `<label class="option"><input type="radio" name="variant" value="${esc(v.id)}"${v === chosen ? ' checked' : ''}${v.available ? '' : ' disabled'}><span>${esc(v.label)}${v.available ? '' : ' (sold out)'}</span></label>`).join('')}
      </div></fieldset>` : ''}
      <div class="buy-row">
        <div class="qty" role="group" aria-label="Quantity">
          <button type="button" id="minus" aria-label="Decrease quantity">−</button><output id="qty" aria-live="polite">1</output><button type="button" id="plus" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn-primary" id="add"></button>
      </div>
      <p class="small muted" id="stock-note"></p>
      <p class="small muted">${esc(cfg.dispatch_estimate || '')}</p>
      <div style="margin-top:1.5rem">
        ${info('About this scent', p.description, true)}${info('Weight and size', p.weight)}${info('How to use', p.usage)}${info('Safety information', p.safety)}
      </div>
    </div></div>`;

  const update = () => {
    $('#price').textContent = gbp(chosen.price_pence);
    const btn = $('#add');
    btn.disabled = !chosen.available; btn.className = chosen.available ? 'btn btn-primary' : 'btn';
    btn.textContent = chosen.available ? 'Add to Basket' : 'Sold out';
    $('#qty').textContent = qty;
    $('#minus').disabled = qty <= 1; $('#plus').disabled = qty >= 20 || !chosen.available;
    $('#stock-note').textContent = chosen.available && chosen.low_stock ? 'Only a few left.' : '';
  };
  root.addEventListener('change', (e) => { if (e.target.name === 'variant') { chosen = p.variants.find((v) => v.id === e.target.value); update(); } });
  $('#minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); update(); });
  $('#plus').addEventListener('click', () => { qty = Math.min(20, qty + 1); update(); });
  $('#add').addEventListener('click', () => { if (chosen.available) addToBasket(p, chosen, qty); });
  update();
}

Promise.all([getConfig(), api(`/api/products/${encodeURIComponent(id)}`), api('/api/products')]).then(([cfg, { product }, { products }]) => {
  render(product, cfg);
  const related = products.filter((x) => x.id !== product.id && x.available)
    .map((x) => ({ x, score: (x.category === product.category ? 2 : 0) + x.scents.filter((s) => product.scents.includes(s)).length }))
    .sort((a, b) => b.score - a.score).slice(0, 4).map((r) => r.x);
  if (related.length) {
    $('#related-section').hidden = false;
    $('#related').innerHTML = related.map(productCard).join('');
    wireAddButtons($('#related'), (pid) => products.find((x) => x.id === pid));
  }
}).catch((e) => {
  root.innerHTML = e.status === 404
    ? `<div class="empty" style="margin-top:1.5rem"><h1>We can't find that product</h1><p>It may have sold through or been removed.</p><a class="btn btn-primary" href="/shop">Shop Wax Melts</a></div>`
    : `<div class="notice notice-error" role="alert" style="margin-top:1.5rem"><p>${esc(e.message)}</p><button class="btn btn-ghost btn-sm" data-reload>Try again</button></div>`;
});
