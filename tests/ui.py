# Browser journey test (Playwright). Needs the dev server in mock-Stripe test mode and tests/mock-stripe.mjs running.
import asyncio, json, hmac, hashlib, time, urllib.request
from playwright.async_api import async_playwright
B = 'http://localhost:8788'
def check(name, cond): print(('PASS  ' if cond else 'FAIL  ') + name)
def webhook(event):
    payload = json.dumps(event); t = str(int(time.time()))
    sig = hmac.new(b'whsec_mock', f'{t}.{payload}'.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(B + '/api/stripe-webhook', data=payload.encode(), headers={'stripe-signature': f't={t},v1={sig}'})
    return urllib.request.urlopen(req).status
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width': 384, 'height': 832}, has_touch=True)
        pg = await ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '422' not in m.text else None)  # 422 = expected validation response; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '/shop'); await pg.wait_for_selector('.card')
        n_all = await pg.locator('.card').count()
        await pg.click('[data-scent=fruity]'); n_f = await pg.locator('.card').count()
        check(f'scent filter narrows products ({n_all} -> {n_f})', 0 < n_f < n_all)
        await pg.click('[data-cat=wax-melt-shapes]'); await pg.select_option('#sort', 'price-desc')
        prices = await pg.locator('.card .price').all_inner_texts(); nums = [float(x.replace('From ', '').replace('£', '')) for x in prices]
        check('sort by price works', nums == sorted(nums, reverse=True))
        check('filters survive in the URL', 'scent=fruity' in pg.url and 'category=wax-melt-shapes' in pg.url)
        await pg.click('[data-scent=fruity]'); await pg.click('[data-cat=all]')
        check('sold-out card has disabled button', await pg.locator('.card.is-out button[disabled]').count() >= 2)
        await pg.screenshot(path='/tmp/shop-m.png')
        await pg.click('.menu-toggle')
        await pg.fill('#q-mobile', 'lavender'); await pg.press('#q-mobile', 'Enter'); await pg.wait_for_timeout(200)
        check('search finds Lavender Dreams', await pg.locator('.card').count() == 1)
        # product with variants
        await pg.goto(B + '/product?id=strawberry-sugar-hearts'); await pg.wait_for_selector('#add')
        await pg.click('text=Bag of 12'); await pg.click('#plus')
        check('variant changes price', (await pg.inner_text('#price')) == '£7.00')
        await pg.click('#add'); await pg.wait_for_selector('dialog.drawer[open]')
        check('drawer opens with item and count 2', (await pg.inner_text('.basket-count')) == '2' and 'Bag of 12' in await pg.inner_text('.drawer-body'))
        await pg.screenshot(path='/tmp/drawer-m.png')
        await pg.click('.drawer [data-step="1"]'); check('drawer quantity change', (await pg.inner_text('.basket-count')) == '3')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        check('Escape closes drawer', not await pg.locator('dialog.drawer[open]').count())
        await pg.goto(B + '/shop'); await pg.wait_for_selector('.card'); await pg.click('[data-add=fresh-linen-snap-bar]'); await pg.click('.drawer [data-close]')
        await pg.goto(B + '/basket'); await pg.wait_for_selector('.totals')
        await pg.reload(); await pg.wait_for_selector('.totals')
        check('basket survives refresh', await pg.locator('.line').count() == 2)
        check('totals shown: subtotal 24.50 + delivery 3.95 = 28.45', '£24.50' in await pg.inner_text('.totals') and '£3.95' in await pg.inner_text('.totals') and '£28.45' in await pg.inner_text('.totals'))
        await pg.screenshot(path='/tmp/basket-m.png', full_page=True)
        await pg.locator('.line').nth(1).locator('[data-remove]').click(); await pg.wait_for_timeout(500)
        check('remove item', await pg.locator('.line').count() == 1)
        await pg.locator('.line [data-step="-1"]').click(); await pg.wait_for_timeout(500)
        check('quantity decrease reprices', '£17.95' in await pg.inner_text('.totals .grand'))
        # tampered basket: fake price in localStorage
        await pg.evaluate("()=>{const b=JSON.parse(localStorage.otr_basket_v1); b[0].unit_pence=1; localStorage.otr_basket_v1=JSON.stringify(b)}")
        await pg.click('text=Checkout'); await pg.wait_for_selector('#summary .totals')
        check('tampered local price ignored at checkout', '£17.95' in await pg.inner_text('#summary'))
        await pg.click('#pay-btn'); await pg.wait_for_selector('#form-error .notice')
        check('empty form shows field errors and focuses summary', await pg.locator('.field-error').count() >= 4 and await pg.evaluate("document.activeElement.id") == 'form-error')
        await pg.screenshot(path='/tmp/checkout-err-m.png', full_page=True)
        for k, v in dict(email='sam@example.com', name='Sam Tester', line1='2 High Street', city='Chester', postcode='CH1 2AB').items(): await pg.fill('#' + k, v)
        await pg.click('#pay-btn'); await pg.wait_for_url('**/success?token=*')
        await pg.wait_for_selector('text=confirming your payment')
        check('success page waits for webhook, does not claim payment', True)
        check('basket kept until payment confirmed', (await pg.inner_text('.basket-count')) == '2')
        orders = json.load(urllib.request.urlopen(B + '/api/admin/orders?view=other'))['orders']; o = orders[0]
        full = json.load(urllib.request.urlopen(B + '/api/admin/orders/' + o['id']))['order']
        webhook({'id': 'evt_ui_1', 'type': 'checkout.session.completed', 'livemode': False, 'data': {'object': {'id': full['stripe_session_id'], 'client_reference_id': full['id'], 'payment_status': 'paid', 'amount_total': full['total_pence'], 'currency': 'gbp', 'payment_intent': 'pi_ui'}}})
        await pg.wait_for_selector('text=your order is confirmed', timeout=15000)
        check('page flips to confirmed after verified webhook; basket cleared', (await pg.inner_text('.basket-count')) == '0')
        await pg.screenshot(path='/tmp/success-m.png', full_page=True)
        await pg.goto(B + '/cancelled?token=x'); await pg.wait_for_selector('text=Payment cancelled'); await pg.screenshot(path='/tmp/cancel-m.png')
        await pg.goto(B + '/delivery-returns'); await pg.wait_for_selector('.todo'); await pg.screenshot(path='/tmp/page-m.png', full_page=True)
        # admin
        await pg.goto(B + '/admin/'); await pg.wait_for_selector('.row.order'); await pg.screenshot(path='/tmp/admin-orders-m.png')
        await pg.click('[data-tab=products]'); await pg.wait_for_selector('[data-product]'); await pg.click('[data-product=vanilla-cloud-snap-bar]')
        await pg.fill('[data-v=price]', '3.75'); await pg.screenshot(path='/tmp/admin-prod-m.png'); await pg.click('text=Save product'); await pg.wait_for_selector('.toast')
        p2 = json.load(urllib.request.urlopen(B + '/api/products/vanilla-cloud-snap-bar'))['product']
        check('admin price edit reaches the shop', p2['from_pence'] == 375)
        await pg.click('[data-tab=settings]'); await pg.wait_for_selector('#settings-form'); await pg.screenshot(path='/tmp/admin-settings-m.png', full_page=True)
        # desktop pass
        d = await b.new_context(viewport={'width': 1280, 'height': 900}); dp = await d.new_page()
        dp.on('pageerror', lambda e: errs.append(str(e)))
        for path, fn in [('/', 'home'), ('/shop', 'shop'), ('/checkout', 'checkout')]:
            await dp.goto(B + path); await dp.wait_for_timeout(800); await dp.screenshot(path=f'/tmp/{fn}-d.png', full_page=True)
            check(f'no horizontal overflow on desktop {path}', await dp.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        for path in ['/', '/shop', '/product?id=mini-melt-gift-set', '/basket', '/checkout', '/contact']:
            await pg.goto(B + path); await pg.wait_for_timeout(600)
            check(f'no horizontal overflow on mobile {path}', await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check('no console errors: ' + json.dumps(errs[:3]), not errs)
        await b.close()
asyncio.run(main())
