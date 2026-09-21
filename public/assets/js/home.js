import { api, getConfig, productCard, wireAddButtons, gbp, $ } from './site.js?v=5';

getConfig().then((c) => {
  if (c.hero_headline) $('#hero-headline').textContent = c.hero_headline;
  if (c.hero_sub) $('#hero-sub').textContent = c.hero_sub;
  if (c.intro_title) $('#intro-title').textContent = c.intro_title;
  $('#intro-text').textContent = c.intro_text || '';
  const bits = [];
  if (c.free_delivery_threshold_pence) bits.push(`Free UK delivery over ${gbp(c.free_delivery_threshold_pence)}`);
  else if (c.delivery_pence) bits.push(`UK delivery ${gbp(c.delivery_pence)}`);
  $('#hero-note').textContent = bits.join('');
}).catch(() => {});

const root = $('#featured');
api('/api/products').then(({ products }) => {
  let picks = products.filter((p) => p.featured && p.available);
  picks = [...picks, ...products.filter((p) => p.available && !picks.includes(p))]; // top up so the grid fills evenly
  picks = picks.slice(0, 8);
  root.innerHTML = picks.length ? `<ul class="grid">${picks.map(productCard).join('')}</ul>`
    : `<div class="empty"><p>Products are on their way. Check back soon.</p></div>`;
  wireAddButtons(root, (id) => products.find((p) => p.id === id));
}).catch((e) => { root.innerHTML = `<div class="notice notice-error" role="alert"><p>${e.message}</p><button class="btn btn-ghost btn-sm" data-reload>Try again</button></div>`; });
