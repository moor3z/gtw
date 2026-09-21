import { api, getConfig, esc, $ } from './site.js?v=5';

// Tiny safe formatter for the editable pages: "## Heading", "- list item",
// blank line = new paragraph. Everything is escaped first; no HTML is allowed in.
export function format(body) {
  const mark = (t) => esc(t).replace(/\[TO COMPLETE BEFORE LAUNCH:([^\]]*)\]/g, '<span class="todo">To complete before launch:$1</span>');
  return body.replace(/\r/g, '').split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) return '';
    let html = '', list = [], para = [];
    const flush = () => { if (list.length) { html += `<ul>${list.map((l) => `<li>${mark(l)}</li>`).join('')}</ul>`; list = []; } if (para.length) { html += `<p>${para.map(mark).join('<br>')}</p>`; para = []; } };
    for (const l of lines) {
      if (l.startsWith('## ')) { flush(); html += `<h2>${mark(l.slice(3))}</h2>`; }
      else if (/^[-*] /.test(l)) { if (para.length) flush(); list.push(l.slice(2)); }
      else { if (list.length) flush(); para.push(l); }
    }
    flush(); return html;
  }).join('');
}

const root = $('#page-root');
if (root) Promise.all([api(`/api/page/${root.dataset.slug}`), getConfig()]).then(([{ page }, cfg]) => {
  document.title = `${page.title} | Over The Rainbow`;
  let extra = '';
  if (root.dataset.slug === 'contact') {
    const rows = [];
    if (cfg.contact_email) rows.push(`<p><strong>Email</strong><br><a href="mailto:${esc(cfg.contact_email)}">${esc(cfg.contact_email)}</a></p>`);
    if (cfg.contact_phone) rows.push(`<p><strong>Phone</strong><br><a href="tel:${esc(cfg.contact_phone.replace(/\s/g, ''))}">${esc(cfg.contact_phone)}</a></p>`);
    if (cfg.business_address) rows.push(`<p><strong>Address</strong><br>${esc(cfg.business_address).replace(/\n/g, '<br>')}</p>`);
    extra = rows.length ? `<div class="intro" style="margin-top:1.5rem">${rows.join('')}</div>` : '';
  }
  root.innerHTML = `<h1>${esc(page.title)}</h1>
    ${page.needs_review ? `<div class="notice notice-demo"><p><strong>Placeholder page.</strong> This content still needs completing before launch. Edit it in Admin → Pages.</p></div>` : ''}
    ${format(page.body)}${extra}`;
}).catch((e) => { root.innerHTML = `<h1>Page unavailable</h1><div class="notice notice-error" role="alert"><p>${esc(e.message)}</p></div>`; });
