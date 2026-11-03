import { expect, test } from '@playwright/test'

// Ornaments and the Asciify pairing must never get in the way: real text stays, links stay clickable, and an unknown
// address leads back to the map.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#' }

test.beforeEach(async ({ page }) => {
  await page.route('https://server.arcgisonline.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }))
})

test.describe('ornaments', () => {
  test('an unknown address shows 404 in characters, and the link leads back to the map', async ({ page }) => {
    await page.goto('/#/este-camino-no-existe')
    await expect(page.getByRole('heading', { level: 1, name: 'Este camino no existe' })).toBeVisible()
    // The numerals are decoration: the message and the button are the HTML around them.
    await expect(page.locator('.notfound-art')).toHaveAttribute('aria-hidden', 'true')
    await page.getByRole('link', { name: 'Volver al mapa' }).click()
    await expect(page.getByRole('navigation', { name: 'Iglesias de Mérida' })).toBeVisible()
  })

  test('every ornament on a page is decoration: hidden, never focusable, never taking the pointer', async ({ page }) => {
    // The screen shown when the list of churches cannot load carries the lost-road ornaments.
    await page.route('**/api/public/churches', (r) => r.fulfill({ status: 502, body: 'Bad Gateway' }))
    await page.goto('/')
    await expect(page.locator('.ornament').first()).toBeVisible()
    const bad = await page.evaluate(() => [...document.querySelectorAll('.ornament')].filter((e) => e.getAttribute('aria-hidden') !== 'true' || e.getAttribute('focusable') !== 'false' || getComputedStyle(e).pointerEvents !== 'none').length)
    expect(bad).toBe(0)
  })

  test('the admin menu keeps its real links while they scramble on hover, and they still work', async ({ page }) => {
    await page.goto('/#/login')
    await page.getByLabel('Correo').fill(ADMIN.email)
    await page.getByLabel('Contraseña').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Panel' })).toBeVisible()
    const link = page.getByRole('link', { name: 'Miembros' })
    await link.hover()
    await expect(link).toHaveText('Miembros')
    await link.click()
    await expect(page.getByRole('heading', { level: 2, name: 'Miembros' })).toBeVisible()
  })

  test('the sign-in form works inside its arch', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.getByRole('heading', { name: 'Acceso del personal' })).toBeVisible()
    await page.getByLabel('Correo').fill('no-es-un-correo')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Correo no válido.')).toBeVisible()
  })
})
