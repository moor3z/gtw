# Over The Rainbow — wax melts shop

A small, complete ecommerce site: storefront, basket, Stripe Checkout, order storage, admin area.

**Stack:** plain HTML/CSS/JS storefront (no build step) + Cloudflare Pages Functions for the server side + Cloudflare D1 (SQLite) for products, orders and settings. No npm dependencies. Upload the folder to GitHub, connect it to Cloudflare Pages, done.

```
public/      the website (HTML, CSS, JS, logo, fonts, sample images) + /admin
functions/   server endpoints (/api/*, /img/*) — run on Cloudflare, never sent to the browser
server/      shared server code: database, pricing, Stripe, email, admin auth
server/seed.js   ← ALL SAMPLE PRODUCTS, PRICES AND PLACEHOLDER COPY LIVE HERE
tests/       automated checks (optional, dev only)
tools/       script that drew the sample product images (dev only)
```

## Sample data: what is fake

Everything in `server/seed.js` is placeholder: the 16 products, their prices, weights and stock, the £3.95 delivery charge, the £30 free-delivery threshold, the dispatch estimate, and the homepage "about" text. It is inserted once, into an empty database. In the admin area sample products carry a yellow **Sample** tag, and Products has a **Delete all sample products** button. Saving an edited product removes its tag. You never need to touch code to change the catalogue.

## Set up (all in the browser, about 20 minutes)

### 1. Put it on GitHub
Create a repo and upload the contents of this folder (keep the folder structure; upload from a computer so folders drag in intact).

### 2. Create the database
Cloudflare dashboard → **Storage & Databases → D1 → Create database**. Name it `otr-shop`. Leave it empty; the site creates its tables and sample data on first visit.

### 3. Create the Pages project
**Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
- Framework preset: **None**
- Build command: *(leave blank)*
- Build output directory: **`public`**

Then **Settings → Bindings → Add → D1 database**: variable name **`DB`** (exactly), database `otr-shop`. Redeploy (Deployments → ⋯ → Retry deployment).

The shop now works in **demo mode**: you can browse, fill a basket and walk through checkout, and a yellow bar says payments are not connected. No payment is taken or faked.

### 4. Turn on admin sign-in (Cloudflare Access)
Admin login is handled by Cloudflare Access (free for up to 50 users), not by home-made passwords.
1. **Zero Trust → Access → Applications → Add → Self-hosted.**
2. Add two public hostnames on your shop domain: path **`admin`** and path **`api/admin`**.
3. Policy: **Allow → Emails →** your email address(es). Login method: one-time PIN is fine.
4. After saving, open the application and copy its **Application Audience (AUD) tag**.
5. Your team domain is shown in Zero Trust → Settings → Custom Pages (looks like `yourname.cloudflareaccess.com`).
6. In the Pages project add variables `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`, then redeploy.

Visit `/admin/`. The server checks the signed Access token on every admin request, so if Access is missing or mis-set the admin API refuses to answer rather than opening up.

