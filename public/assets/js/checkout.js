import { api, basket, gbp, esc, $ } from './site.js?v=5';
import { totalsHtml } from './basket.js?v=5';

const form = $('#checkout-form'), btn = $('#pay-btn'), errBox = $('#form-error');
const SAVED = 'otr_checkout_details';

if (!basket.read().length) {
  $('#checkout-root').innerHTML = `<div class="empty"><h2>Your basket is empty</h2><p>Add something to your basket before checking out.</p><a class="btn btn-primary" href="/shop">Shop Wax Melts</a></div>`;
} else {
  // Restore details if the customer comes back from a cancelled payment (this tab only)
  try { const saved = JSON.parse(sessionStorage.getItem(SAVED) || '{}'); for (const [k, v] of Object.entries(saved)) if (form[k]) form[k].value = v; } catch {}

  api('/api/config').then((c) => {
    if (c.payment_mode === 'demo') { btn.textContent = 'Continue to demo checkout'; $('#pay-note').textContent = 'Demo mode: payments are not connected, so no payment will be taken and no order will be placed.'; }
  }).catch(() => {});

  api('/api/quote', { method: 'POST', body: JSON.stringify({ items: basket.payload() }) }).then((q) => {
    if (!q.ok) { location.replace('/basket'); return; }
    $('#summary').innerHTML = `<ul class="lines">${q.lines.map((l) => `<li style="display:flex;justify-content:space-between;gap:1rem;padding:.5rem 0"><span>${esc(l.name)}${l.label ? ` <span class="muted">(${esc(l.label)})</span>` : ''} × ${l.qty}</span><strong>${gbp(l.line_pence)}</strong></li>`).join('')}</ul>${totalsHtml(q)}`;
  }).catch((e) => { $('#summary').innerHTML = `<p class="field-error">${esc(e.message)}</p>`; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const customer = Object.fromEntries(new FormData(form)); customer.country = 'GB';
    try { sessionStorage.setItem(SAVED, JSON.stringify(customer)); } catch {}
    btn.classList.add('is-loading'); btn.disabled = true;
    try {
      const out = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ customer, items: basket.payload() }) });
      location.assign(out.url);
    } catch (err) {
      btn.classList.remove('is-loading'); btn.disabled = false;
      if (err.status === 409) { location.assign('/basket'); return; }
      showErrors(err.message, err.data?.fields || {});
    }
  });
}

function clearErrors() {
  errBox.innerHTML = '';
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  form.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
}
function showErrors(message, fields) {
  const names = Object.keys(fields);
  errBox.innerHTML = `<div class="notice notice-error"><h2>${esc(message)}</h2>${names.length ? `<ul style="margin:0;padding-left:1.25rem">${names.map((n) => `<li><a href="#${n}">${esc(fields[n])}</a></li>`).join('')}</ul>` : ''}</div>`;
  for (const n of names) {
    const input = form[n]; if (!input) continue;
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `${n}-error`);
    input.insertAdjacentHTML('afterend', `<p class="field-error" id="${n}-error">${esc(fields[n])}</p>`);
  }
  errBox.focus(); errBox.scrollIntoView({ block: 'center' });
}
