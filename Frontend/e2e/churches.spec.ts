import { expect, test } from '@playwright/test'

// The three pilot churches have authored models, so each church page shows its planta and alzado, drawn from the model.
test.beforeEach(async ({ page }) => {
  await page.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
})

for (const [name, rx] of [['the cathedral', /Catedral/], ['Jesús', /Jesús/], ['Santa Lucía', /Santa Lucía/]] as const) {
  test(`${name}: the church page shows its planta and alzado with their size in metres`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Iglesias de Mérida' }).getByRole('button', { name: rx }).click()
    const plates = page.getByRole('region', { name: 'Planta y alzado' })
    await expect(plates).toBeVisible({ timeout: 45_000 })
    await expect(plates.getByRole('img', { name: /^Planta: \d+ por \d+ metros$/ })).toBeVisible()
    await expect(plates.getByRole('img', { name: /^Alzado: \d+ por \d+ metros$/ })).toBeVisible()
  })
}
