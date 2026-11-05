import { expect, test, type Page } from '@playwright/test'

// The history of a church: written by its administrator, shown first on its public page.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }

test.beforeEach(async ({ page }) => {
  await page.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
})

async function openChurch(page: Page, name: RegExp) {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Iglesias de Mérida' }).getByRole('button', { name }).click()
  await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 })
}

test.describe('church history', () => {
  test('the public page of a church starts with its history, before events and notices', async ({ page }) => {
    await openChurch(page, /Jesús/)
    const titles = page.locator('main h3, h3.rpg-title')
    await expect(page.getByRole('heading', { level: 3, name: 'Historia' })).toBeVisible({ timeout: 30_000 })
    // Historia comes first among the sections of the right column.
    const order = await page.getByRole('heading', { level: 3 }).allTextContents()
    expect(order.indexOf('Historia')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('Historia')).toBeLessThan(order.indexOf('Próximos eventos'))
    expect(order.indexOf('Historia')).toBeLessThan(order.indexOf('Avisos'))
    await expect(page.getByText('Compañía de Jesús')).toBeVisible()
    await expect(page.getByText('1618')).toBeVisible()
    void titles
  })

  test('an administrator writes the history in Configuración and the public page shows it as plain text', async ({ page, browser }) => {
    await page.goto('/#/login')
    await page.getByLabel('Correo').fill(ADMIN.email)
    await page.getByLabel('Contraseña').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    await page.getByRole('link', { name: 'Configuración' }).click()
    const field = page.getByLabel('Historia de la iglesia')
    const original = await field.inputValue()
    const text = `Primer párrafo de prueba ${Date.now().toString(36)}.\n\nSegundo párrafo con **asteriscos** y un & comercial.`
    try {
      await field.fill(text)
      await page.getByRole('button', { name: 'Guardar configuración' }).click()
      await expect(page.getByText('Configuración guardada.')).toBeVisible()

      // Markup is refused, not stored.
      await field.fill('<img src=x onerror=alert(1)>')
      await page.getByRole('button', { name: 'Guardar configuración' }).click()
      await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible()

      // A visitor sees the saved text, paragraph by paragraph, with nothing interpreted.
      const visitor = await (await browser.newContext()).newPage()
      await visitor.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
      await openChurch(visitor, /Catedral/)
      await expect(visitor.getByText(/Primer párrafo de prueba/)).toBeVisible({ timeout: 30_000 })
      await expect(visitor.getByText('Segundo párrafo con **asteriscos** y un & comercial.')).toBeVisible()
      await visitor.context().close()
    } finally {
      // Put the church's own text back.
      await page.getByLabel('Historia de la iglesia').fill(original)
      await page.getByRole('button', { name: 'Guardar configuración' }).click()
      await expect(page.getByText('Configuración guardada.')).toBeVisible()
    }
  })
})
