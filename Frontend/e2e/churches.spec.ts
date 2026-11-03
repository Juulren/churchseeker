import { expect, test } from '@playwright/test'

// Each pilot church opens its page with a 3D stage that is named after it, and nothing throws while it loads.
test.beforeEach(async ({ page }) => {
  await page.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
})

for (const [name, rx] of [['the cathedral', /Catedral/], ['Jesús', /Jesús/], ['Santa Lucía', /Santa Lucía/]] as const) {
  test(`${name}: the church page shows its stage, named after the church`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Iglesias de Mérida' }).getByRole('button', { name: rx }).click()
    await expect(page.getByRole('img', { name: /^Modelo 3D de / })).toBeVisible({ timeout: 45_000 })
    expect(errors).toEqual([])
  })
}
