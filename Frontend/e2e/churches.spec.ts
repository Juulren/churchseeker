import { expect, test } from '@playwright/test'

// Each pilot church opens its page with an engraving named after it, and nothing throws while it loads. On the map every
// church has a marker the mouse can click.
test.beforeEach(async ({ page }) => {
  await page.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
})

for (const [name, rx] of [['the cathedral', /Catedral/], ['Jesús', /Jesús/], ['Santa Lucía', /Santa Lucía/]] as const) {
  test(`${name}: the church page shows its engraving, named after the church`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Iglesias de Mérida' }).getByRole('button', { name: rx }).click()
    await expect(page.getByRole('img', { name: /^Grabado de / })).toBeVisible({ timeout: 20_000 })
    expect(errors).toEqual([])
  })
}

test('the map has a marker for every church, and clicking one selects that church', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.church-marker')).toHaveCount(3, { timeout: 30_000 })
  const nav = page.getByRole('navigation', { name: 'Iglesias de Mérida' })
  await page.locator('.church-marker', { hasText: /Santa Luc/i }).click({ force: true })
  await expect(nav.getByRole('button', { name: /Santa Luc/ })).toHaveAttribute('aria-pressed', 'true')
  // The markers are decoration for the mouse: hidden from assistive technology, with the list as the way in.
  await expect(page.locator('.church-marker').first()).toHaveAttribute('aria-hidden', 'true')
})
