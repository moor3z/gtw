import { api, basket, gbp, esc, $ } from './site.js?v=5';

const root = $('#status-root'), view = root.dataset.view;
const token = new URLSearchParams(location.search).get('token') || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const summary = (o) => `<div class="summary-box"><h2>Order ${esc(o.ref)}</h2>
  <ul class="lines">${o.items.map((i) => `<li style="display:flex;justify-content:space-between;gap:1rem;padding:.4rem 0"><span>${esc(i.name)}${i.label ? ` (${esc(i.label)})` : ''} × ${i.qty}</span><strong>${gbp(i.line_pence)}</strong></li>`).join('')}</ul>
  <dl class="totals"><div><dt>Subtotal</dt><dd>${gbp(o.subtotal_pence)}</dd></div><div><dt>Delivery</dt><dd>${o.delivery_pence ? gbp(o.delivery_pence) : 'Free'}</dd></div>
  <div class="grand"><dt>Total</dt><dd>${gbp(o.total_pence)}</dd></div></dl></div>`;

const views = {
  paid: (o) => `<div class="status-icon" aria-hidden="true">✓</div><h1>Thank you, your order is confirmed</h1>
    <p style="margin-inline:auto">Payment received. We will send updates to ${esc(o.email_hint)}.</p>
    ${o.dispatch_estimate ? `<p class="muted" style="margin-inline:auto">${esc(o.dispatch_estimate)}</p>` : ''}${summary(o)}
    <p style="margin:1.5rem auto 0"><a class="btn btn-ghost" href="/shop">Keep shopping</a></p>`,
  confirming: (o) => `<div class="status-icon wait" aria-hidden="true">…</div><h1>We're confirming your payment</h1>
    <p style="margin-inline:auto">This usually takes a few seconds. You can leave this page. Once the payment is confirmed your order ${esc(o.ref)} is locked in.</p>
    <p style="margin-inline:auto"><button class="btn btn-ghost" data-reload>Check again</button></p>${summary(o)}`,
  notpaid: (o) => `<div class="status-icon warn" aria-hidden="true">!</div><h1>This payment didn't go through</h1>
    <p style="margin-inline:auto">You have not been charged. Your basket is still saved, so you can try again.</p>
    <p style="margin-inline:auto"><a class="btn btn-primary" href="/checkout">Return to checkout</a></p>`,
  cancelled: () => `<div class="status-icon warn" aria-hidden="true">!</div><h1>Payment cancelled</h1>
    <p style="margin-inline:auto">No payment was taken. Your basket is still saved for when you're ready.</p>
    <p style="margin-inline:auto;display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="/checkout">Return to checkout</a><a class="btn btn-ghost" href="/basket">View basket</a></p>`,
  demo: (o) => `<div class="notice notice-demo" style="text-align:left"><h2>Demo checkout. No payment has been taken.</h2>
    <p>Stripe is not connected yet, so this page stands in for Stripe's payment page. Nothing has been charged, no order has been placed and stock has not changed.</p>
    <p>With Stripe connected, the customer pays on Stripe's page here, then lands on the confirmation page once Stripe confirms the payment.</p></div>
    <h1>This is where the customer would pay</h1>${summary(o)}
    <p class="small muted" style="margin:1rem auto">This basket was checked and priced on the server and saved in Admin → Orders as a demo record.</p>
    <p style="margin-inline:auto;display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="/cancelled?token=${esc(token)}">See the cancelled-payment page</a><a class="btn btn-ghost" href="/basket">Back to basket</a></p>`,
  error: (msg) => `<div class="status-icon warn" aria-hidden="true">?</div><h1>We can't show this order</h1><p style="margin-inline:auto">${esc(msg)}</p><p style="margin-inline:auto"><a class="btn btn-primary" href="/shop">Back to the shop</a></p>`,
};

async function run() {
  if (view === 'cancelled') { root.innerHTML = views.cancelled(); return; }
  try {
    let o = await api(`/api/order-status?token=${encodeURIComponent(token)}`);
    if (o.status === 'demo') { root.innerHTML = views.demo(o); return; }
    if (view === 'demo-checkout') { location.replace(`/success?token=${encodeURIComponent(token)}`); return; }
    // Success page: only the webhook-confirmed status counts. Poll briefly while Stripe notifies us.
    for (let i = 0; i < 10 && o.status === 'pending'; i++) {
      if (i === 0) root.innerHTML = views.confirming(o);
      await wait(1500 + i * 300);
      o = await api(`/api/order-status?token=${encodeURIComponent(token)}`);
    }
    if (o.status === 'paid') { basket.clear(); try { sessionStorage.removeItem('otr_checkout_details'); } catch {} root.innerHTML = views.paid(o); }
    else if (o.status === 'pending' || o.status === 'review') root.innerHTML = views.confirming(o);
    else root.innerHTML = views.notpaid(o);
  } catch (e) { root.innerHTML = views.error(e.message); }
  root.querySelector('h1')?.setAttribute('tabindex', '-1'); root.querySelector('h1')?.focus({ preventScroll: true });
}
run();
