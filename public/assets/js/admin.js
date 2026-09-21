// Admin area. All data comes from /api/admin/*, which only answers requests
// carrying a valid Cloudflare Access sign-in (verified on the server).
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = (p) => '£' + (p / 100).toFixed(2);
const toPence = (s) => { const n = Number(String(s).replace(/[£,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const when = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const panel = $('#panel'), editor = $('#editor');
const CATEGORIES = [['snap-bars', 'Snap Bars'], ['wax-melt-shapes', 'Wax Melt Shapes'], ['sample-boxes', 'Sample Boxes'], ['gift-sets', 'Gift Sets'], ['accessories', 'Accessories']];
const SCENTS = ['fresh', 'floral', 'fruity', 'sweet', 'seasonal'];
const FULFILMENT = ['unfulfilled', 'packed', 'dispatched', 'delivered', 'cancelled'];

async function api(path, { method = 'GET', body, raw, type } = {}) {
  const res = await fetch('/api/admin' + path, {
    method, redirect: 'manual',
    headers: { 'x-otr-admin': '1', ...(body ? { 'content-type': type || 'application/json' } : {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.type === 'opaqueredirect' || res.status === 302) { location.reload(); throw new Error('Signing in again…'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status}).`); e.status = res.status; e.fields = data.fields; throw e; }
  return data;
}
const fail = (e) => { panel.innerHTML = `<div class="notice notice-error" role="alert" style="margin-top:1.5rem"><h2>${e.status === 503 ? 'Admin is not ready yet' : e.status === 401 || e.status === 403 ? 'You are not signed in as an admin' : 'Something went wrong'}</h2><p>${esc(e.message)}</p></div>`; };
const flash = (msg) => { const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg }); t.setAttribute('role', 'status'); document.body.append(t); setTimeout(() => t.remove(), 3000); };
const fieldErrors = (form, e) => {
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  $('.form-msg', form).innerHTML = `<div class="notice notice-error" role="alert"><p>${esc(e.message)}</p>${e.fields ? `<ul>${Object.values(e.fields).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</div>`;
  $('.form-msg', form).scrollIntoView({ block: 'center' });
};

/* ── Orders ─────────────────────────────────────────────────────────────── */
let orderView = 'paid';
async function showOrders() {
  const { orders } = await api(`/orders?view=${orderView}`);
  panel.innerHTML = `<div class="bar"><h1>Orders</h1>
    <label class="visually-hidden" for="view">Show</label><select id="view" style="width:auto">
      <option value="paid">Paid orders</option><option value="other">Unpaid, expired and demo</option><option value="all">Everything</option></select></div>
    ${orders.length ? `<ul class="rows">${orders.map((o) => `<li class="row order">
      <div><span class="row-title">${esc(o.ref)}</span> ${statusTag(o)} <span class="tag">${esc(o.fulfilment)}</span>
        <p class="row-sub">${esc(o.name)}, ${o.item_count} item${o.item_count === 1 ? '' : 's'}, ${gbp(o.total_pence)}, ${when(o.paid_at || o.created_at)}</p></div>
      <button class="btn btn-ghost btn-sm" data-order="${esc(o.id)}">Open</button></li>`).join('')}</ul>`
      : `<div class="empty"><p>${orderView === 'paid' ? 'No paid orders yet. They appear here as soon as Stripe confirms a payment.' : 'Nothing to show.'}</p></div>`}`;
  $('#view').value = orderView;
  $('#view').onchange = (e) => { orderView = e.target.value; showOrders().catch(fail); };
}
const statusTag = (o) => `<span class="tag ${o.status === 'paid' ? 'paid' : o.status === 'review' || o.status === 'failed' ? 'warn' : ''}">${esc(o.status)}${o.mode === 'test' ? ' (test)' : ''}</span>`;

async function openOrder(id) {
  const { order: o } = await api(`/orders/${id}`);
  const a = o.address;
  editor.innerHTML = `<form method="dialog" id="order-form"><h2 id="editor-title">Order ${esc(o.ref)}</h2><div class="form-msg"></div>
    <p>${statusTag(o)} ${o.status === 'paid' ? `Paid ${when(o.paid_at)}` : `Created ${when(o.created_at)}. Not paid, do not send.`}</p>
    <dl class="kv"><dt>Customer</dt><dd>${esc(o.name)}<br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.phone ? `<br>${esc(o.phone)}` : ''}</dd>
      <dt>Deliver to</dt><dd>${[o.name, a.line1, a.line2, a.city, a.county, a.postcode].filter(Boolean).map(esc).join('<br>')}</dd>
      ${o.payment_intent ? `<dt>Stripe ref</dt><dd>${esc(o.payment_intent)}</dd>` : ''}</dl>
    <ul class="rows">${o.items.map((i) => `<li class="row order"><div><span class="row-title">${esc(i.name)}${i.label ? ` (${esc(i.label)})` : ''}</span><p class="row-sub">${i.qty} × ${gbp(i.unit_pence)}</p></div><strong>${gbp(i.line_pence)}</strong></li>`).join('')}</ul>
    <dl class="kv"><dt>Subtotal</dt><dd>${gbp(o.subtotal_pence)}</dd><dt>Delivery</dt><dd>${gbp(o.delivery_pence)}</dd><dt><strong>Total</strong></dt><dd><strong>${gbp(o.total_pence)}</strong></dd></dl>
    <div class="field"><label for="fulfilment">Fulfilment status</label><select id="fulfilment">${FULFILMENT.map((f) => `<option${f === o.fulfilment ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="field"><label for="note">Private note</label><textarea id="note">${esc(o.admin_note)}</textarea></div>
    <div class="editor-actions"><button class="btn btn-primary" type="submit" value="save">Save order</button><button class="btn btn-ghost" type="button" data-close>Close</button></div></form>`;
  editor.showModal();
  $('#order-form').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/orders/${id}`, { method: 'PUT', body: { fulfilment: $('#fulfilment').value, admin_note: $('#note').value } }); editor.close(); flash('Order saved'); showOrders(); }
    catch (err) { fieldErrors(e.target, err); }
  };
}

/* ── Products ───────────────────────────────────────────────────────────── */
let products = [];
async function showProducts() {
  ({ products } = await api('/products'));
  const samples = products.filter((p) => p.is_sample).length;
  panel.innerHTML = `<div class="bar"><h1>Products</h1><button class="btn btn-primary btn-sm" data-new-product>Add product</button></div>
    ${samples ? `<div class="notice notice-demo"><p><strong>${samples} sample product${samples === 1 ? '' : 's'} with made-up prices.</strong> Edit them into real products (saving removes the Sample tag) or clear them out.</p><button class="btn btn-ghost btn-sm" data-delete-samples>Delete all sample products</button></div>` : ''}
    ${products.length ? `<ul class="rows">${products.map((p) => `<li class="row"><img src="${esc(p.image_url || '/assets/ph/blank.svg')}" alt="">
      <div><span class="row-title">${esc(p.name)}</span> ${p.is_sample ? '<span class="tag sample">Sample</span>' : ''}${p.hidden ? '<span class="tag hidden">Hidden</span>' : ''}${p.sold_out ? '<span class="tag warn">Marked sold out</span>' : !p.available ? '<span class="tag warn">Out of stock</span>' : ''}
        <p class="row-sub">${p.variants.map((v) => `${p.variants.length > 1 ? esc(v.label) + ' ' : ''}${gbp(v.price_pence)}, ${v.stock} in stock`).join(' | ')}</p></div>
      <button class="btn btn-ghost btn-sm" data-product="${esc(p.id)}">Edit</button></li>`).join('')}</ul>` : `<div class="empty"><p>No products yet. Add your first one.</p></div>`}`;
}

const variantRow = (v = {}) => `<div class="variant" data-vid="${esc(v.id || '')}">
  <div><label>Option name<input type="text" data-v="label" value="${esc(v.label && v.label !== 'Default' ? v.label : '')}" placeholder="e.g. Bag of 6"></label></div>
  <div><label>Price (£)<input type="text" inputmode="decimal" data-v="price" value="${v.price_pence != null ? (v.price_pence / 100).toFixed(2) : ''}" required></label></div>
  <div><label>Stock<input type="number" min="0" step="1" data-v="stock" value="${v.stock ?? 0}" required></label></div>
  <button type="button" class="link-btn" data-remove-variant aria-label="Remove this option">Remove</button></div>`;

function openProduct(p) {
  const isNew = !p; p = p || { scents: [], variants: [{}], image_url: '' };
  editor.innerHTML = `<form id="product-form"><h2 id="editor-title">${isNew ? 'Add product' : 'Edit product'}</h2><div class="form-msg"></div>
    <div class="field"><label for="p-name">Name</label><input id="p-name" type="text" value="${esc(p.name)}" required></div>
    <div class="row-2"><div class="field"><label for="p-cat">Category</label><select id="p-cat">${CATEGORIES.map(([id, n]) => `<option value="${id}"${id === p.category ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label for="p-sort">Position <span class="hint">Lower numbers show first</span></label><input id="p-sort" type="number" step="1" value="${p.sort ?? 0}"></div></div>
    <fieldset class="field" style="border:0;padding:0"><legend>Scent filters</legend><div class="checks">${SCENTS.map((s) => `<label><input type="checkbox" name="scent" value="${s}"${p.scents.includes(s) ? ' checked' : ''}>${s[0].toUpperCase() + s.slice(1)}</label>`).join('')}</div></fieldset>
    <div class="field"><label>Image</label><div class="img-pick"><img id="p-img" src="${esc(p.image_url || '/assets/ph/blank.svg')}" alt="Current image">
      <div><input type="file" id="p-file" accept="image/jpeg,image/png,image/webp"><span class="hint" id="p-file-note">Photos are resized and compressed automatically before upload.</span></div></div><input type="hidden" id="p-image-url" value="${esc(p.image_url)}"></div>
    <div class="field"><label for="p-short">Short scent description <span class="hint">Shown on product cards</span></label><input id="p-short" type="text" maxlength="200" value="${esc(p.short_desc)}"></div>
    <div class="field"><label for="p-desc">Full description</label><textarea id="p-desc">${esc(p.description)}</textarea></div>
    <fieldset class="field" style="border:0;padding:0"><legend>Price and stock</legend>
      <div class="field"><label for="p-option">What customers choose between <span class="hint">Only needed with more than one option, e.g. Size or Scent</span></label><input id="p-option" type="text" value="${esc(p.option_name)}"></div>
      <div id="variants">${p.variants.map(variantRow).join('')}</div><button type="button" class="btn btn-ghost btn-sm" id="add-variant">Add another option</button></fieldset>
    <div class="field"><label for="p-weight">Weight or size</label><input id="p-weight" type="text" value="${esc(p.weight)}"></div>
    <div class="field"><label for="p-usage">Usage instructions</label><textarea id="p-usage">${esc(p.usage)}</textarea></div>
    <div class="field"><label for="p-safety">Product-specific safety information</label><textarea id="p-safety">${esc(p.safety)}</textarea></div>
    <div class="checks field"><label><input type="checkbox" id="p-featured"${p.featured ? ' checked' : ''}>Feature on homepage</label><label><input type="checkbox" id="p-soldout"${p.sold_out ? ' checked' : ''}>Mark as sold out</label><label><input type="checkbox" id="p-hidden"${p.hidden ? ' checked' : ''}>Hide from shop</label></div>
    <div class="editor-actions"><button class="btn btn-primary" type="submit">Save product</button><button class="btn btn-ghost" type="button" data-close>Cancel</button>${isNew ? '' : '<button class="link-btn" type="button" id="p-delete" style="margin-left:auto;color:var(--danger)">Delete product</button>'}</div></form>`;
  editor.showModal();
  const form = $('#product-form');
  $('#add-variant').onclick = () => $('#variants').insertAdjacentHTML('beforeend', variantRow());
  $('#variants').onclick = (e) => { if (e.target.closest('[data-remove-variant]') && $('#variants').children.length > 1) e.target.closest('.variant').remove(); };
  $('#p-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const note = $('#p-file-note'); note.textContent = 'Uploading…';
    try { const blob = await shrink(file); const { url } = await api('/images', { method: 'POST', body: blob, raw: true, type: blob.type }); $('#p-image-url').value = url; $('#p-img').src = url; note.textContent = `Uploaded (${Math.round(blob.size / 1024)} KB). Save the product to keep it.`; }
    catch (err) { note.textContent = err.message; }
  };
  if (!isNew) $('#p-delete').onclick = async () => { if (!confirm(`Delete “${p.name}”? This cannot be undone. Past orders keep their record of it.`)) return; try { await api(`/products/${p.id}`, { method: 'DELETE' }); editor.close(); flash('Product deleted'); showProducts(); } catch (err) { fieldErrors(form, err); } };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name: $('#p-name').value, category: $('#p-cat').value, sort: parseInt($('#p-sort').value, 10) || 0,
      scents: [...form.querySelectorAll('[name=scent]:checked')].map((c) => c.value), image_url: $('#p-image-url').value,
      short_desc: $('#p-short').value, description: $('#p-desc').value, option_name: $('#p-option').value, weight: $('#p-weight').value,
      usage: $('#p-usage').value, safety: $('#p-safety').value, featured: $('#p-featured').checked, sold_out: $('#p-soldout').checked, hidden: $('#p-hidden').checked,
      variants: [...$('#variants').children].map((row) => ({ id: row.dataset.vid || undefined, label: $('[data-v=label]', row).value, price_pence: toPence($('[data-v=price]', row).value), stock: parseInt($('[data-v=stock]', row).value, 10) })),
    };
    try { await api(isNew ? '/products' : `/products/${p.id}`, { method: isNew ? 'POST' : 'PUT', body }); editor.close(); flash('Product saved'); showProducts(); }
    catch (err) { fieldErrors(form, err); }
  };
}

// Resize to max 1200px and re-encode as WebP (falls back to JPEG) so uploads stay small.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = (type, q) => new Promise((r) => c.toBlob(r, type, q));
  let out = await blob('image/webp', 0.82);
  if (!out || out.type !== 'image/webp') out = await blob('image/jpeg', 0.85);
  return out;
}

/* ── Settings ───────────────────────────────────────────────────────────── */
async function showSettings() {
  const [{ settings: s }, me] = await Promise.all([api('/settings'), api('/me')]);
  const text = (k, label, hint = '', area = false) => `<div class="field"><label for="s-${k}">${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>${area ? `<textarea id="s-${k}" data-k="${k}">${esc(s[k])}</textarea>` : `<input id="s-${k}" data-k="${k}" type="text" value="${esc(s[k])}">`}</div>`;
  const money = (k, label, hint) => `<div class="field"><label for="s-${k}">${label} <span class="hint">${hint}</span></label><input id="s-${k}" data-money="${k}" type="text" inputmode="decimal" value="${s[k] && s[k] !== '0' ? (s[k] / 100).toFixed(2) : ''}"></div>`;
  const missing = ['contact_email', 'business_address'].filter((k) => !s[k]);
  panel.innerHTML = `<div class="bar"><h1>Delivery &amp; settings</h1></div><form id="settings-form"><div class="form-msg"></div>
    <div class="panel-card"><h2>Status</h2><dl class="kv"><dt>Payments</dt><dd>${{ demo: 'Demo mode. Stripe keys are not set, so no payments can be taken.', test: 'Stripe TEST mode. Only test cards work; no real money moves.', live: 'Stripe LIVE mode. Real payments.' }[me.payment_mode]}</dd>
      <dt>Order emails</dt><dd>${me.email_configured ? 'On' : 'Off. No email provider is configured.'}</dd></dl></div>
    <div class="panel-card"><h2>Delivery (UK only)</h2><div class="row-2">${money('delivery_pence', 'Delivery charge (£)', 'Flat rate per order')}${money('free_delivery_threshold_pence', 'Free delivery over (£)', 'Leave blank for no free delivery')}</div>
      ${text('delivery_name', 'Delivery name', 'Shown in the basket and on Stripe')}${text('dispatch_estimate', 'Dispatch estimate', 'Shown on product pages and confirmations')}</div>
    <div class="panel-card"><h2>Homepage wording</h2>${text('announcement', 'Announcement bar', 'Leave blank to hide')}${text('hero_headline', 'Headline')}${text('hero_sub', 'Line under the headline')}${text('intro_title', 'About section title')}${text('intro_text', 'About section text', '', true)}</div>
    <div class="panel-card"><h2>Business details</h2>${missing.length ? '<div class="notice notice-demo"><p>Needed before launch: a contact email and your business address. They appear on the Contact page and in the footer.</p></div>' : ''}
      ${text('business_name', 'Business name')}${text('contact_email', 'Public contact email')}${text('contact_phone', 'Public phone number', 'Optional')}${text('business_address', 'Business address', '', true)}${text('order_notify_email', 'Send new-order alerts to', 'Needs an email provider')}</div>
    <button class="btn btn-primary" type="submit">Save settings</button></form>`;
  $('#settings-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    panel.querySelectorAll('[data-k]').forEach((i) => (body[i.dataset.k] = i.value));
    for (const i of panel.querySelectorAll('[data-money]')) { const p = i.value.trim() === '' ? 0 : toPence(i.value); body[i.dataset.money] = Number.isNaN(p) ? 'x' : String(p); }
    try { await api('/settings', { method: 'PUT', body }); flash('Settings saved'); showSettings(); } catch (err) { fieldErrors(e.target, err); }
  };
}

/* ── Pages ──────────────────────────────────────────────────────────────── */
async function showPages() {
  const { pages } = await api('/pages');
  panel.innerHTML = `<div class="bar"><h1>Pages</h1></div><ul class="rows">${pages.map((p) => `<li class="row order"><div><span class="row-title">${esc(p.title)}</span> ${p.needs_review ? '<span class="tag sample">Placeholder, needs completing</span>' : '<span class="tag paid">Ready</span>'}<p class="row-sub">/${esc(p.slug)}, updated ${when(p.updated_at)}</p></div><button class="btn btn-ghost btn-sm" data-page="${esc(p.slug)}">Edit</button></li>`).join('')}</ul>`;
  panel.onclick = null;
  panel.querySelectorAll('[data-page]').forEach((b) => (b.onclick = () => {
    const p = pages.find((x) => x.slug === b.dataset.page);
    editor.innerHTML = `<form id="page-form"><h2 id="editor-title">Edit ${esc(p.title)}</h2><div class="form-msg"></div>
      <div class="field"><label for="pg-title">Title</label><input id="pg-title" type="text" value="${esc(p.title)}"></div>
      <div class="field"><label for="pg-body">Content <span class="hint">Blank line = new paragraph. Start a line with ## for a heading or - for a bullet.</span></label><textarea id="pg-body" class="tall">${esc(p.body)}</textarea></div>
      <div class="checks field"><label><input type="checkbox" id="pg-review"${p.needs_review ? ' checked' : ''}>Still a placeholder (shows a notice on the page)</label></div>
      <div class="editor-actions"><button class="btn btn-primary" type="submit">Save page</button><button class="btn btn-ghost" type="button" data-close>Cancel</button></div></form>`;
    editor.showModal();
    $('#page-form').onsubmit = async (e) => { e.preventDefault(); try { await api(`/pages/${p.slug}`, { method: 'PUT', body: { title: $('#pg-title').value, body: $('#pg-body').value, needs_review: $('#pg-review').checked } }); editor.close(); flash('Page saved'); showPages(); } catch (err) { fieldErrors(e.target, err); } };
  }));
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */
const TABS = { orders: showOrders, products: showProducts, settings: showSettings, pages: showPages };
function go(tab) {
  document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  panel.setAttribute('aria-labelledby', `tab-${tab}`);
  history.replaceState(null, '', `#${tab}`);
  TABS[tab]().catch(fail);
}
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-tab]')) go(t.closest('[data-tab]').dataset.tab);
  else if (t.closest('[data-close]')) editor.close();
  else if (t.closest('[data-order]')) openOrder(t.closest('[data-order]').dataset.order).catch(fail);
  else if (t.closest('[data-product]')) openProduct(products.find((p) => p.id === t.closest('[data-product]').dataset.product));
  else if (t.closest('[data-new-product]')) openProduct(null);
  else if (t.closest('[data-delete-samples]')) { if (confirm('Delete every product still tagged Sample?')) api('/sample', { method: 'DELETE' }).then((r) => { flash(`${r.deleted} sample products deleted`); showProducts(); }).catch(fail); }
});
api('/me').then((me) => { $('#who').textContent = `Signed in as ${me.email}`; go(TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'orders'); }).catch(fail);