### 5. Connect Stripe (test mode first)
1. Stripe dashboard in **Test mode** → Developers → API keys → copy the **Secret key** (`sk_test_…`).
2. Developers → Webhooks → **Add endpoint**: `https://YOUR-DOMAIN/api/stripe-webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
3. Copy that endpoint's **Signing secret** (`whsec_…`).
4. Pages → Settings → Variables and Secrets → add both **as secrets** (see table), redeploy.
5. Settings → Payment methods in Stripe: enable Apple Pay / Google Pay / Link if you want them. The site lets Stripe choose eligible methods automatically.

The bar now reads "Test mode". Pay with card `4242 4242 4242 4242`, any future date, any CVC. Try `4000 0000 0000 0002` for a declined card.

Going live later = swap in the live secret key and a live-mode webhook secret. The bar disappears.

### 6. Order emails (optional)
Create a [Resend](https://resend.com) account, verify your domain, then add `RESEND_API_KEY` and `EMAIL_FROM`. Customers get a confirmation when payment is confirmed; add an address under Admin → Delivery & settings → "Send new-order alerts to" to get a copy yourself.

## Environment variables

| Name | Needed for | Notes |
|---|---|---|
| `DB` (binding, not a variable) | everything | D1 database binding |
| `STRIPE_SECRET_KEY` | payments | Secret. `sk_test_…` = test mode, `sk_live_…` = live. Missing = demo mode |
| `STRIPE_WEBHOOK_SECRET` | payments | Secret. `whsec_…` from the webhook endpoint. Missing = demo mode |
| `ACCESS_TEAM_DOMAIN` | admin | e.g. `yourname.cloudflareaccess.com` |
| `ACCESS_AUD` | admin | AUD tag of the Access application |
| `RESEND_API_KEY` | emails | Secret. Optional |
| `EMAIL_FROM` | emails | e.g. `Over The Rainbow <orders@your-domain.co.uk>` |
| `ADMIN_DEV_BYPASS` | local dev only | `true` skips Access, and only on `localhost`. Do not set in production |

No key is ever sent to the browser; the storefront uses no Stripe publishable key because payment happens on Stripe's hosted page.

## How payment safety works

- The browser sends only variant IDs and quantities. `server/pricing.js` looks up names, prices, stock and delivery in the database; any totals sent by the browser are ignored.
- An order row is saved as `pending` before the customer is sent to Stripe.
- Only a **signature-verified** webhook can mark an order `paid` (`functions/api/stripe-webhook.js`). The success page just reads the order's status and waits; visiting it changes nothing.
- Paid-marking and stock deduction run in one database transaction guarded by a `stock_deducted` flag, so repeated or simultaneous webhook deliveries produce one paid order and one deduction.
- If Stripe reports a different amount or currency from the saved order, the order goes to `review` instead of `paid`.
- Order data is only readable through the Access-protected admin API. The public order-status lookup needs a random 48-character token and returns no address and only a masked email.

## Day-to-day

Admin → **Orders** (paid orders, set fulfilment status, private notes) · **Products** (add/edit, photos, prices, options, stock, hide, mark sold out, feature on homepage) · **Delivery & settings** (delivery charge, free-delivery threshold, dispatch estimate, homepage wording, business details) · **Pages** (Contact, Delivery & returns, Privacy, Terms).

Photos are resized to 1200px WebP in the browser before upload and stored in the database, so no separate image hosting is needed.

Categories and scent filters are defined once in `server/db.js` (`CATEGORIES`, `SCENTS`) and mirrored at the top of `public/assets/js/admin.js`.

## Updating design files (cache-busting)

Every page loads its CSS and JS with a version number (`site.css?v=5`). When any file in `public/assets/css` or `public/assets/js` changes, raise the number so browsers fetch the new files straight away: `python3 tools/bump_version.py 6`. Updates supplied as zips already have this done.

Category tile photos live in `public/assets/img/cat/` (`snap-bars.webp`, `wax-melt-shapes.webp`, `sample-boxes.webp`, `gift-sets.webp`, `accessories.webp`). Replace a file with the same name to swap a photo.

## What was tested, and what was not

Run here against Cloudflare's local runtime (`wrangler pages dev`) with a local stand-in for Stripe's API:
- `tests/run.mjs` — 34 checks: manipulated prices ignored, sold-out / hidden / over-stock / unknown items refused, UK-only, forged and stale webhooks rejected, verified webhook → exactly one paid order, replayed and parallel webhooks don't double-deduct stock, amount mismatch held for review, expiry and unpaid handling, admin CSRF guards.
- `tests/ui.py` — browser journey at phone and desktop sizes: filter, sort, search, choose option, add to basket, change quantity, remove, refresh keeps basket, form errors, checkout, success page waits for the webhook then confirms, admin edit reaches the shop, no sideways scrolling.
- Admin API returns 401 with no token, a junk token, or an `alg: none` token.

**Not tested here:** a payment against the real Stripe test API, and a real Cloudflare deployment (this sandbox cannot reach either). Do one test purchase with `4242…` after step 5 and confirm the order appears under Admin → Orders as **paid (test)**.

To re-run locally: `npx wrangler pages dev public --d1 DB -b ADMIN_DEV_BYPASS=true -b STRIPE_SECRET_KEY=sk_test_mock -b STRIPE_WEBHOOK_SECRET=whsec_mock -b STRIPE_API_BASE=http://localhost:8799`, then `node tests/run.mjs`.

## Before launch you need to supply

1. **Real products**: names, descriptions, photos, prices, stock, weights.
2. **Per-product usage and safety text**, including any hazard/allergen labelling your scents require. All current text is a marked placeholder; nothing has been claimed about ingredients.
3. **Business details**: trading/legal name, geographic address, contact email (and phone if wanted).
4. **Delivery**: real charge, free-delivery threshold (or none), courier, dispatch times.
5. **Policies**: returns and cancellations, privacy policy, terms. Each page lists what it needs and shows a "placeholder" notice until you untick it in Admin → Pages.
6. **VAT position**: the site says nothing about VAT until you add it to Terms.
7. **Accounts**: Stripe (activated for live payments), a domain on Cloudflare, Resend if you want emails.
8. **The "about" paragraph** for the homepage.
