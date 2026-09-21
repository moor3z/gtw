import { api, basket, lineHtml, wireLines, gbp, esc, $ } from './site.js?v=5';

const root = $('#basket-root');
let seq = 0;

export function totalsHtml(q) {
  return `<dl class="totals">
    <div><dt>Subtotal</dt><dd>${gbp(q.subtotal_pence)}</dd></div>
    <div><dt>${esc(q.delivery_name || 'Delivery')}</dt><dd>${q.delivery_pence ? gbp(q.delivery_pence) : 'Free'}</dd></div>
    <div class="grand"><dt>Total</dt><dd>${gbp(q.total_pence)}</dd></div></dl>`;
}

async function render() {
  const items = basket.read();
  if (!items.length) {
    root.innerHTML = `<div class="empty"><h2>Your basket is empty</h2><p>Pick a scent and it will show up here.</p><a class="btn btn-primary" href="/shop">Shop Wax Melts</a></div>`;
    return;
  }
  const mine = ++seq;
  let q;
  try { q = await api('/api/quote', { method: 'POST', body: JSON.stringify({ items: basket.payload() }) }); }
  catch (e) { root.innerHTML = `<div class="notice notice-error" role="alert"><p>${esc(e.message)}</p><button class="btn btn-ghost btn-sm" id="retry">Try again</button></div>`; $('#retry').onclick = render; return; }
  if (mine !== seq) return; // a newer change is already rendering

  // Refresh the cached names/prices so the drawer matches the server
  const cached = basket.read();
  let changed = false;
  for (const l of q.lines) { const c = cached.find((i) => i.variant_id === l.variant_id); if (c && l.name && c.unit_pence !== l.unit_pence) { c.unit_pence = l.unit_pence; changed = true; } }
  if (changed) try { localStorage.setItem('otr_basket_v1', JSON.stringify(cached)); } catch {}

  const problems = q.lines.filter((l) => !l.ok);
  root.innerHTML = `<div class="two-col"><div>
      ${problems.length ? `<div class="notice notice-error" role="alert"><h2>Some items need your attention</h2><p>Remove them or lower the quantity to continue.</p></div>` : ''}
      <ul class="lines">${q.lines.map((l) => lineHtml(l, { problem: l.ok ? '' : l.message })).join('')}</ul>
      <p style="margin-top:1rem"><a href="/shop">Continue shopping</a></p>
    </div>
    <aside class="summary-box" aria-labelledby="sum-title"><h2 id="sum-title">Summary</h2>
      ${q.to_free_delivery_pence > 0 ? `<p class="free-hint">Spend ${gbp(q.to_free_delivery_pence)} more for free UK delivery.</p>` : q.free_delivery ? `<p class="free-hint">You have free UK delivery.</p>` : ''}
      ${totalsHtml(q)}
      ${q.ok ? `<a class="btn btn-primary btn-block" href="/checkout">Checkout</a>` : `<button class="btn btn-block" disabled>Checkout</button>`}
      <p class="small muted" style="margin:.75rem 0 0">No account needed. UK delivery only.</p>
    </aside></div>`;
}

if (root) { wireLines(root, render); document.addEventListener('basket:change', render); render(); }
